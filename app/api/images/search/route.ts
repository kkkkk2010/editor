import { NextResponse } from "next/server"
import { yandexImageSearch } from "@/src/lib/yandexSearchImages"

const MAX_COUNT = 60
const MAX_QUERY_LENGTH = 400

const DEFAULT_SEARCH_TYPE = "SEARCH_TYPE_RU"
const DEFAULT_FAMILY_MODE = "FAMILY_MODE_STRICT"
const DEFAULT_FIX_TYPO_MODE = "FIX_TYPO_MODE_ON"
const DEFAULT_TIMEOUT_MS = 6000
const DEFAULT_CACHE_TTL_MS = 300_000

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
  count?: number
  page?: number
  aspect?: "portrait" | "landscape" | "square"
  site?: string
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

function getYandexConfig() {
  const enableByFlag = asBoolean(process.env.YANDEX_SEARCH_ENABLE, true)
  const apiKey = process.env.YANDEX_SEARCH_API_KEY?.trim() || ""
  const folderId = process.env.YANDEX_SEARCH_FOLDER_ID?.trim() || ""

  return {
    enabled: enableByFlag && Boolean(apiKey) && Boolean(folderId),
    apiKey,
    folderId,
    searchType: process.env.YANDEX_SEARCH_DEFAULT_TYPE?.trim() || DEFAULT_SEARCH_TYPE,
    familyMode: process.env.YANDEX_SEARCH_FAMILY_MODE?.trim() || DEFAULT_FAMILY_MODE,
    fixTypoMode: process.env.YANDEX_SEARCH_FIX_TYPO_MODE?.trim() || DEFAULT_FIX_TYPO_MODE,
    docsOnPageDefault: clamp(parsePositiveInt(process.env.YANDEX_SEARCH_DOCS_ON_PAGE_DEFAULT, 8), 1, MAX_COUNT),
    timeoutMs: parsePositiveInt(process.env.YANDEX_SEARCH_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    cacheTtlMs: parsePositiveInt(process.env.YANDEX_SEARCH_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS),
  }
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

export async function POST(request: Request) {
  let body: SearchBody
  try {
    body = (await request.json()) as SearchBody
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 })
  }

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

  if (!config.enabled) {
    const results = getMockResults(query, count)
    return NextResponse.json({ ok: true, results, provider: "mock", cached: false })
  }

  const orientation = getOrientation(body.aspect)
  const site = typeof body.site === "string" && body.site.trim() ? body.site.trim() : undefined

  const cacheKey = JSON.stringify({ query, count, page, orientation, site })
  const now = Date.now()
  cleanupCache(now)
  const cached = inMemoryCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return NextResponse.json({ ok: true, results: cached.results, provider: "yandex", cached: true })
  }

  try {
    const results = await yandexImageSearch({
      queryText: query,
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

    return NextResponse.json({ ok: true, results, provider: "yandex", cached: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Yandex image search failed"
    return NextResponse.json({ ok: false, message: "Yandex image search failed", details: message }, { status: 502 })
  }
}
