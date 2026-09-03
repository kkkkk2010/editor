import { NextResponse } from "next/server"
import dns from "node:dns/promises"
import fs from "node:fs/promises"
import net from "node:net"
import path from "node:path"
import { resolveBridgePolicy } from "@/src/lib/bridge/policy"
import { fetchPinnedPublicUrl } from "@/src/lib/net/pinnedFetch"

const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_RATE_LIMIT_PER_MINUTE = 30
const DEFAULT_GLOBAL_RATE_LIMIT_PER_SECOND = 8
const MAX_REDIRECTS = 5
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/svg+xml",
])
const DEFAULT_IMG_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  // Request formats that the editor and exported presentation can preserve.
  // Advertising AVIF/APNG here makes some CDNs ignore the original file type
  // and return bytes that cannot be embedded into the presentation package.
  Accept: "image/webp,image/png,image/jpeg,image/gif,image/bmp,image/svg+xml;q=0.9,*/*;q=0.1",
  "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
} as const

type DebugPayload = {
  stage: "validate" | "redirect" | "redirect_host_not_allowed" | "fetch" | "mime" | "size"
  status?: number
  contentType?: string
  finalUrl?: string
  redirects: string[]
  errorMessage?: string
}

const rateLimitBuckets = new Map<string, { resetAt: number; count: number }>()
let globalRateLimitBucket = { resetAt: 0, count: 0 }

function isProd() {
  return process.env.NODE_ENV === "production"
}

function getMaxBytes() {
  const raw = process.env.IMAGE_FETCH_MAX_BYTES
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_MAX_IMAGE_BYTES
  return parsed
}

function getTimeoutMs() {
  const raw = process.env.IMAGE_FETCH_TIMEOUT_MS
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS
  return parsed
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) return fallback
  return parsed
}

function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown"
}

function consumeRateLimit(request: Request, identity: string) {
  const now = Date.now()
  const perIdentityLimit = parsePositiveInt(
    process.env.IMAGE_FETCH_RATE_LIMIT_PER_MINUTE,
    DEFAULT_RATE_LIMIT_PER_MINUTE,
  )
  const globalLimit = parsePositiveInt(
    process.env.IMAGE_FETCH_GLOBAL_RATE_LIMIT_PER_SECOND,
    DEFAULT_GLOBAL_RATE_LIMIT_PER_SECOND,
  )
  const key = `${identity}:${getRequestIp(request)}`
  const current = rateLimitBuckets.get(key)
  const bucket = !current || current.resetAt <= now
    ? { resetAt: now + 60_000, count: 0 }
    : current
  bucket.count += 1
  rateLimitBuckets.set(key, bucket)

  if (rateLimitBuckets.size > 2_000) {
    for (const [bucketKey, value] of rateLimitBuckets.entries()) {
      if (value.resetAt <= now) rateLimitBuckets.delete(bucketKey)
    }
  }

  if (bucket.count > perIdentityLimit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)) }
  }

  if (globalRateLimitBucket.resetAt <= now) {
    globalRateLimitBucket = { resetAt: now + 1_000, count: 0 }
  }
  globalRateLimitBucket.count += 1
  if (globalRateLimitBucket.count > globalLimit) {
    return { allowed: false, retryAfterSeconds: 1 }
  }

  return { allowed: true, retryAfterSeconds: 0 }
}

function getAllowedHosts() {
  const raw = process.env.IMAGE_FETCH_ALLOWED_HOSTS?.trim() || ""
  if (!raw) return [] as string[]
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function isHostAllowed(hostname: string, allowedHosts: string[]) {
  if (allowedHosts.length === 0) return true
  return allowedHosts.some((rule) => {
    if (rule.startsWith(".")) {
      const root = rule.slice(1)
      return hostname === root || hostname.endsWith(rule)
    }
    return hostname === rule
  })
}

class UrlValidationError extends Error {
  code: "invalid_url" | "blocked_host" | "allowlist_not_allowed"
  host?: string

  constructor(message: string, code: "invalid_url" | "blocked_host" | "allowlist_not_allowed", host?: string) {
    super(message)
    this.code = code
    this.host = host
  }
}

function isPrivateIpLiteral(hostname: string) {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (net.isIPv4(normalizedHostname)) {
    const parts = normalizedHostname.split(".").map((part) => Number.parseInt(part, 10))
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 192 && parts[1] === 0) return true
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true
    if (parts[0] === 0) return true
    if (parts[0] >= 224) return true
    return false
  }

  if (net.isIPv6(normalizedHostname)) {
    const normalized = normalizedHostname
    const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
    if (mappedIpv4) return isPrivateIpLiteral(mappedIpv4)
    if (normalized === "::") return true
    if (normalized === "::1") return true
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true
    if (/^fe[89ab]/.test(normalized)) return true
    if (normalized.startsWith("ff")) return true
    if (normalized.startsWith("2001:db8")) return true
    return false
  }

  return false
}

