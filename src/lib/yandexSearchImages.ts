import { XMLParser } from "fast-xml-parser"

const YANDEX_IMAGE_SEARCH_ENDPOINT = "https://searchapi.api.cloud.yandex.net/v2/image/search"

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

function makeImageSpec(
  orientation: YandexImageSearchParams["orientation"],
): Record<string, string> | undefined {
  if (!orientation) return undefined
  return {
    orientation,
  }
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

    const response = await fetch(YANDEX_IMAGE_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
      cache: "no-store",
    })

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "")
      throw new Error(`Yandex upstream error: ${response.status}${bodyText ? ` ${bodyText.slice(0, 300)}` : ""}`)
    }

    const payload = (await response.json()) as { rawData?: string }
    if (!payload.rawData || typeof payload.rawData !== "string") {
      throw new Error("Yandex response missing rawData")
    }

    const xmlString = Buffer.from(payload.rawData, "base64").toString("utf-8")
    if (!xmlString.trim()) {
      return []
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      trimValues: true,
    })
    const parsed = parser.parse(xmlString) as Record<string, unknown>

    const possibleRoots = [
      parsed["yandexsearch"],
      parsed["response"],
      parsed,
    ]

    let docs: unknown[] = []
    for (const root of possibleRoots) {
      if (!root || typeof root !== "object") continue
      const record = root as Record<string, unknown>
      const response = record.response as Record<string, unknown> | undefined
      const results = (response?.results as Record<string, unknown> | undefined) ||
        (record.results as Record<string, unknown> | undefined)
      const grouping = (results?.grouping as Record<string, unknown> | undefined) ||
        (record.grouping as Record<string, unknown> | undefined)
      const groups = toArray(grouping?.group as Record<string, unknown> | Record<string, unknown>[] | undefined)

      if (groups.length > 0) {
        docs = groups
          .map((group) => {
            const doc = (group as Record<string, unknown>).doc
            const firstDoc = Array.isArray(doc) ? doc[0] : doc
            return firstDoc
          })
          .filter(Boolean)
        if (docs.length > 0) break
      }

      const directDocs = toArray(results?.doc as unknown[] | unknown)
      if (directDocs.length > 0) {
        docs = directDocs
        break
      }
    }

    const normalized: NormalizedImageSearchResult[] = []

    docs.forEach((docRaw, index) => {
      if (!docRaw || typeof docRaw !== "object") return
      const doc = docRaw as Record<string, unknown>

      const thumbUrl = pickText(doc["thumbnail-link"] || doc["thumb"])
      const imageUrl = pickText(doc["image-link"] || doc["url"])
      const pageUrl = pickText(doc["html-link"] || doc["url"] || imageUrl)
      if (!thumbUrl || !imageUrl) return

      const width = asNumber(doc.width)
      const height = asNumber(doc.height)
      const sourceTitle = pickText(doc.title)
      const sourceHost = resolveHost(pageUrl)

      normalized.push({
        id: `${index + 1}-${thumbUrl}`,
        thumbUrl,
        imageUrl,
        pageUrl,
        width,
        height,
        sourceHost,
        sourceTitle,
      })
    })

    return normalized.slice(0, params.docsOnPage)
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Yandex upstream timeout")
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
