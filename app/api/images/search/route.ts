import { NextResponse } from "next/server"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { YandexImageSearchError, yandexImageSearch } from "@/src/lib/yandexSearchImages"
import {
  authorizeImageSearchUsage,
  resolveBridgePolicy,
  type ImageSearchUsageDecision,
} from "@/src/lib/bridge/policy"

const MAX_COUNT = 8
const MAX_QUERY_LENGTH = 400

const DEFAULT_SEARCH_TYPE = "SEARCH_TYPE_RU"
const DEFAULT_FAMILY_MODE = "FAMILY_MODE_STRICT"
const DEFAULT_FIX_TYPO_MODE = "FIX_TYPO_MODE_ON"
const DEFAULT_TIMEOUT_MS = 6000
const DEFAULT_CACHE_TTL_MS = 300_000
const DEFAULT_RATE_LIMIT_PER_MINUTE = 30
const DEFAULT_GLOBAL_RATE_LIMIT_PER_SECOND = 8
const DEFAULT_DAILY_BILLED_LIMIT = 50
const DEFAULT_PRESENTATION_BILLED_LIMIT = 20
const PLACEHOLDER_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const ALLOWED_SEARCH_TYPES = new Set([
  "SEARCH_TYPE_RU",
  "SEARCH_TYPE_TR",
  "SEARCH_TYPE_COM",
  "SEARCH_TYPE_KK",
  "SEARCH_TYPE_BE",
  "SEARCH_TYPE_UZ",
])
const ALLOWED_FAMILY_MODES = new Set(["FAMILY_MODE_STRICT", "FAMILY_MODE_MODERATE", "FAMILY_MODE_NONE"])
const ALLOWED_FIX_TYPO_MODES = new Set(["FIX_TYPO_MODE_ON", "FIX_TYPO_MODE_OFF"])

const MOCK_IMAGES = [
  { path: "/mock-images/hero1.jpg", contentType: "image/jpeg" },
  { path: "/mock-images/hero2.jpg", contentType: "image/jpeg" },
  { path: "/mock-images/photo1.jpg", contentType: "image/jpeg" },
  { path: "/mock-images/photo2.jpg", contentType: "image/jpeg" },
  { path: "/mock-images/icon1.png", contentType: "image/png" },
  { path: "/mock-images/icon2.png", contentType: "image/png" },
] as const

type SearchBody = {
  query?: string
  negative?: string[]
  count?: number
  page?: number
  aspect?: "portrait" | "landscape" | "square"
  site?: string
  placeholderKey?: string
  confirmTokenCharge?: boolean
}

type CacheValue = {
  expiresAt: number
  results: Array<{
    id: string
    thumbUrl: string
    pageUrl: string
    imageUrl: string
    width?: number
    height?: number
    sourceHost?: string
    sourceTitle?: string
  }>
}

const inMemoryCache = new Map<string, CacheValue>()
const rateLimitBuckets = new Map<string, { resetAt: number; count: number }>()
let globalRateLimitBucket = { resetAt: 0, count: 0 }
let spendGuardTail: Promise<void> = Promise.resolve()

type SpendLedger = {
  date: string
  billedCount: number
  placeholders: Record<string, {
    cacheKey: string
    usedAt: string
    status: "pending" | "done"
    results: CacheValue["results"]
    usage?: ImageSearchUsageDecision
  }>
  presentations: Record<string, { billedCount: number }>
}

function hashString(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function buildMockImageMeta(query: string, index: number) {
  const seed = `${query}:${index}`
  const hash = hashString(seed)
  const image = MOCK_IMAGES[hash % MOCK_IMAGES.length]

  return {
    id: `${query}-${hash}-${index + 1}`,
    image,
  }
}

function asBoolean(value: string | undefined, defaultValue: boolean) {
  if (typeof value !== "string") return defaultValue
  const normalized = value.trim().toLowerCase()
  if (["0", "false", "off", "no"].includes(normalized)) return false
  if (["1", "true", "on", "yes"].includes(normalized)) return true
  return defaultValue
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) return fallback
  return parsed
}