function validateUrl(rawUrl: string, allowedHosts: string[]) {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new UrlValidationError("Invalid URL", "invalid_url")
  }

  if (!parsed.protocol || !["http:", "https:"].includes(parsed.protocol)) {
    throw new UrlValidationError("Only http/https URLs are allowed", "invalid_url")
  }

  if (parsed.username || parsed.password) {
    throw new UrlValidationError("URL credentials are not allowed", "invalid_url")
  }

  const hostname = parsed.hostname.toLowerCase()
  if (hostname.includes("localhost") || hostname === "::1") {
    throw new UrlValidationError("Blocked host", "blocked_host", hostname)
  }

  if (isPrivateIpLiteral(hostname)) {
    throw new UrlValidationError("Blocked host", "blocked_host", hostname)
  }

  if (!isHostAllowed(hostname, allowedHosts)) {
    throw new UrlValidationError("Host is not in allowlist", "allowlist_not_allowed", hostname)
  }

  return parsed
}

async function validateResolvedHost(url: URL) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (net.isIP(hostname)) {
    if (isPrivateIpLiteral(hostname)) {
      throw new UrlValidationError("Blocked host", "blocked_host", hostname)
    }
    return
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIpLiteral(address))) {
    throw new UrlValidationError("Host resolves to a blocked address", "blocked_host", hostname)
  }
}

function getSourceReferer(rawPageUrl: string | undefined) {
  if (!rawPageUrl) return undefined
  try {
    const parsed = new URL(rawPageUrl)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined
    return `${parsed.origin}/`
  } catch {
    return undefined
  }
}

function normalizeReportedContentType(value: string | null) {
  const normalized = (value || "").split(";")[0].trim().toLowerCase()
  if (normalized === "image/jpg" || normalized === "image/pjpeg") return "image/jpeg"
  if (normalized === "image/x-png") return "image/png"
  if (normalized === "image/x-ms-bmp") return "image/bmp"
  return normalized
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

function detectImageContentType(bytes: Uint8Array): string | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (
    bytes.length >= 12 &&
    new TextDecoder("ascii").decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder("ascii").decode(bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp"
  }
  const firstSix = new TextDecoder("ascii").decode(bytes.subarray(0, 6))
  if (firstSix === "GIF87a" || firstSix === "GIF89a") return "image/gif"
  if (startsWithBytes(bytes, [0x42, 0x4d])) return "image/bmp"

  const textPrefix = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.length, 2048)))
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase()
  if (textPrefix.startsWith("<svg") || (textPrefix.startsWith("<?xml") && textPrefix.includes("<svg"))) {
    return "image/svg+xml"
  }
  return null
}

function resolveImageContentType(bytes: Uint8Array) {
  const detected = detectImageContentType(bytes)
  if (detected && ALLOWED_TYPES.has(detected)) return detected
  return null
}

function detectLocalContentType(imageUrl: string) {
  const extension = path.extname(imageUrl).toLowerCase()
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg"
  if (extension === ".png") return "image/png"
  if (extension === ".webp") return "image/webp"
  return null
}

function isAllowedRelativePath(imageUrl: string) {
  if (!imageUrl.startsWith("/mock-images/")) return false
  if (imageUrl.includes("..") || imageUrl.includes("\\")) return false
  return true
}

function errorResponse(message: string, status: number, debug?: DebugPayload) {
  if (!isProd() && debug) {
    console.debug("[images/fetch] blocked-or-failed", {
      message,
      status,
      stage: debug.stage,
      redirects: debug.redirects,
      errorMessage: debug.errorMessage,
      finalUrl: debug.finalUrl,
    })
  }
  return NextResponse.json(
    {
      ok: false,
      message,
      ...(isProd() ? {} : { debug }),
    },
    { status },
  )
}

