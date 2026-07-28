import { downloadPublicFile, PublicDownloadError } from "@/src/lib/bridge/download"
import { sanitizeUrlForLogs } from "@/src/lib/bridge/network"
import { resolveBridgePolicy } from "@/src/lib/bridge/policy"
import { createBridgeLaunch } from "@/src/lib/bridge/launchStore"
import { createJobFromZipBytes } from "@/src/lib/bridge/store"

export const runtime = "nodejs"

const DEFAULT_MAX_OUTZIP_BYTES = 50 * 1024 * 1024
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 90_000

function positiveEnvInt(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function errorBody(
  code: string,
  message: string,
  options?: { requestId?: string; httpStatus?: number; targetUrl?: string },
) {
  return {
    code,
    message,
    requestId: options?.requestId,
    httpStatus: options?.httpStatus,
    targetUrl: options?.targetUrl,
    details: undefined,
  }
}

function isZipContentType(contentType: string) {
  const normalized = contentType.toLowerCase()
  return normalized.includes("application/zip") || normalized.includes("application/octet-stream")
}

function hasZipSignature(bytes: Buffer) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

type ImportRequest = {
  outZipUrl?: string
  presentationId?: string | number
  saveToken?: string
  saveEndpoint?: string
}

function parseLaunchContext(body: ImportRequest) {
  const hasAny = body.presentationId !== undefined || body.saveToken !== undefined || body.saveEndpoint !== undefined
  if (!hasAny) return null

  const presentationId = String(body.presentationId ?? "").trim()
  const saveToken = typeof body.saveToken === "string" ? body.saveToken.trim() : ""
  const saveEndpoint = typeof body.saveEndpoint === "string" ? body.saveEndpoint.trim() : ""
  if (!/^\d+$/.test(presentationId) || !saveToken || saveToken.length > 512 || !saveEndpoint) {
    throw new Error("Invalid launch context.")
  }

  let parsedEndpoint: URL
  try {
    parsedEndpoint = new URL(saveEndpoint)
  } catch {
    throw new Error("Invalid launch context.")
  }

  const allowedOrigins = (process.env.BRIDGE_SAVE_ENDPOINT_ORIGINS ?? "https://www.presentonika.ru")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (
    parsedEndpoint.protocol !== "https:" ||
    !allowedOrigins.includes(parsedEndpoint.origin) ||
    !parsedEndpoint.pathname.startsWith("/wp-json/presentonika/v1/")
  ) {
    throw new Error("Invalid launch context.")
  }

  parsedEndpoint.search = ""
  parsedEndpoint.hash = ""
  return { presentationId, saveToken, saveEndpoint: parsedEndpoint.toString() }
}

export async function POST(request: Request) {
  const policy = await resolveBridgePolicy(request, { scope: "import-outzip-from-url" })
  if (!policy.enabled) {
    return Response.json(errorBody("SERVICE_DISABLED", "Bridge is disabled.", { requestId: policy.requestId }), { status: 503 })
  }
  if (!policy.authorized) {
    return Response.json(errorBody("UNAUTHORIZED", "Invalid bridge token.", { requestId: policy.requestId }), { status: 401 })
  }

  let body: ImportRequest
  try {
    body = (await request.json()) as ImportRequest
  } catch {
    return Response.json(errorBody("INVALID_REQUEST", "Invalid JSON body.", { requestId: policy.requestId }), { status: 400 })
  }

  if (!body.outZipUrl || typeof body.outZipUrl !== "string") {
    return Response.json(errorBody("INVALID_REQUEST", "outZipUrl is required.", { requestId: policy.requestId }), { status: 400 })
  }

  let launchContext: ReturnType<typeof parseLaunchContext>
  try {
    launchContext = parseLaunchContext(body)
  } catch {
    return Response.json(errorBody("INVALID_REQUEST", "Invalid launch context.", { requestId: policy.requestId }), { status: 400 })
  }

  try {
    const download = await downloadPublicFile(body.outZipUrl, {
      accept: "application/zip, application/octet-stream",
      maxBytes: positiveEnvInt("BRIDGE_MAX_OUTZIP_BYTES", DEFAULT_MAX_OUTZIP_BYTES),
      timeoutMs: positiveEnvInt("BRIDGE_DOWNLOAD_TIMEOUT_MS", DEFAULT_DOWNLOAD_TIMEOUT_MS),
      contentTypeAllowed: isZipContentType,
    })

    if (!hasZipSignature(download.bytes)) {
      return Response.json(errorBody("UNSUPPORTED_MEDIA_TYPE", "Invalid out.zip signature.", { requestId: policy.requestId }), {
        status: 415,
      })
    }

    const job = await createJobFromZipBytes(download.bytes, { requestId: policy.requestId })
    const launch = launchContext
      ? createBridgeLaunch({
          jobId: job.jobId,
          downloadToken: job.token,
          ...launchContext,
        })
      : null
    return Response.json(
      {
        outZipUrl: `/api/bridge/outzip/${job.jobId}?t=${encodeURIComponent(job.token)}`,
        ...(launch ? { launchUrl: `/?launch=${encodeURIComponent(launch.id)}` } : {}),
        expiresAt: job.expiresAt,
        requestId: policy.requestId,
      },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": policy.requestId } },
    )
  } catch (error) {
    const downloadError = error instanceof PublicDownloadError ? error : null
    console.error("[bridge/import-outzip-from-url] request failed", {
      requestId: policy.requestId,
      url: sanitizeUrlForLogs(body.outZipUrl),
      code: downloadError?.code ?? "INTERNAL",
    })
    return Response.json(
      errorBody(downloadError?.code ?? "INTERNAL", downloadError?.message ?? "Bridge import failed.", {
        requestId: policy.requestId,
        httpStatus: downloadError?.upstreamStatus,
        targetUrl: downloadError?.targetUrl,
      }),
      {
        status: downloadError?.status ?? 500,
        headers: { "Cache-Control": "no-store", "X-Request-Id": policy.requestId },
      },
    )
  }
}