function parseNonNegativeInt(raw: string | undefined, fallback: number) {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed < 0) return fallback
  return parsed
}

function getSpendLedgerPath() {
  return process.env.YANDEX_SEARCH_SPEND_LEDGER_PATH?.trim() || "/tmp/presentonika-yandex-search/spend-ledger.json"
}

function getDailyBilledLimit() {
  return parseNonNegativeInt(process.env.YANDEX_SEARCH_DAILY_BILLED_LIMIT, DEFAULT_DAILY_BILLED_LIMIT)
}

function getPresentationBilledLimit() {
  return parseNonNegativeInt(process.env.YANDEX_SEARCH_PRESENTATION_BILLED_LIMIT, DEFAULT_PRESENTATION_BILLED_LIMIT)
}

function getMoscowDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

function emptySpendLedger(): SpendLedger {
  return { date: getMoscowDate(), billedCount: 0, placeholders: {}, presentations: {} }
}

async function readSpendLedger(): Promise<SpendLedger> {
  try {
    const parsed = JSON.parse(await fs.readFile(getSpendLedgerPath(), "utf8")) as Partial<SpendLedger>
    if (!parsed.placeholders || typeof parsed.placeholders !== "object") throw new Error("Invalid spend ledger")
    const currentDate = getMoscowDate()
    if (parsed.date !== currentDate) {
      return {
        date: currentDate,
        billedCount: 0,
        placeholders: parsed.placeholders as SpendLedger["placeholders"],
        presentations: {},
      }
    }
    if (!Number.isInteger(parsed.billedCount) || Number(parsed.billedCount) < 0) throw new Error("Invalid spend ledger")
    return {
      date: currentDate,
      billedCount: Number(parsed.billedCount),
      placeholders: parsed.placeholders as SpendLedger["placeholders"],
      presentations: parsed.presentations && typeof parsed.presentations === "object"
        ? parsed.presentations as SpendLedger["presentations"]
        : {},
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptySpendLedger()
    throw error
  }
}

async function writeSpendLedger(ledger: SpendLedger) {
  const ledgerPath = getSpendLedgerPath()
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true })
  const temporaryPath = `${ledgerPath}.${process.pid}.${crypto.randomUUID()}.tmp`
  await fs.writeFile(temporaryPath, JSON.stringify(ledger), { encoding: "utf8", mode: 0o600 })
  await fs.rename(temporaryPath, ledgerPath)
}

function getPlaceholderLedgerKey(presentationId: string, placeholderKey: string, cacheKey: string) {
  return crypto.createHash("sha256").update(`${presentationId}\0${placeholderKey}\0${cacheKey}`).digest("hex")
}

function getPresentationLedgerKey(presentationId: string) {
  return crypto.createHash("sha256").update(presentationId).digest("hex")
}

async function withSpendGuardLock(task: () => Promise<Response>) {
  let release: () => void = () => undefined
  const previous = spendGuardTail
  spendGuardTail = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await task()
  } finally {
    release()
  }
}