async function fetchImageHop(url: URL, signal: AbortSignal, referer?: string) {
  return fetchPinnedPublicUrl(url, {
    method: "GET",
    signal,
    headers: {
      ...DEFAULT_IMG_HEADERS,
      ...(referer ? { Referer: referer } : {}),
    },
  })
}

function getRefererCandidates(url: URL, sourceReferer?: string) {
  const candidates: Array<string | undefined> = [sourceReferer, `${url.origin}/`, undefined]
  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index)
}

async function fetchImageHopWithFallbacks(url: URL, signal: AbortSignal, sourceReferer?: string) {
  const candidates = getRefererCandidates(url, sourceReferer)
  let response: Response | null = null

  for (let index = 0; index < candidates.length; index += 1) {
    response = await fetchImageHop(url, signal, candidates[index])
    if (![401, 403, 429].includes(response.status) || index === candidates.length - 1) {
      return response
    }
    await response.body?.cancel().catch(() => undefined)
    await sleepWithJitter(100, 200)
  }

  return response as Response
}

async function readResponseBytes(response: Response, maxBytes: number) {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes.byteLength <= maxBytes ? bytes : null
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel("Image exceeds configured byte limit").catch(() => undefined)
      return null
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function sleepWithJitter(minMs: number, maxMs: number) {
  const jitterMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), jitterMs)
  })
}

