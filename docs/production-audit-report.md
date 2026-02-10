# Аудит production-ready: editor + bridge/importOutZip flow

Дата: 2026-02-10  
Репозиторий: `/workspace/editor`

## 0) Tree проекта + краткая карта компонентов

### Укрупнённая структура (по факту в репозитории)

- `app/` — Next.js App Router, UI + API routes.
  - `app/api/convert-pptx/route.ts` — proxy в converter (`/convert`).
  - `app/api/bridge/convert-from-url/route.ts` — bridge endpoint (скачать PPTX по URL -> отдать jobId/token для out.zip).
  - `app/api/bridge/outzip/[jobId]/route.ts` — выдача out.zip по token/jobId с TTL/лимитом скачиваний.
  - `app/api/admin/enable-import/route.ts` — включение admin-cookie для импорта PPTX.
- `src/lib/import/*` — импорт/валидация `doc.json`, распаковка `out.zip`, маппинг в state редактора.
- `src/lib/project/exportProjectZip.ts` — обратная сборка `out.zip`.
- `src/lib/bridge/store.ts` — временное хранение `out.zip` (диск + in-memory Map метаданных job).
- `components/*` + `app/page.tsx` — редактор, import/export, undo/redo, auto-import bridge.
- `Dockerfile`, `docker-compose.yml` — деплой editor + внешний converter image.
- `.github/workflows/CI` — lint/typecheck/build/test.

### Что **не найдено** в этом репозитории

- Исходники converter-сервиса (очередь, LibreOffice/pdftoppm orchestration, retries, queue tuning, worker limits) — в репозитории есть только интеграция через HTTP proxy (`CONVERTER_URL`).
- Механизм долгосрочного сохранения проектов (autosave/reopen backend + storage + auth).

---

## 1) Executive summary

1. **P0: потенциальный XSS в редакторе** — текст из импортируемого `doc.json` попадает в `dangerouslySetInnerHTML` без санитизации.
2. **P0: SSRF защита в bridge неполная** — нет allowlist доменов; есть TOCTOU/redirect gap (проверяется исходный URL, но не каждый redirect hop).
3. **P0: bridge state хранится в памяти процесса** — рестарт/масштабирование на несколько инстансов ломают `jobId` (404), что критично для production reliability.
4. Нет rate limiting и anti-abuse на `convert-from-url` / `outzip`; brute force + DoS риски.
5. Импорт ZIP использует `unzipSync` без лимитов на распакованный объём/число файлов (риск zip bomb / UI freeze).
6. Отсутствует полноценная observability: нет метрик, trace/span, единого requestId по всем hop'ам, health/readiness для bridge/converter connectivity.
7. Нет production data-layer для autosave/reopen: только in-memory state + ручной download `out.zip`.
8. CI запускает `typecheck`, но он падает из-за конфликтующих React typings (`components/node_modules`) — качество gate неполный.
9. В UX bridge-import есть утечка чувствительного URL в client console (token в query логируется).
10. Security hardening неполный: отсутствуют CSP/доп. security headers и формальная валидация env/secrets.

---

## 2) Детальный аудит по категориям

## Security

### S-1. P0 — XSS через импортированный текст
- **Где:** `components/text-element-view.tsx` (`dangerouslySetInnerHTML`), источник `element.content` приходит из `doc.json` через mapping (`mapImporterToEditor`).
- **Почему риск:** злоумышленник может внедрить HTML с обработчиками (`onerror`, `svg/onload`, и т.п.) в текстовые элементы импортируемого файла; bridge позволяет загружать PPTX из внешнего URL, что расширяет поверхность атаки.
- **Фикс (точечно):**
  1) Убрать `dangerouslySetInnerHTML` для plaintext-режима и рендерить текст безопасно (`white-space: pre-wrap`).
  2) Если нужен rich text — санитизировать через whitelist sanitizer (DOMPurify в strict profile, forbid event attrs/style urls).
  3) На этапе импорта дополнительно нормализовать/экранировать текст.
- **Diff-план (псевдо):**
  ```tsx
  // вместо dangerouslySetInnerHTML
  const safeText = element.content
  <div>{safeText}</div>
  // либо sanitizeHtml(element.content, policy)
  ```

### S-2. P0 — SSRF: нет allowlist + redirect/dns-rebinding gap
- **Где:** `app/api/bridge/convert-from-url/route.ts` (`assertPublicUrl`, `downloadPptx`).
- **Почему риск:**
  - проверяется исходный host, но `fetch(... redirect: "follow")` может уйти на иной host/IP без повторной SSRF-проверки;
  - нет domain allowlist (по требованию commercial-grade это часто обязательно);
  - есть TOCTOU (DNS lookup отдельно, затем новый resolve внутри fetch).
