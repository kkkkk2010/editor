# pptx
A PPT online editor based on the web terminal ｜ 一款基于web端的ppt在线编辑器

![](demo.gif)

项目完全开源，开源不易，可以点个【star】支持一下哦～

## 技术栈

- Nextjs
- @radix-ui
- tailwindcss
- html2canvas
- recharts
- 自研PPT结构转换算法

## 功能模块

- 多组件支持（图文，形状，表格，可视化图表等）
- 自定义画布
- 动态可配置属性面板
- PPT演示功能
- 组件可视化拖拽
- PPT导出功能

## Импорт JSON (PPTX→JSON)

1. Скопируйте выходные данные импортёра в `public/imports/test1`:
   - `public/imports/test1/doc.json`
   - папки `public/imports/test1/backgrounds` и `public/imports/test1/assets` (если нужны).
2. Запустите проект (`npm run dev`).
3. В редакторе нажмите кнопку **Импорт** в верхней панели.
4. Во вкладке **URL** введите `/imports/test1/doc.json` и подтвердите импорт.

## Проверка round-trip ZIP (PPTX→out.zip→out.zip)

1. Запустите проект (`npm run dev`).
2. В редакторе нажмите кнопку **Импорт** и выберите `out.zip`, полученный из конвертора PPTX→out.zip.
3. Проверьте, что текстовые стили совпадают с исходником (цвет, bold/italic/underline, выравнивание, lineHeight/letterSpacing).
4. Нажмите **Сохранить** → скачайте новый `out.zip`.
5. Снова импортируйте сохранённый `out.zip`.
6. Убедитесь, что:
   - визуально ничего не изменилось по сравнению с первым импортом,
   - цвета, bold/italic/underline и align совпадают,
   - SVG-иконки остаются SVG (не ломаются и не превращаются в PNG),
   - элементы не смещаются из-за потери lineHeight/letterSpacing.


## Docker (production)

### 1) Сборка production-образа Editor

```bash
docker build -t editor:latest .
```

Запуск только editor-контейнера (когда конвертор уже доступен отдельно):

```bash
docker run --rm -p 3000:3000 \
  -e CONVERTER_URL=http://127.0.0.1:3001 \
  -e ADMIN_IMPORT_TOKEN=devtoken \
  -e CONVERTER_MAX_PPTX_BYTES=31457280 \
  -e NEXT_PUBLIC_ENABLE_ADMIN_PPTX_IMPORT=1 \
  editor:latest
```

### 2) Запуск Editor + Converter через Docker Compose

В репозитории есть `docker-compose.yml` с двумя сервисами:
- `editor` (Next.js production, порт `3000` наружу),
- `converter` (по умолчанию `pptx-importer:latest`, доступен editor по внутреннему DNS `http://converter:3001`).

```bash
docker compose up -d --build
```

Если образ конвертора называется иначе, задайте переменную:

```bash
CONVERTER_IMAGE=your-registry/your-converter:latest docker compose up -d --build
```

> `converter` использует только `expose: 3001`, поэтому наружу порт не публикуется.


> Если в runtime-контейнере пропадают API routes (например `/api/bridge/*` даёт HTML 404), проверьте `.dockerignore`: он не должен исключать `app/**`, `src/**`, `components/**`, `public/**`, `middleware.ts`, `next.config.*` и конфиги сборки.

### 3) Переменные окружения для Docker

Для `editor`:
- `CONVERTER_URL` (server-only, для compose по умолчанию `http://converter:3001`)
- `ADMIN_IMPORT_TOKEN` (server-only; если задан, нужен для `POST /api/admin/enable-import?token=...`)
- `CONVERTER_MAX_PPTX_BYTES` (server-only, лимит размера PPTX в байтах)
- `NEXT_PUBLIC_ENABLE_ADMIN_PPTX_IMPORT=1` (client-side, показывает кнопку импорта PPTX в UI)

Для `converter` (минимум):
- `PPTX_IMPORTER_PORT=3001`

### 4) Проверка после запуска

1. Откройте `http://localhost:3000`.
2. Включите cookie для админ-импорта:

   ```bash
   curl -i -X POST "http://localhost:3000/api/admin/enable-import?token=devtoken"
   ```

3. Проверьте, что без cookie прокси закрыт (при заданном `ADMIN_IMPORT_TOKEN`):

   ```bash
   curl -i -X POST http://localhost:3000/api/convert-pptx
   ```

   Ожидается `401 UNAUTHORIZED`.

4. В UI нажмите **Импорт PPTX** и проверьте, что браузер отправляет запрос на same-origin `/api/convert-pptx`, а editor проксирует его в `CONVERTER_URL` (`http://converter:3001` внутри compose-сети).

### Быстрый сценарий для VPS

