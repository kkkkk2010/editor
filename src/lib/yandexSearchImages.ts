import { XMLParser } from "fast-xml-parser"

const YANDEX_IMAGE_SEARCH_ENDPOINT = "https://searchapi.api.cloud.yandex.net/v2/image/search"
const MAX_UPSTREAM_ATTEMPTS = 2
const MAX_RETRY_DELAY_MS = 1_500

export type YandexImageSearchParams = {
  queryText: string
  folderId: string
  apiKey: string
  docsOnPage: number
  page: number
  searchType: string
  familyMode?: string
  fixTypoMode?: string
  orientation?: "IMAGE_ORIENTATION_VERTICAL" | "IMAGE_ORIENTATION_HORIZONTAL" | "IMAGE_ORIENTATION_SQUARE"
  site?: string
  timeoutMs: number
  userAgent?: string
}

export type NormalizedImageSearchResult = {
  id: string
  thumbUrl: string
  imageUrl: string
  pageUrl: string
  width?: number
  height?: number
  sourceHost?: string
  sourceTitle?: string
}

export class YandexImageSearchError extends Error {
  status?: number
  upstreamDetails?: string

  constructor(message: string, options?: { status?: number; upstreamDetails?: string }) {
    super(message)
    this.name = "YandexImageSearchError"
    this.status = options?.status
    this.upstreamDetails = options?.upstreamDetails
  }
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isNaN(parsed)) return parsed
  }
  return undefined
}

function pickText(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>
    if (typeof objectValue["#text"] === "string") return objectValue["#text"]
    if (typeof objectValue["text"] === "string") return objectValue["text"]
  }
  return ""
}

function resolveHost(urlRaw: string): string | undefined {
  try {
    const parsed = new URL(urlRaw)
    return parsed.hostname
  } catch {
    return undefined
  }
}

function normalizeHttpUrl(value: unknown, options?: { preferHttps?: boolean }): string {
  const raw = pickText(value).trim()
  if (!raw) return ""

  const candidate = raw.startsWith("//")
    ? `https:${raw}`
    : /^[a-z][a-z\d+.-]*:/i.test(raw)
      ? raw
      : `https://${raw}`

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return ""
    if (options?.preferHttps && parsed.protocol === "http:") {
      parsed.protocol = "https:"
    }
    return parsed.toString()
  } catch {
    return ""
  }
}

function preferLargerYandexThumbnail(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    if (url.hostname === "avatars.mds.yandex.net") {
      url.searchParams.set("n", "13")
    }
    return url.toString()
  } catch {
    return rawUrl
  }
}

function hashString(input: string) {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function getRetryDelayMs(response: Response) {
  const retryAfter = response.headers.get("retry-after")?.trim()
  if (!retryAfter) return 300

  const seconds = Number.parseFloat(retryAfter)
  if (Number.isFinite(seconds)) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, seconds * 1_000))
  }

  const retryAt = Date.parse(retryAfter)
  if (Number.isNaN(retryAt)) return 300
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, retryAt - Date.now()))
}

function isRetryableStatus(status: number) {
  return status === 429 || status >= 500
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs))
}

function makeImageSpec(
  orientation: YandexImageSearchParams["orientation"],
): Record<string, string> | undefined {
  if (!orientation) return undefined
  return {
    orientation,
  }
}