- **Фикс:**
  1) Ввести `BRIDGE_ALLOWED_HOSTS`/`BRIDGE_ALLOWED_DOMAINS` (строгий allowlist).
  2) Запретить auto-follow редиректов (`redirect: "manual"`) и валидировать каждый `Location` hop отдельно.
  3) Проверять не только private IP, но и carrier-grade / benchmark / documentation ranges; блокировать `*.internal`, `*.local`.
  4) Ограничить max redirect hops (например 3).

### S-3. P1 — Нет проверки content-type скачанного PPTX
- **Где:** `downloadPptx` в `app/api/bridge/convert-from-url/route.ts`.
- **Почему риск:** сейчас проверяется только размер; злоумышленник может отдать произвольный бинарник/HTML.
- **Фикс:**
  - Проверять `Content-Type` (allowlist MIME + fallback по magic bytes ZIP/PPTX сигнатуре `PK\x03\x04` + `[Content_Types].xml` уже на converter стороне).

### S-4. P1 — Нет rate limiting/abuse controls на bridge endpoints
- **Где:** `app/api/bridge/convert-from-url/route.ts`, `app/api/bridge/outzip/[jobId]/route.ts`.
- **Почему риск:** brute force токена, выжигание CPU/IO через массовые конверсии/скачивания.
- **Фикс:** Redis-based sliding window rate limit (IP + token + route), плюс circuit breaker на converter errors.

### S-5. P1 — Токен bridge утекает в browser console
- **Где:** `components/auto-import-outzip.tsx` (`console.log` печатает `downloadUrl` с `t=`).
- **Почему риск:** access token остаётся в клиентских логах/скриншотах/RUM-системах.
- **Фикс:** убрать лог токена, маскировать query (`t=***`) в debug.

### S-6. P1 — Admin token передаётся query-параметром
- **Где:** `app/api/admin/enable-import/route.ts` (`?token=...`).
- **Почему риск:** query может попасть в access logs/proxies/history.
- **Фикс:** принимать только header (`X-Admin-Token`) или одноразовый signed nonce flow.

### S-7. P2 — Нет явных security headers/CSP
- **Где:** `app/layout.tsx`, `next.config.mjs`, middleware.
- **Почему риск:** слабее защита от XSS/clickjacking/mime sniffing.
- **Фикс:** добавить CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.

---

## Reliability

### R-1. P0 — In-memory job store ломает HA/рестарты
- **Где:** `src/lib/bridge/store.ts` (`Map<string, BridgeJob>`).
- **Почему риск:** при рестарте editor процесс теряет job metadata; при >1 replica запрос на download может попасть на другой pod и вернуть 404.
- **Фикс:** вынести метаданные job в Redis/Postgres (TTL index), файл out.zip в S3/MinIO; `jobId` -> durable record.

### R-2. P1 — Неатомарный расход download лимита
- **Где:** `app/api/bridge/outzip/[jobId]/route.ts` (сначала `incrementBridgeDownloads`, потом `readBridgeZip`).
- **Почему риск:** если чтение файла упадёт, лимит уже списан.
- **Фикс:** делать increment после успешного stream start или в транзакции с состоянием `in_progress/success`.

### R-3. P1 — Нет retry/timeout policy при вызове converter из bridge/proxy
- **Где:** `convertPptx` в `app/api/bridge/convert-from-url/route.ts`, `app/api/convert-pptx/route.ts`.
- **Почему риск:** единичный transient failure сразу фейлит user flow.
- **Фикс:** bounded retry (например 2 попытки на 5xx/timeout), idempotency key, явный timeout на converter POST.

### R-4. P1 — Синхронная распаковка ZIP на клиенте
- **Где:** `src/lib/import/zipImport.ts` (`unzipSync`).
- **Почему риск:** UI thread блокируется на больших архивах.
- **Фикс:** перейти на async unzip/web worker + прогресс + cancellation.

### R-5. P2 — Нет явной стратегии graceful degradation при converter недоступен
- **Где:** flow `convert-pptx`/bridge.
- **Почему риск:** пользователь получает generic ошибку без recovery-кнопок.
- **Фикс:** retry CTA, статус-сервис, fallback to upload out.zip.

---

## Performance

### P-1. P1 — Полная буферизация больших файлов в память
- **Где:**
  - `downloadPptx`: `response.arrayBuffer()`;
  - `convertPptx`: `response.arrayBuffer()`;
  - `readBridgeZip`: `readFile` целиком.
- **Почему риск:** высокие memory spikes на больших файлах/конкурентной нагрузке.
- **Фикс:** streaming pipeline (ReadableStream/Node stream), backpressure-aware proxying, chunked transfer.

