import { NextResponse } from "next/server"

const DEFAULT_COUNT = 6
const MAX_COUNT = 12
const IMAGE_WIDTH = 1200
const IMAGE_HEIGHT = 800
const MAX_REDIRECTS = 5
const RESOLVE_TIMEOUT_MS = 2_500
const RESOLVE_CONCURRENCY = 3

function isDev() {
  return process.env.NODE_ENV !== "production"
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
  const imageId = (hash % 1084) + 1
  return {
    id: `${query}-${imageId}-${index + 1}`,
    imageId,
  }
}

function isAllowedPicsumHost(hostname: string) {
  const host = hostname.toLowerCase()
  return host === "picsum.photos" || host.endsWith(".picsum.photos")
}

type ResolveResult = {
  imageUrl: string
  finalHost: string
  redirectCount: number
}

async function resolvePicsumFinalUrl(startUrl: string): Promise<ResolveResult> {
  let currentUrl = new URL(startUrl)
  let redirectCount = 0

  if (!isAllowedPicsumHost(currentUrl.hostname)) {
    return {
      imageUrl: startUrl,
      finalHost: currentUrl.hostname,
      redirectCount,
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS)

  try {
    for (let step = 0; step <= MAX_REDIRECTS; step += 1) {
      const response = await fetch(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      })

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location")
        if (!location) break

        const nextUrl = new URL(location, currentUrl)
        if (!isAllowedPicsumHost(nextUrl.hostname)) {
          return {
            imageUrl: startUrl,
            finalHost: nextUrl.hostname,
            redirectCount,
          }
        }

        currentUrl = nextUrl
        redirectCount += 1
        continue
      }

      if (response.status === 200) {
        return {
          imageUrl: currentUrl.toString(),
          finalHost: currentUrl.hostname,
          redirectCount,
        }
      }

      break
    }
  } catch {
    // fallback below
  } finally {
    clearTimeout(timer)
  }

  return {
    imageUrl: startUrl,
    finalHost: currentUrl.hostname,
    redirectCount,
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) break
      results[index] = await mapper(items[index], index)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export async function POST(request: Request) {
  let body: { query?: string; count?: number }
  try {
    body = (await request.json()) as { query?: string; count?: number }
  } catch {
    return NextResponse.json({ ok: true, results: [] })
  }

  const query = typeof body.query === "string" ? body.query.trim() : ""
  const count = typeof body.count === "number" && body.count > 0 ? Math.min(body.count, MAX_COUNT) : DEFAULT_COUNT

  if (!query) {
    return NextResponse.json({ ok: true, results: [] })
  }

  const encoded = encodeURIComponent(query)
  const metas = Array.from({ length: count }, (_, index) => buildMockImageMeta(query, index))

  const results = await mapWithConcurrency(metas, RESOLVE_CONCURRENCY, async ({ id, imageId }, index) => {
    const picsumImageUrl = `https://picsum.photos/id/${imageId}/${IMAGE_WIDTH}/${IMAGE_HEIGHT}`
    const resolved = await resolvePicsumFinalUrl(picsumImageUrl)

    return {
      id,
      thumbUrl: `https://via.placeholder.com/300?text=${encoded}-${index + 1}`,
      pageUrl: `https://picsum.photos/id/${imageId}`,
      imageUrl: resolved.imageUrl,
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      source: "mock",
      licenseLabel: "Demo license",
      licenseUrl: "https://example.com/license",
      ...(isDev()
        ? {
            debug: {
              finalHost: resolved.finalHost,
              redirectCount: resolved.redirectCount,
            },
          }
        : {}),
    }
  })

  return NextResponse.json({ results })
}