```bash
# в каталоге editor
export ADMIN_IMPORT_TOKEN='strong-secret'
export CONVERTER_IMAGE='your-registry/pptx-importer:latest'
docker compose pull || true
docker compose up -d --build
curl -I http://localhost:3000
```

## Переменные окружения (PPTX)

- `CONVERTER_URL` (server-only): базовый URL конвертора, который использует `/api/convert-pptx` (локально обычно `http://127.0.0.1:3001`, в Docker Compose — `http://converter:3001`).
- `CONVERTER_MAX_PPTX_BYTES` (server-only): максимальный размер PPTX для прокси `/api/convert-pptx` (по умолчанию 30MB).
- `ADMIN_IMPORT_TOKEN` (server-only): токен, который требуется для включения доступа к `/api/convert-pptx` (см. ниже).
- `NEXT_PUBLIC_ENABLE_ADMIN_PPTX_IMPORT=1`: показывает админскую кнопку **Импорт PPTX** в верхней панели.

### Как включить админ-импорт PPTX

1. Задайте `ADMIN_IMPORT_TOKEN` на сервере (например `ADMIN_IMPORT_TOKEN=dev-secret`).
2. Выполните запрос на `/api/admin/enable-import?token=dev-secret` (POST). Это установит httpOnly cookie `admin_import`.
3. После этого `/api/convert-pptx` будет доступен в браузере. Без cookie эндпоинт вернёт 401/403.

> В проде дополнительно настройте `client_max_body_size` в nginx (или аналогичный лимит) как второй уровень защиты.
> Для проверки лимита можно отправить PPTX больше `CONVERTER_MAX_PPTX_BYTES` и ожидать ответ 413.


关注【趣谈前端】公众号，获取更多技术干货，项目最新进展，和开源实践。

## 在线办公相关解决方案

1. [flowmix/docx多模态文档编辑器](https://flowmix.turntip.cn)
2. [灵语AI文档](https://mindlink.turntip.cn)
3. [H5-Dooring智能零代码平台](https://github.com/MrXujiang/h5-Dooring)

## Bridge (WP→Converter→Editor) для демо

Bridge добавляет same-origin поток:

1. WordPress вызывает `POST /api/bridge/convert-from-url` с `pptxUrl`.
2. Editor на сервере скачивает PPTX по URL, отправляет его в `${CONVERTER_URL}/convert`, получает `out.zip`.
3. `out.zip` временно сохраняется на диске контейнера, а в ответ возвращается ссылка на скачивание с токеном и ограничением по числу загрузок. HEAD-запросы не расходуют лимит скачиваний.
4. Editor UI открывается с query и автоматически импортирует ZIP через существующую точку `importOutZipFromArrayBuffer`.

### Переменные окружения Bridge

- `BRIDGE_TOKEN` (server-only, обязательно): токен для авторизации bridge-запросов (`Authorization: Bearer <token>`).
  - Если не задан, `POST /api/bridge/convert-from-url` отключен и возвращает `503 SERVICE_DISABLED`.
- `BRIDGE_MAX_PPTX_BYTES` (server-only, по умолчанию `62914560` = 60MB): лимит размера PPTX при скачивании по URL.
- `BRIDGE_TTL_SECONDS` (server-only, по умолчанию `1800`): TTL для временного хранения `out.zip` и метаданных job.
- `BRIDGE_MAX_DOWNLOADS` (server-only, по умолчанию `5`): сколько успешных скачиваний разрешено для одного `outZipUrl` до ответа `410 ALREADY_USED`.
- `BRIDGE_TMP_DIR` (server-only, опционально, по умолчанию `/tmp/outzips`): каталог для временных `out.zip`.
- `BRIDGE_DOWNLOAD_TIMEOUT_MS` (server-only, опционально, по умолчанию `90000`): таймаут скачивания PPTX по URL.

### Пример запроса от WP

```bash
curl -X POST http://141.105.68.164:3000/api/bridge/convert-from-url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"pptxUrl":"https://example.com/path/file.pptx"}'
```

Успешный ответ:

```json
{
  "ok": true,
  "jobId": "...",
  "outZipUrl": "/api/bridge/outzip/<jobId>?t=<downloadToken>",
  "expiresAt": "2026-01-01T12:00:00.000Z"
}
```

### Открытие Editor с авто-импортом

```text
http://141.105.68.164:3000/?importOutZip=%2Fapi%2Fbridge%2Foutzip%2F<jobId>&t=<downloadToken>
```

После успешного импорта query-параметры очищаются из URL, чтобы повторный `F5` не запускал импорт снова.


Коды ответа `GET /api/bridge/outzip/:jobId?t=...`:
- `404 NOT_FOUND` — jobId не найден.
- `401 UNAUTHORIZED` — отсутствует или неверный токен `t`.
- `410 EXPIRED` — job истёк по TTL.
- `410 ALREADY_USED` — исчерпан лимит скачиваний (`BRIDGE_MAX_DOWNLOADS`).
