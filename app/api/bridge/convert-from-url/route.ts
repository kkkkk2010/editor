import dns from "node:dns/promises"
import net from "node:net"
import { createBridgeJob } from "@/src/lib/bridge/store"

export const runtime = "nodejs"

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
const DEFAULT_MAX_PPTX_BYTES = 60 * 1024 * 1024
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 90_000

function getBridgeToken() {
  return process.env.BRIDGE_TOKEN?.trim() || ""
}

function getConverterUrl() {
  return process.env.CONVERTER_URL?.trim() || ""
}

function getMaxPptxBytes() {
  const raw = process.env.BRIDGE_MAX_PPTX_BYTES
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_MAX_PPTX_BYTES
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

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map((part) => Number.parseInt(part, 10))
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 0) return true
    return false
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase()
    if (normalized === "::1") return true
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true
    if (normalized.startsWith("fe80")) return true
    return false
  }

  return true
}

async function assertPublicUrl(rawUrl: string) {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Response(JSON.stringify(errorBody("INVALID_URL", "Invalid pptxUrl.")), { status: 400 })
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Response(JSON.stringify(errorBody("INVALID_URL", "Only http/https URLs are allowed.")), {
      status: 400,
    })
  }

  const hostname = parsed.hostname.toLowerCase()
  if (hostname === "localhost") {
    throw new Response(JSON.stringify(errorBody("INVALID_URL", "Blocked host.")), { status: 400 })
  }

  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new Response(JSON.stringify(errorBody("INVALID_URL", "Blocked host.")), { status: 400 })
  }

  try {
    const resolved = await dns.lookup(hostname, { all: true })
    if (!resolved.length || resolved.some((item) => isPrivateIp(item.address))) {
      throw new Error("Blocked host")
    }
  } catch {
    throw new Response(JSON.stringify(errorBody("INVALID_URL", "Blocked host.")), { status: 400 })
  }

  return parsed
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

async function downloadPptx(url: string, maxBytes: number) {
  let response: Response
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        redirect: "follow",
        headers: {
          Accept: PPTX_MIME,
        },
        cache: "no-store",
      },
      getDownloadTimeoutMs(),
    )
  } catch (error) {
    throw new Response(
      JSON.stringify(
        errorBody("UPSTREAM_FETCH_FAILED", "Failed to download PPTX.", {
          targetUrl: url,
          details: error instanceof Error ? { message: error.message } : undefined,
        }),
      ),
      { status: 400 },
    )
  }

  if (!response.ok) {
    throw new Response(JSON.stringify(errorBody("UPSTREAM_FETCH_FAILED", "Failed to download PPTX.", { targetUrl: url })), {
      status: 400,
    })
  }

  const contentLength = response.headers.get("content-length")
  if (contentLength) {
    const parsed = Number.parseInt(contentLength, 10)
    if (!Number.isNaN(parsed) && parsed > maxBytes) {
      throw new Response(JSON.stringify(errorBody("LIMIT_EXCEEDED", "PPTX too large.")), { status: 413 })
    }
  }

  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > maxBytes) {
    throw new Response(JSON.stringify(errorBody("LIMIT_EXCEEDED", "PPTX too large.")), { status: 413 })
  }

  return bytes
}

async function convertPptx(bytes: ArrayBuffer) {
  const converterUrl = getConverterUrl().replace(/\/$/, "")
  if (!converterUrl) {
    throw new Response(JSON.stringify(errorBody("INTERNAL", "Converter URL is not configured.")), { status: 500 })
  }

  const targetUrl = `${converterUrl}/convert`
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": PPTX_MIME,
    },
    body: bytes,
  })

  const requestId = response.headers.get("x-request-id") ?? undefined
  const contentType = response.headers.get("content-type") ?? ""

  if (contentType.includes("application/zip") && response.ok) {
    return {
      zipBytes: await response.arrayBuffer(),
      requestId,
    }
  }

  if (contentType.includes("application/json")) {
    const payload = await response.json()
    throw new Response(JSON.stringify(errorBody(payload.code ?? "INTERNAL", payload.message ?? "Conversion failed.", {
      requestId: payload.requestId ?? requestId,
      httpStatus: response.status,
      targetUrl,
    })), { status: response.status || 500 })
  }

  throw new Response(JSON.stringify(errorBody("INTERNAL", "Unexpected converter response.", {
    requestId,
    httpStatus: response.status,
    targetUrl,
    details: { contentType },
  })), { status: response.status || 500 })
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

export async function POST(request: Request) {
  const { enabled, authorized } = isAuthorized(request)
  if (!enabled) {
    return Response.json(errorBody("SERVICE_DISABLED", "Bridge is disabled."), { status: 503 })
  }
  if (!authorized) {
    return Response.json(errorBody("UNAUTHORIZED", "Invalid bridge token."), { status: 401 })
  }

  let body: { pptxUrl?: string }
  try {
    body = (await request.json()) as { pptxUrl?: string }
  } catch {
    return Response.json(errorBody("INVALID_REQUEST", "Invalid JSON body."), { status: 400 })
  }

  if (!body.pptxUrl || typeof body.pptxUrl !== "string") {
    return Response.json(errorBody("INVALID_REQUEST", "pptxUrl is required."), { status: 400 })
  }

  try {
    const parsedUrl = await assertPublicUrl(body.pptxUrl)
    const pptxBytes = await downloadPptx(parsedUrl.toString(), getMaxPptxBytes())
    const { zipBytes, requestId } = await convertPptx(pptxBytes)
    const job = await createBridgeJob(zipBytes, requestId)

    const outZipUrl = `/api/bridge/outzip/${job.jobId}?t=${encodeURIComponent(job.token)}`
    return Response.json({
      ok: true,
      jobId: job.jobId,
      outZipUrl,
      expiresAt: job.expiresAt,
      ...(requestId ? { requestId } : {}),
    })
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, {
        status: error.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    return Response.json(errorBody("INTERNAL", "Bridge conversion failed."), { status: 500 })
  }
}