export async function POST(request: Request) {
  const redirects: string[] = []
  const allowedHosts = getAllowedHosts()

  try {
    const policy = await resolveBridgePolicy(request, { scope: "images-fetch", allowSaveFallback: true })
    if (!policy.enabled) {
      return errorResponse("Image fetch authorization is disabled", 503)
    }
    if (!policy.authorized) {
      return errorResponse("Unauthorized image fetch", 401)
    }

    const rate = consumeRateLimit(
      request,
      policy.saveContext
        ? `save:${policy.saveContext.userId}:${policy.saveContext.presentationId}`
        : "bridge",
    )
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, message: "Too many image fetch requests" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(rate.retryAfterSeconds),
          },
        },
      )
    }

    let body: { imageUrl?: string; url?: string; pageUrl?: string }
    try {
      body = (await request.json()) as { imageUrl?: string; url?: string; pageUrl?: string }
    } catch {
      return errorResponse("Invalid JSON body", 400, {
        stage: "validate",
        redirects,
        errorMessage: "Invalid JSON body",
      })
    }

    const rawUrl =
      (typeof body.imageUrl === "string" ? body.imageUrl : "") ||
      (typeof body.url === "string" ? body.url : "")
    const normalized = rawUrl.trim()
    const sourceReferer = getSourceReferer(typeof body.pageUrl === "string" ? body.pageUrl.trim() : undefined)
    if (!normalized) {
      return errorResponse("imageUrl or url is required", 400, {
        stage: "validate",
        redirects,
        errorMessage: "Missing image URL",
      })
    }

    if (normalized.startsWith("/")) {
      if (!isAllowedRelativePath(normalized)) {
        return errorResponse("Blocked imageUrl", 400, {
          stage: "validate",
          redirects,
          finalUrl: normalized,
          errorMessage: "Only /mock-images/* relative URLs are allowed",
        })
      }

      const contentType = detectLocalContentType(normalized)
      if (!contentType || !ALLOWED_TYPES.has(contentType)) {
        return errorResponse("Unsupported content type", 400, {
          stage: "mime",
          redirects,
          finalUrl: normalized,
        })
      }

      const localPath = path.join(process.cwd(), "public", normalized)
      const bytes = await fs.readFile(localPath)
      const maxBytes = getMaxBytes()

      if (bytes.byteLength > maxBytes) {
        return errorResponse("Image too large", 400, {
          stage: "size",
          redirects,
          contentType,
          finalUrl: normalized,
          errorMessage: `bytes=${bytes.byteLength}`,
        })
      }

      return NextResponse.json({
        ok: true,
        bytesBase64: Buffer.from(bytes).toString("base64"),
        contentType,
        finalUrl: `local:${normalized}`,
        bytes: bytes.byteLength,
      })
    }

    let currentUrl: URL
    try {
      currentUrl = validateUrl(normalized, allowedHosts)
    } catch (error) {
      return errorResponse("Blocked imageUrl", 400, {
        stage: "validate",
        redirects,
        finalUrl: normalized,
        errorMessage: error instanceof Error ? error.message : "Blocked imageUrl",
      })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), getTimeoutMs())

    try {
      for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
        try {
          await validateResolvedHost(currentUrl)
        } catch (error) {
          return errorResponse("Blocked imageUrl", 400, {
            stage: "validate",
            redirects,
            finalUrl: currentUrl.toString(),
            errorMessage: error instanceof Error ? error.message : "Blocked imageUrl",
          })
        }

        const response = await fetchImageHopWithFallbacks(currentUrl, controller.signal, sourceReferer)

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location")
          if (!location) {
            return errorResponse("Redirect response without location", 502, {
              stage: "redirect",
              redirects,
              status: response.status,
              finalUrl: currentUrl.toString(),
              errorMessage: "Missing Location header",
            })
          }

          const nextUrl = new URL(location, currentUrl)
          redirects.push(nextUrl.toString())
          try {
            currentUrl = validateUrl(nextUrl.toString(), allowedHosts)
          } catch (error) {
            if (error instanceof UrlValidationError && error.code === "allowlist_not_allowed" && error.host) {
              return errorResponse(`Redirect host not allowed: ${error.host}`, 400, {
                stage: "redirect_host_not_allowed",
                redirects,
                status: response.status,
                finalUrl: nextUrl.toString(),
                errorMessage: error.message,
              })
            }
            return errorResponse("Blocked redirect target", 400, {
              stage: "redirect",
              redirects,
              status: response.status,
              finalUrl: nextUrl.toString(),
              errorMessage: error instanceof Error ? error.message : "Blocked redirect target",
            })
          }
          continue
        }

        if (response.status !== 200) {
          return errorResponse("Image download failed", 502, {
            stage: "fetch",
            redirects,
            status: response.status,
            finalUrl: currentUrl.toString(),
          })
        }

        const maxBytes = getMaxBytes()
        const reportedContentType = response.headers.get("content-type")
        const contentLength = response.headers.get("content-length")
        if (contentLength) {
          const parsedLength = Number.parseInt(contentLength, 10)
          if (!Number.isNaN(parsedLength) && parsedLength > maxBytes) {
            return errorResponse("Image too large", 400, {
              stage: "size",
              redirects,
              status: response.status,
              contentType: normalizeReportedContentType(reportedContentType),
              finalUrl: currentUrl.toString(),
              errorMessage: `content-length=${parsedLength}`,
            })
          }
        }

        const bytes = await readResponseBytes(response, maxBytes)
        if (!bytes) {
          return errorResponse("Image too large", 400, {
            stage: "size",
            redirects,
            status: response.status,
            contentType: normalizeReportedContentType(reportedContentType),
            finalUrl: currentUrl.toString(),
            errorMessage: `bytes>${maxBytes}`,
          })
        }

        const contentType = resolveImageContentType(bytes)
        if (!contentType) {
          return errorResponse("Unsupported content type", 400, {
            stage: "mime",
            redirects,
            status: response.status,
            contentType: normalizeReportedContentType(reportedContentType),
            finalUrl: currentUrl.toString(),
          })
        }

        const bytesBase64 = Buffer.from(bytes).toString("base64")
        return NextResponse.json({
          ok: true,
          bytesBase64,
          contentType,
          finalUrl: currentUrl.toString(),
          bytes: bytes.byteLength,
        })
      }

      return errorResponse("Too many redirects", 502, {
        stage: "redirect",
        redirects,
        finalUrl: currentUrl.toString(),
        errorMessage: `max redirects ${MAX_REDIRECTS}`,
      })
    } catch (error) {
      return errorResponse("Image download failed", 502, {
        stage: "fetch",
        redirects,
        finalUrl: currentUrl.toString(),
        errorMessage: error instanceof Error ? error.message : "Unknown fetch error",
      })
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    return errorResponse("Image download failed", 502, {
      stage: "fetch",
      redirects,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
