import { NextResponse } from "next/server"
import net from "node:net"

const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 5
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"])

type DebugPayload = {
  stage: "validate" | "redirect" | "fetch" | "mime" | "size"
  status?: number
  contentType?: string
  finalUrl?: string
  redirects: string[]
  errorMessage?: string
}

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

function getAllowedHosts() {
  const raw = process.env.IMAGE_FETCH_ALLOWED_HOSTS?.trim() || ""
  if (!raw) return [] as string[]
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function isPrivateIpLiteral(hostname: string) {
  if (net.isIPv4(hostname)) {
    const parts = hostname.split(".").map((part) => Number.parseInt(part, 10))
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 0) return true
    return false
  }

  if (net.isIPv6(hostname)) {
    const normalized = hostname.toLowerCase()
    if (normalized === "::1") return true
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true
    if (normalized.startsWith("fe80")) return true
    return false
  }

  return false
}

function validateUrl(rawUrl: string, allowedHosts: string[]) {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error("Invalid URL")
  }

  if (!parsed.protocol || !["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed")
  }

  if (isProd() && parsed.protocol !== "https:") {
    throw new Error("Only https URLs are allowed in production")
  }

  if (parsed.username || parsed.password) {
    throw new Error("URL credentials are not allowed")
  }

  const hostname = parsed.hostname.toLowerCase()
  if (hostname.includes("localhost") || hostname === "::1") {
    throw new Error("Blocked host")
  }

  if (isPrivateIpLiteral(hostname)) {
    throw new Error("Blocked host")
  }

  if (allowedHosts.length > 0 && !allowedHosts.includes(hostname)) {
    throw new Error("Host is not in allowlist")
  }

  return parsed
}

function errorResponse(message: string, status: number, debug?: DebugPayload) {
  return NextResponse.json(
    {
      ok: false,
      message,
      ...(isProd() ? {} : { debug }),
    },
    { status },
  )
}

export async function POST(request: Request) {
  const redirects: string[] = []
  const allowedHosts = getAllowedHosts()

  try {
    let body: { imageUrl?: string; url?: string }
    try {
      body = (await request.json()) as { imageUrl?: string; url?: string }
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
    if (!normalized) {
      return errorResponse("imageUrl or url is required", 400, {
        stage: "validate",
        redirects,
        errorMessage: "Missing image URL",
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
        const response = await fetch(currentUrl.toString(), {
          method: "GET",
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Accept: "image/jpeg,image/png,image/webp,image/svg+xml,*/*",
          },
        })

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

        const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
        if (!contentType.startsWith("image/") || !ALLOWED_TYPES.has(contentType)) {
          return errorResponse("Unsupported content type", 400, {
            stage: "mime",
            redirects,
            status: response.status,
            contentType,
            finalUrl: currentUrl.toString(),
          })
        }

        const maxBytes = getMaxBytes()
        const contentLength = response.headers.get("content-length")
        if (contentLength) {
          const parsedLength = Number.parseInt(contentLength, 10)
          if (!Number.isNaN(parsedLength) && parsedLength > maxBytes) {
            return errorResponse("Image too large", 400, {
              stage: "size",
              redirects,
              status: response.status,
              contentType,
              finalUrl: currentUrl.toString(),
              errorMessage: `content-length=${parsedLength}`,
            })
          }
        }

        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength > maxBytes) {
          return errorResponse("Image too large", 400, {
            stage: "size",
            redirects,
            status: response.status,
            contentType,
            finalUrl: currentUrl.toString(),
            errorMessage: `bytes=${bytes.byteLength}`,
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