### P-2. P1 — Нет queue/backpressure controls на editor-bridge уровне
- **Где:** `convert-from-url` route.
- **Почему риск:** даже если converter умеет очередь, editor может стать bottleneck по egress/ingress.
- **Фикс:** semaphore/concurrency cap per instance + 429 with Retry-After.

### P-3. P2 — ZIP import лимит только по размеру архива, не по unpacked ratio
- **Где:** `src/lib/import/zipImport.ts` (`MAX_ZIP_BYTES`).
- **Почему риск:** zip bomb с маленьким compressed size и огромным unpacked size.
- **Фикс:** лимит на суммарный uncompressed bytes, max entry count, max entry size.

---

## Observability

### O-1. P1 — Нет unified request correlation end-to-end
- **Где:** requestId читается частично (`x-request-id`) в bridge/proxy, но не генерируется и не прокидывается последовательно для всех запросов.
- **Фикс:** middleware для `X-Request-Id` (генерация если отсутствует), обязательный pass-through в converter и в ответы.

### O-2. P1 — Нет метрик/алертов
- **Где:** отсутствуют counters/histograms/gauges для bridge/import.
- **Фикс:** Prometheus metrics (`bridge_requests_total`, `bridge_conversion_latency_ms`, `download_limit_exceeded_total`, `import_zip_fail_total`, etc.).

### O-3. P2 — Логи частично structured
- **Где:** есть `logStructuredError`, но нет единого logger интерфейса для info/warn/audit.
- **Фикс:** pino/winston JSON logger, включить route/method/status/requestId/user/jobId.

---

## DX / Deploy

### D-1. P1 — Нет централизованной env-валидации
- **Где:** env читаются точечно в функциях (`process.env.*`).
- **Почему риск:** неверные env ловятся только runtime-ошибками.
- **Фикс:** `zod` schema для env на startup + fail-fast.

### D-2. P1 — CI typecheck currently red
- **Где:** `npm run typecheck` падает (конфликт typings из `components/node_modules`).
- **Почему риск:** type safety gate фактически нерабочий.
- **Фикс:** удалить nested `components/node_modules` из репо, унифицировать `@types/react`, добавить CI fail gate и lockfile hygiene.

### D-3. P2 — Нет SCA/SAST/secret scanning в CI
- **Где:** `.github/workflows/CI` только lint/typecheck/build/test.
- **Фикс:** добавить `npm audit` (или osv/snyk/trivy), gitleaks, CodeQL.

---

## Data model / storage

### M-1. P0 — Нет persistence модели проектов (autosave/reopen)
- **Где:** `app/page.tsx` хранит state в памяти браузера, сохранение только через экспорт файла.
- **Почему риск:** потеря данных при refresh/crash/tab-close.
- **Фикс:** внедрить проектную модель (projectId, revisions, assets manifests, ownership, retention).

### M-2. P1 — Нет retention/governance политики для пользовательских данных
- **Где:** не найдено централизованных правил хранения user projects/assets.
- **Фикс:** data lifecycle policy (active + archived + deletion), GDPR/152-ФЗ aligned processes.

---

## UX flows

### U-1. P1 — Нет прогресса long-running conversion/import
- **Где:** `components/import-pptx-dialog.tsx` и auto-import показывают только спиннер.
- **Фикс:** progress states (`uploading`, `converting`, `downloading`, `importing`) + retry/recover CTA.

### U-2. P1 — Нет resume flow после прерывания bridge-import
- **Где:** `components/auto-import-outzip.tsx` очищает query после успеха, но при ошибке нет persisted resume plan.
- **Фикс:** сохранить pending job в sessionStorage + кнопка «Повторить импорт».

### U-3. P2 — Нет предупреждения по лимитам bridge download до запроса
- **Где:** отсутствует UI для TTL/remaining downloads.
- **Фикс:** HEAD preflight + отображение `X-Bridge-Downloads-*` и `expiresAt`.

---

## 3) Обязательная проверка SSRF (bridge/convert-from-url)

Проверено:
- ✅ Протокол ограничен `http/https`.
- ✅ Блокируется `localhost`, private IPv4/IPv6 и DNS resolve на private IP.
- ✅ Есть лимит размера и timeout скачивания.

Не найдено / недостаточно:
- ❌ **Domain allowlist** — не найдена.
- ❌ **Redirect re-validation** на каждом hop — не найдена (используется `redirect: "follow"`).
- ⚠️ **Content-Type validation скачанного файла** — не найдена строгая проверка.
- ⚠️ **TOCTOU hardening** (pin resolved IP / custom DNS agent) — не найдено.

Вывод: SSRF защита частичная, для production необходимо закрыть P0 S-2.

---

## 4) Таблица “Issue / Severity / Fix / Effort”