function getYandexConfig() {
  const enabledByFlag = asBoolean(process.env.YANDEX_SEARCH_ENABLE, true)
  const apiKey = process.env.YANDEX_SEARCH_API_KEY?.trim() || ""
  const folderId = process.env.YANDEX_SEARCH_FOLDER_ID?.trim() || ""
  const searchType = process.env.YANDEX_SEARCH_DEFAULT_TYPE?.trim() || DEFAULT_SEARCH_TYPE
  const familyMode = process.env.YANDEX_SEARCH_FAMILY_MODE?.trim() || DEFAULT_FAMILY_MODE
  const fixTypoMode = process.env.YANDEX_SEARCH_FIX_TYPO_MODE?.trim() || DEFAULT_FIX_TYPO_MODE
  const missing = [
    ...(!folderId ? ["YANDEX_SEARCH_FOLDER_ID"] : []),
    ...(!apiKey ? ["YANDEX_SEARCH_API_KEY"] : []),
  ]
  const configurationErrors = [
    ...(!ALLOWED_SEARCH_TYPES.has(searchType) ? [`Unsupported YANDEX_SEARCH_DEFAULT_TYPE: ${searchType}`] : []),
    ...(!ALLOWED_FAMILY_MODES.has(familyMode) ? [`Unsupported YANDEX_SEARCH_FAMILY_MODE: ${familyMode}`] : []),
    ...(!ALLOWED_FIX_TYPO_MODES.has(fixTypoMode)
      ? [`Unsupported YANDEX_SEARCH_FIX_TYPO_MODE: ${fixTypoMode}`]
      : []),
  ]

  return {
    enabledByFlag,
    configured: missing.length === 0,
    active: enabledByFlag && missing.length === 0 && configurationErrors.length === 0,
    mockFallback: asBoolean(process.env.YANDEX_SEARCH_MOCK_FALLBACK, true),
    missing,
    configurationErrors,
    apiKey,
    folderId,
    searchType,
    familyMode,
    fixTypoMode,
    docsOnPageDefault: clamp(parsePositiveInt(process.env.YANDEX_SEARCH_DOCS_ON_PAGE_DEFAULT, 8), 1, MAX_COUNT),
    timeoutMs: parsePositiveInt(process.env.YANDEX_SEARCH_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    cacheTtlMs: parsePositiveInt(process.env.YANDEX_SEARCH_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS),
    rateLimitPerMinute: parseNonNegativeInt(
      process.env.YANDEX_SEARCH_RATE_LIMIT_PER_MINUTE,
      process.env.NODE_ENV === "test" ? 0 : DEFAULT_RATE_LIMIT_PER_MINUTE,
    ),
    globalRateLimitPerSecond: parseNonNegativeInt(
      process.env.YANDEX_SEARCH_GLOBAL_RATE_LIMIT_PER_SECOND,
      process.env.NODE_ENV === "test" ? 0 : DEFAULT_GLOBAL_RATE_LIMIT_PER_SECOND,
    ),
  }
}

function normalizeNegativeTerms(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/[\u0000-\u001f"']/g, ""))
    .filter(Boolean)
    .slice(0, 12)
}

function buildYandexQuery(query: string, negative: string[]) {
  const suffix = negative
    .map((term) => (term.includes(" ") ? `-${term.replace(/\s+/g, "-")}` : `-${term}`))
    .join(" ")
  if (!suffix) return query
  return `${query} ${suffix}`.slice(0, MAX_QUERY_LENGTH).trim()
}

function getClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown"
}

function consumeRateLimit(request: Request, perClientLimit: number, globalLimit: number) {
  const now = Date.now()
  if (perClientLimit > 0) {
    const key = getClientKey(request)
    const current = rateLimitBuckets.get(key)
    const bucket = !current || current.resetAt <= now ? { resetAt: now + 60_000, count: 0 } : current
    bucket.count += 1
    rateLimitBuckets.set(key, bucket)

    if (rateLimitBuckets.size > 5_000) {
      for (const [bucketKey, value] of rateLimitBuckets) {
        if (value.resetAt <= now) rateLimitBuckets.delete(bucketKey)
      }
    }

    if (bucket.count > perClientLimit) {
      return {
        allowed: false,
        scope: "client" as const,
        limit: perClientLimit,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
      }
    }
  }

  if (globalLimit > 0) {
    if (globalRateLimitBucket.resetAt <= now) {
      globalRateLimitBucket = { resetAt: now + 1_000, count: 0 }
    }
    globalRateLimitBucket.count += 1
    if (globalRateLimitBucket.count > globalLimit) {
      return {
        allowed: false,
        scope: "global" as const,
        limit: globalLimit,
        retryAfterSeconds: 1,
      }
    }
  }

  return { allowed: true, scope: "none" as const, limit: 0, retryAfterSeconds: 0 }
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set("Cache-Control", "no-store")
  return NextResponse.json(body, { ...init, headers })
}

export async function GET() {
  const config = getYandexConfig()
  const provider = config.active ? "yandex" : config.mockFallback ? "mock" : "unavailable"
  return noStoreJson({
    ok: config.configurationErrors.length === 0,
    provider,
    enabled: config.enabledByFlag,
    configured: config.configured,
    missing: config.missing,
    configurationErrors: config.configurationErrors,
  })
}

function getOrientation(aspect: SearchBody["aspect"]) {
  if (aspect === "portrait") return "IMAGE_ORIENTATION_VERTICAL" as const
  if (aspect === "landscape") return "IMAGE_ORIENTATION_HORIZONTAL" as const
  if (aspect === "square") return "IMAGE_ORIENTATION_SQUARE" as const
  return undefined
}

function getMockResults(query: string, count: number) {
  const metas = Array.from({ length: count }, (_, index) => buildMockImageMeta(query, index))
  return metas.map(({ id, image }) => ({
    id,
    thumbUrl: image.path,
    pageUrl: "https://picsum.photos/",
    imageUrl: image.path,
    width: 1200,
    height: 800,
    sourceHost: "picsum.photos",
    sourceTitle: "Mock image",
  }))
}

function cleanupCache(now: number) {
  for (const [key, value] of inMemoryCache.entries()) {
    if (value.expiresAt <= now) {
      inMemoryCache.delete(key)
    }
  }
}

async function handleAuthorizedSearch(
  request: Request,
  body: SearchBody,
  presentationId: string,
  placeholderKey: string,
  authorizationSource: "bridge-token" | "save-token" | "none",
) {
  const query = typeof body.query === "string" ? body.query.trim() : ""
  if (!query) {
    return NextResponse.json({ ok: false, message: "query is required" }, { status: 400 })
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ ok: false, message: `query is too long (max ${MAX_QUERY_LENGTH})` }, { status: 400 })
  }

  const config = getYandexConfig()
  const count = clamp(
    typeof body.count === "number" && Number.isFinite(body.count)
      ? Math.floor(body.count)
      : config.docsOnPageDefault,
    1,
    MAX_COUNT,
  )
  const page = clamp(
    typeof body.page === "number" && Number.isFinite(body.page) ? Math.floor(body.page) : 0,
    0,
    100,
  )

  if (config.configurationErrors.length > 0) {
    return noStoreJson(
      { ok: false, message: "Image search configuration is invalid", details: config.configurationErrors },
      { status: 503 },
    )
  }

  const partiallyConfigured = config.missing.length === 1
  if (partiallyConfigured) {
    return noStoreJson(
      { ok: false, message: "Yandex image search configuration is incomplete", missing: config.missing },
      { status: 503 },
    )
  }

  if (!config.active) {
    if (!config.mockFallback) {
      return noStoreJson(
        { ok: false, message: "Image search is not configured", missing: config.missing },
        { status: 503 },
      )
    }
    const results = getMockResults(query, count)
    return noStoreJson({ ok: true, results, provider: "mock", cached: false })
  }

  const orientation = getOrientation(body.aspect)
  const site = typeof body.site === "string" && body.site.trim() ? body.site.trim() : undefined
  const negative = normalizeNegativeTerms(body.negative)
  const queryText = buildYandexQuery(query, negative)

  const cacheKey = JSON.stringify({ queryText, count, page, orientation, site })
  const now = Date.now()
  cleanupCache(now)
  const ledger = await readSpendLedger()
  const placeholderLedgerKey = getPlaceholderLedgerKey(presentationId, placeholderKey, cacheKey)
  const previousSearch = ledger.placeholders[placeholderLedgerKey]
  if (previousSearch) {
    if (previousSearch.status === "pending") {
      return noStoreJson(
        { ok: false, message: "Image search for this placeholder was already attempted", scope: "placeholder" },
        { status: 409 },
      )
    }
    return noStoreJson({
      ok: true,
      results: previousSearch.results,
      provider: "yandex",
      cached: true,
      reusedPlaceholder: true,
      usage: previousSearch.usage,
    })
  }

  const dailyBilledLimit = getDailyBilledLimit()
  if (dailyBilledLimit > 0 && ledger.billedCount >= dailyBilledLimit) {
    return noStoreJson(
      { ok: false, message: "Daily image search budget exhausted", scope: "daily-budget" },
      { status: 429, headers: { "Retry-After": "3600", "X-Daily-Billed-Limit": String(dailyBilledLimit) } },
    )
  }

  const presentationLedgerKey = getPresentationLedgerKey(presentationId)
  const presentationUsage = ledger.presentations[presentationLedgerKey]?.billedCount ?? 0
  const presentationBilledLimit = getPresentationBilledLimit()
  if (presentationBilledLimit > 0 && presentationUsage >= presentationBilledLimit) {
    return noStoreJson(
      { ok: false, message: "Presentation image search budget exhausted", scope: "presentation-budget" },
      { status: 429, headers: { "X-Presentation-Billed-Limit": String(presentationBilledLimit) } },
    )
  }

  const rateLimit = consumeRateLimit(
    request,
    config.rateLimitPerMinute,
    config.globalRateLimitPerSecond,
  )
  if (!rateLimit.allowed) {
    return noStoreJson(
      { ok: false, message: "Too many image search requests", scope: rateLimit.scope },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    )
  }

  const unavailableUsage: ImageSearchUsageDecision = {
    allowed: false,
    requiresConfirmation: false,
    charged: false,
    cost: 0,
    quota: 0,
    used: 0,
    remaining: 0,
    pointsBalance: 0,
    plan: "basic",
    message: "Image search usage authorization is unavailable",
  }
  const usageDeniedResponse = (deniedUsage: ImageSearchUsageDecision) => {
    return noStoreJson(
      {
        ok: false,
        message: deniedUsage.message || (deniedUsage.requiresConfirmation
          ? "Token confirmation is required for the next image search"
          : "Image search limit exhausted"),
        scope: deniedUsage.requiresConfirmation ? "token-confirmation" : "image-search-quota",
        usage: deniedUsage,
      },
      {
        status: deniedUsage.requiresConfirmation || deniedUsage.pointsBalance < deniedUsage.cost
          ? 402
          : 503,
      },
    )
  }

  let usage: ImageSearchUsageDecision
  let chargeAfterSuccessfulSearch = false
  if (authorizationSource === "bridge-token") {
    usage = {
      allowed: true,
      requiresConfirmation: false,
      charged: false,
      cost: 0,
      quota: 12,
      used: 0,
      remaining: 12,
      pointsBalance: 0,
      plan: "internal",
    }
  } else {
    const preflightUsage = await authorizeImageSearchUsage(request, {
      presentationId,
      placeholderKey,
      usageKey: placeholderLedgerKey,
      // A point is committed only after Yandex (or the server cache) returned
      // usable results. This prevents charging for an upstream failure.
      confirmTokenCharge: false,
    }) ?? unavailableUsage

    if (preflightUsage.allowed) {
      usage = preflightUsage
    } else if (preflightUsage.requiresConfirmation && body.confirmTokenCharge === true) {
      if (preflightUsage.pointsBalance < preflightUsage.cost) {
        return usageDeniedResponse(preflightUsage)
      }
      usage = preflightUsage
      chargeAfterSuccessfulSearch = true
    } else {
      return usageDeniedResponse(preflightUsage)
    }
  }

  let chargeFailureUsage = unavailableUsage
  const commitConfirmedCharge = async () => {
    if (!chargeAfterSuccessfulSearch) return usage
    const committedUsage = await authorizeImageSearchUsage(request, {
      presentationId,
      placeholderKey,
      usageKey: placeholderLedgerKey,
      confirmTokenCharge: true,
    }) ?? unavailableUsage
    if (!committedUsage.allowed) {
      chargeFailureUsage = committedUsage
      return null
    }
    usage = committedUsage
    return committedUsage
  }

  const cached = inMemoryCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    const committedUsage = await commitConfirmedCharge()
    if (!committedUsage) return usageDeniedResponse(chargeFailureUsage)
    ledger.placeholders[placeholderLedgerKey] = {
      cacheKey,
      usedAt: new Date(now).toISOString(),
      status: "done",
      results: cached.results,
      usage: committedUsage,
    }
    await writeSpendLedger(ledger)
    return noStoreJson({ ok: true, results: cached.results, provider: "yandex", cached: true, usage: committedUsage })
  }


  ledger.billedCount += 1
  ledger.presentations[presentationLedgerKey] = { billedCount: presentationUsage + 1 }
  ledger.placeholders[placeholderLedgerKey] = {
    cacheKey,
    usedAt: new Date(now).toISOString(),
    status: "pending",
    results: [],
    usage,
  }
  await writeSpendLedger(ledger)

  try {
    const results = await yandexImageSearch({
      queryText,
      folderId: config.folderId,
      apiKey: config.apiKey,
      docsOnPage: count,
      page,
      searchType: config.searchType,
      familyMode: config.familyMode,
      fixTypoMode: config.fixTypoMode,
      orientation,
      site,
      timeoutMs: config.timeoutMs,
    })

    inMemoryCache.set(cacheKey, {
      expiresAt: now + config.cacheTtlMs,
      results,
    })

    const committedUsage = await commitConfirmedCharge()
    if (!committedUsage) {
      delete ledger.placeholders[placeholderLedgerKey]
      await writeSpendLedger(ledger)
      return usageDeniedResponse(chargeFailureUsage)
    }

    ledger.placeholders[placeholderLedgerKey] = {
      cacheKey,
      usedAt: new Date(now).toISOString(),
      status: "done",
      results,
      usage: committedUsage,
    }
    await writeSpendLedger(ledger)

    return noStoreJson({ ok: true, results, provider: "yandex", cached: false, usage: committedUsage })
  } catch (error) {
    const upstreamStatus = error instanceof YandexImageSearchError ? error.status : undefined
    const responseStatus = upstreamStatus === 429 ? 429 : 502
    const details = error instanceof Error ? error.message : "Yandex image search failed"
    console.error("[images/search] Yandex request failed", {
      upstreamStatus,
      details,
      ...(error instanceof YandexImageSearchError && process.env.NODE_ENV !== "production"
        ? { upstreamDetails: error.upstreamDetails }
        : {}),
    })
    delete ledger.placeholders[placeholderLedgerKey]
    await writeSpendLedger(ledger).catch((ledgerError) => {
      console.error("[images/search] failed to clear pending ledger entry", {
        message: ledgerError instanceof Error ? ledgerError.message : "unknown",
      })
    })
    return noStoreJson(
      {
        ok: false,
        message: upstreamStatus === 401 || upstreamStatus === 403
          ? "Yandex image search credentials were rejected"
          : upstreamStatus === 429
            ? "Yandex image search rate limit exceeded"
            : "Yandex image search failed",
        ...(process.env.NODE_ENV === "production" ? {} : { details }),
      },
      { status: responseStatus },
    )
  }
}

export async function POST(request: Request) {
  let body: SearchBody
  try {
    body = (await request.json()) as SearchBody
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 })
  }

  const placeholderKey = typeof body.placeholderKey === "string" ? body.placeholderKey.trim() : ""
  if (!PLACEHOLDER_KEY_PATTERN.test(placeholderKey)) {
    return noStoreJson({ ok: false, message: "Valid placeholderKey is required" }, { status: 400 })
  }

  const policy = await resolveBridgePolicy(request, { scope: "images-search", allowSaveFallback: true })
  if (!policy.enabled) {
    return noStoreJson({ ok: false, message: "Image search authorization is disabled" }, { status: 503 })
  }
  if (!policy.authorized) {
    return noStoreJson({ ok: false, message: "Unauthorized image search" }, { status: 401 })
  }

  const presentationId = policy.saveContext?.presentationId || request.headers.get("x-presentation-id")?.trim() || ""
  if (!/^\d+$/.test(presentationId)) {
    return noStoreJson({ ok: false, message: "Valid presentation context is required" }, { status: 400 })
  }

  return withSpendGuardLock(() => handleAuthorizedSearch(
    request,
    body,
    presentationId,
    placeholderKey,
    policy.authorizationSource,
  ))
}
