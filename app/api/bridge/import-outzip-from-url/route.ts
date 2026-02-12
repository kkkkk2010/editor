import crypto from "node:crypto"
import { assertPublicUrl, sanitizeUrlForLogs } from "@/src/lib/bridge/network"
import { createJobFromZipBytes } from "@/src/lib/bridge/store"

export const runtime = "nodejs"

const DEFAULT_MAX_OUTZIP_BYTES = 50 * 1024 * 1024
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 90_000
const MAX_REDIRECT_HOPS = 3

function getBridgeToken() {
  return process.env.PRESENTONIKA_BRIDGE_TOKEN?.trim() || process.env.BRIDGE_TOKEN?.trim() || ""
}

function getMaxOutzipBytes() {
  const raw = process.env.BRIDGE_MAX_OUTZIP_BYTES
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_MAX_OUTZIP_BYTES
  return parsed
}

function getDownloadTimeoutMs() {
  const raw = process.env.BRIDGE_DOWNLOAD_TIMEOUT_MS
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_DOWNLOAD_TIMEOUT_MS
  return parsed
}

function errorBody(
  code: string,
  message: string,
  options?: { requestId?: string; httpStatus?: number; targetUrl?: string; details?: unknown },
) {
  return {
    code,
    message,
    requestId: options?.requestId,
    httpStatus: options?.httpStatus,
    targetUrl: options?.targetUrl,
    details: options?.details,
  }
}

function isAuthorized(request: Request) {
  const token = getBridgeToken()
  if (!token) return { enabled: false, authorized: false }

  const authorization = request.headers.get("authorization")
  if (authorization?.startsWith("Bearer ")) {
    return { enabled: true, authorized: authorization.slice(7).trim() === token }
  }

  const fallback = request.headers.get("x-bridge-token")
  return { enabled: true, authorized: fallback === token }
}

function getRequestId(request: Request) {
  return request.headers.get("x-request-id")?.trim() || crypto.randomUUID()
}

function isZipContentType(contentType: string) {
  const normalized = contentType.toLowerCase()
  return normalized.includes("application/zip") || normalized.includes("application/octet-stream")
}

function hasZipSignature(bytes: Buffer) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function downloadOutzipWithSafeRedirects(rawUrl: string, requestId: string, maxBytes: number) {
  let parsedUrl = await assertPublicUrl(rawUrl, "Invalid outZipUrl.")

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    let response: Response
    try {
      response = await fetchWithTimeout(
        parsedUrl.toString(),
        {
          method: "GET",
          redirect: "manual",
          headers: {
            Accept: "application/zip, application/octet-stream",
          },
          cache: "no-store",
        },
        getDownloadTimeoutMs(),
      )
    } catch (error) {
      throw new Response(
        JSON.stringify(
          errorBody("UPSTREAM_FETCH_FAILED", "Failed to download out.zip.", {
            requestId,
            targetUrl: sanitizeUrlForLogs(parsedUrl.toString()),
            details: error instanceof Error ? { message: error.message } : undefined,
          }),
        ),
        { status: 400 },
      )
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) {
        throw new Response(
          JSON.stringify(errorBody("UPSTREAM_FETCH_FAILED", "Redirect response without location.", { requestId })),
          { status: 400 },
        )
      }
      if (hop >= MAX_REDIRECT_HOPS) {
        throw new Response(
          JSON.stringify(errorBody("UPSTREAM_FETCH_FAILED", "Too many redirects while downloading out.zip.", { requestId })),
          { status: 400 },
        )
      }
      parsedUrl = await assertPublicUrl(new URL(location, parsedUrl).toString(), "Invalid outZipUrl.")
      continue
    }

    if (!response.ok) {
      throw new Response(
        JSON.stringify(
          errorBody("UPSTREAM_FETCH_FAILED", "Failed to download out.zip.", {
            requestId,
            targetUrl: sanitizeUrlForLogs(parsedUrl.toString()),
            httpStatus: response.status,
          }),
        ),
        { status: 400 },
      )
    }

    const contentLength = response.headers.get("content-length")
    if (contentLength) {
      const parsedLength = Number.parseInt(contentLength, 10)
      if (!Number.isNaN(parsedLength) && parsedLength > maxBytes) {
        throw new Response(JSON.stringify(errorBody("LIMIT_EXCEEDED", "out.zip too large.", { requestId })), {
          status: 413,
        })
      }
    }

    const contentType = response.headers.get("content-type") ?? ""
    if (contentType && !isZipContentType(contentType)) {
      throw new Response(JSON.stringify(errorBody("UNSUPPORTED_MEDIA_TYPE", "Invalid out.zip content type.", { requestId })), {
        status: 415,
      })
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes) {
      throw new Response(JSON.stringify(errorBody("LIMIT_EXCEEDED", "out.zip too large.", { requestId })), { status: 413 })
    }

    if (!hasZipSignature(bytes)) {
      throw new Response(JSON.stringify(errorBody("UNSUPPORTED_MEDIA_TYPE", "Invalid out.zip signature.", { requestId })), {
        status: 415,
      })
    }

    return bytes
  }

  throw new Response(JSON.stringify(errorBody("UPSTREAM_FETCH_FAILED", "Failed to download out.zip.", { requestId })), {
    status: 400,
  })
}

export async function POST(request: Request) {
  const requestId = getRequestId(request)
  const { enabled, authorized } = isAuthorized(request)
  if (!enabled) {
    return Response.json(errorBody("SERVICE_DISABLED", "Bridge is disabled.", { requestId }), { status: 503 })
  }
  if (!authorized) {
    return Response.json(errorBody("UNAUTHORIZED", "Invalid bridge token.", { requestId }), { status: 401 })
  }

  let body: { outZipUrl?: string }
  try {
    body = (await request.json()) as { outZipUrl?: string }
  } catch {
    return Response.json(errorBody("INVALID_REQUEST", "Invalid JSON body.", { requestId }), { status: 400 })
  }

  if (!body.outZipUrl || typeof body.outZipUrl !== "string") {
    return Response.json(errorBody("INVALID_REQUEST", "outZipUrl is required.", { requestId }), { status: 400 })
  }

  try {
    const zipBytes = await downloadOutzipWithSafeRedirects(body.outZipUrl, requestId, getMaxOutzipBytes())
    const job = await createJobFromZipBytes(zipBytes, { requestId })
    const outZipUrl = `/api/bridge/outzip/${job.jobId}?t=${encodeURIComponent(job.token)}`

    return Response.json(
      {
        outZipUrl,
        expiresAt: job.expiresAt,
        requestId,
      },
      { headers: { "X-Request-Id": requestId } },
    )
  } catch (error) {
    if (error instanceof Response) {
      console.error("[bridge/import-outzip-from-url] request failed", {
        requestId,
        url: sanitizeUrlForLogs(body.outZipUrl),
        status: error.status,
      })
      return new Response(error.body, {
        status: error.status,
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      })
    }

    console.error("[bridge/import-outzip-from-url] unexpected error", {
      requestId,
      url: sanitizeUrlForLogs(body.outZipUrl),
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    })
    return Response.json(errorBody("INTERNAL", "Bridge import failed.", { requestId }), {
      status: 500,
      headers: { "X-Request-Id": requestId },
    })
  }
}