export function parseYandexImageSearchXml(xmlString: string, limit: number): NormalizedImageSearchResult[] {
  if (!xmlString.trim()) return []

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    trimValues: true,
  })
  const parsed = parser.parse(xmlString) as Record<string, unknown>

  const possibleRoots = [parsed["yandexsearch"], parsed["response"], parsed]
  let docs: unknown[] = []

  for (const root of possibleRoots) {
    if (!root || typeof root !== "object") continue
    const record = root as Record<string, unknown>
    const response = record.response as Record<string, unknown> | undefined
    const results =
      (response?.results as Record<string, unknown> | undefined) ||
      (record.results as Record<string, unknown> | undefined)
    const grouping =
      (results?.grouping as Record<string, unknown> | undefined) ||
      (record.grouping as Record<string, unknown> | undefined)
    const groups = toArray(grouping?.group as Record<string, unknown> | Record<string, unknown>[] | undefined)

    if (groups.length > 0) {
      docs = groups
        .flatMap((group) => toArray((group as Record<string, unknown>).doc))
        .filter(Boolean)
      if (docs.length > 0) break
    }

    const directDocs = toArray(results?.doc)
    if (directDocs.length > 0) {
      docs = directDocs
      break
    }
  }

  const normalized: NormalizedImageSearchResult[] = []
  const seenImageUrls = new Set<string>()

  for (const docRaw of docs) {
    if (!docRaw || typeof docRaw !== "object") continue
    const doc = docRaw as Record<string, unknown>
    const imagePropertiesRaw = toArray(doc["image-properties"])[0]
    const imageProperties =
      imagePropertiesRaw && typeof imagePropertiesRaw === "object"
        ? (imagePropertiesRaw as Record<string, unknown>)
        : doc

    const normalizedThumbUrl = normalizeHttpUrl(imageProperties["thumbnail-link"] || imageProperties.thumb, {
      preferHttps: true,
    })
    const imageUrl = normalizeHttpUrl(imageProperties["image-link"] || imageProperties.url || doc.url)
    const pageUrl =
      normalizeHttpUrl(imageProperties["html-link"] || doc.url) || imageUrl

    if (!normalizedThumbUrl || !imageUrl || seenImageUrls.has(imageUrl)) continue
    const thumbUrl = preferLargerYandexThumbnail(normalizedThumbUrl)
    seenImageUrls.add(imageUrl)

    const width = asNumber(imageProperties["original-width"] ?? imageProperties.width)
    const height = asNumber(imageProperties["original-height"] ?? imageProperties.height)
    const sourceTitle = pickText(doc.title || imageProperties.title)
    const sourceHost = resolveHost(pageUrl)
    const upstreamId = pickText(imageProperties.id)

    normalized.push({
      id: upstreamId || `yandex-${hashString(`${imageUrl}|${pageUrl}`)}`,
      thumbUrl,
      imageUrl,
      pageUrl,
      width,
      height,
      sourceHost,
      sourceTitle,
    })

    if (normalized.length >= limit) break
  }

  return normalized
}

export async function yandexImageSearch(params: YandexImageSearchParams): Promise<NormalizedImageSearchResult[]> {
  const queryText = params.queryText.trim()
  if (!queryText) {
    throw new Error("queryText is required")
  }
  if (queryText.length > 400) {
    throw new Error("queryText too long")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, params.timeoutMs))

  try {
    const requestBody: Record<string, unknown> = {
      folderId: params.folderId,
      docsOnPage: params.docsOnPage,
      userAgent:
        params.userAgent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      query: {
        searchType: params.searchType,
        queryText,
        page: params.page,
        ...(params.familyMode ? { familyMode: params.familyMode } : {}),
        ...(params.fixTypoMode ? { fixTypoMode: params.fixTypoMode } : {}),
      },
    }

    const imageSpec = makeImageSpec(params.orientation)
    if (imageSpec) {
      requestBody.imageSpec = imageSpec
    }

    if (params.site) {
      requestBody.site = params.site
    }

    let response: Response | null = null
    for (let attempt = 0; attempt < MAX_UPSTREAM_ATTEMPTS; attempt += 1) {
      response = await fetch(YANDEX_IMAGE_SEARCH_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Api-Key ${params.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        cache: "no-store",
      })

      if (response.ok || !isRetryableStatus(response.status) || attempt === MAX_UPSTREAM_ATTEMPTS - 1) {
        break
      }
      await sleep(getRetryDelayMs(response))
    }

    if (!response?.ok) {
      const bodyText = response ? await response.text().catch(() => "") : ""
      throw new YandexImageSearchError("Yandex image search request failed", {
        status: response?.status,
        upstreamDetails: bodyText.slice(0, 500),
      })
    }

    const payload = (await response.json()) as { rawData?: string }
    if (!payload.rawData || typeof payload.rawData !== "string") {
      throw new YandexImageSearchError("Yandex response missing rawData")
    }

    const xmlString = Buffer.from(payload.rawData, "base64").toString("utf-8")
    return parseYandexImageSearchXml(xmlString, params.docsOnPage)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Yandex upstream timeout")
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