| Issue | Severity | Fix | Effort |
|---|---|---|---|
| XSS через `dangerouslySetInnerHTML` | P0 | sanitize/remove HTML rendering for imported text | M |
| SSRF: no allowlist + redirect gap | P0 | allowlist + manual redirect validation + stricter IP policy | M |
| In-memory bridge jobs (no HA) | P0 | Redis/Postgres metadata + S3/MinIO zip storage | M/L |
| ZIP bomb risk in client unzip | P1 | uncompressed-size / entry-count limits + async unzip | M |
| No rate limiting on bridge | P1 | Redis rate limiter + quotas | S/M |
| Converter retries/timeouts not robust | P1 | timeout + bounded retries + idempotency key | S/M |
| Token leak in client logs | P1 | remove/mask logs | S |
| Admin token in query | P1 | header-only auth | S |
| Missing observability metrics/tracing | P1 | OpenTelemetry + Prometheus + requestId middleware | M |
| No autosave/reopen backend | P0 | project storage APIs + revisioning | L |
| Typecheck broken in CI (typing conflicts) | P1 | remove nested node_modules; unify typings | S/M |
| Missing security headers/CSP | P2 | middleware headers policy | S |

---

## 5) Коммерческий минимум за 7 дней

Цель: чтобы демо/пилот не падали под умеренной нагрузкой и не имели критических дыр.

1. **Закрыть P0 XSS** (S-1): убрать unsafe HTML рендер для импортированного текста.
2. **Закрыть P0 SSRF gap** (S-2): allowlist + manual redirect validation + stricter IP ranges.
3. **Стабилизировать bridge state** (R-1): Redis для job metadata + TTL; out.zip в MinIO/S3.
4. **Ввести rate limiting** (S-4): IP/token limits на convert-from-url/outzip.
5. **Добавить streaming где возможно** (P-1): хотя бы download/serve out.zip через streams.
6. **Исправить CI quality gates** (D-2): typecheck green, remove nested deps conflict.
7. **Минимальная observability** (O-1/O-2): requestId middleware + базовые метрики + health/readiness.
8. **UX recovery**: retry/import resume для bridge ошибок.

Критерий готовности через 7 дней:
- нет известных P0;
- p95 bridge latency и error rate наблюдаемы;
- flow WP->bridge->editor проходит в single/multi-instance стенде;
- typecheck/lint/test green в CI.

---

## 6) Autosave + reopen (архитектура)

## Хранение
- **Документ:** `doc.json` как canonical snapshot.
- **Ассеты:** object storage (S3/MinIO) по ключам `tenant/projectId/revisionId/assets/...`.
- **Метаданные проектов:** Postgres (projects, revisions, collaborators, retention flags).

## Версионирование
- `project` (id, owner, title, createdAt, updatedAt, latestRevisionId)
- `project_revision` (id, projectId, baseRevisionId, docHash, assetManifestHash, createdAt, author)
- оптимистичная блокировка через `If-Match: revisionId`.

## API (минимум)
- `POST /api/projects` — создать проект.
- `GET /api/projects` — список (paging + search).
- `GET /api/projects/:id` — метаданные + latest revision.
- `GET /api/projects/:id/revisions/:revId` — получить `doc.json` + asset manifest.
- `PUT /api/projects/:id` — autosave snapshot (debounced).
- `POST /api/projects/:id/assets/presign` — signed upload URL.
- `GET /api/projects/:id/export/outzip` — собрать out.zip on-demand.

## Защита
- AuthN: JWT/OIDC session + tenant isolation.
- AuthZ: project ACL (owner/editor/viewer).
- Signed URLs short TTL (5–15 min), single-purpose scopes.
- Server-side validation MIME/size/hash для assets.

## Надёжность без потери данных
- Client debounce autosave (2–5s) + `beforeunload` flush best-effort.
- Background sync queue (offline-aware), retry with exponential backoff.
- Conflict resolution: last-write-with-merge prompts + manual compare for divergent revisions.
- Periodic snapshot + operation log (optional CRDT/OT later).

---

## 7) Roadmap

### 1 неделя (stabilization)
- Закрыть P0: XSS, SSRF, bridge durable store.
- Rate limit + requestId middleware + базовые метрики.
- Убрать token leaks/query-token для админ flow.
- Починить typecheck CI.

### 1 месяц (production baseline)
- Autosave/reopen backend + S3/MinIO + Postgres.
- Нагрузочные тесты bridge/import (k6) + SLO/alerts.
- Security hardening (CSP, secret scanning, dependency scanning).
- Улучшение UX прогресса/восстановления импорта.
- Подготовка compliance артефактов (retention policy, incident runbook, backup/restore drills).

---

## Примечания о верификации

- Проверка основана на коде текущего репозитория editor.
- Для converter internal queue/LibreOffice/pdftoppm реализаций в этом репозитории данных нет (**не найдено**).
