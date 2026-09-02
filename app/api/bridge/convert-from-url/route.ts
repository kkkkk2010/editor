import { downloadPublicFile, PublicDownloadError } from "@/src/lib/bridge/download"
import { resolveBridgePolicy } from "@/src/lib/bridge/policy"
import { createBridgeJob } from "@/src/lib/bridge/store"

export const runtime = "nodejs"

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
const DEFAULT_MAX_PPTX_BYTES = 60 * 1024 * 1024
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

function isPptxContentType(contentType: string) {
  const normalized = contentType.toLowerCase()
  return normalized.includes(PPTX_MIME) || normalized.includes("application/octet-stream")
}

async function convertPptx(bytes: Buffer) {
  const converterUrl = process.env.CONVERTER_URL?.trim().replace(/\/$/, "") ?? ""
  if (!converterUrl) {
    throw new Response(JSON.stringify(errorBody("INTERNAL", "Converter URL is not configured.")), { status: 500 })
  }

  const targetUrl = `${converterUrl}/convert`
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": PPTX_MIME },
    body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  })
  const requestId = response.headers.get("x-request-id") ?? undefined
  const contentType = response.headers.get("content-type") ?? ""

  if (response.ok && contentType.includes("application/zip")) {
    return { zipBytes: await response.arrayBuffer(), requestId }
  }

  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { code?: string; message?: string; requestId?: string }
    throw new Response(
      JSON.stringify(
        errorBody(payload.code ?? "INTERNAL", payload.message ?? "Conversion failed.", {
          requestId: payload.requestId ?? requestId,
          httpStatus: response.status,
          targetUrl,
        }),
      ),
      { status: response.status || 500 },
    )
  }

  throw new Response(
    JSON.stringify(errorBody("INTERNAL", "Unexpected converter response.", { requestId, httpStatus: response.status, targetUrl })),
    { status: response.status || 500 },
  )
}

export async function POST(request: Request) {
  const policy = await resolveBridgePolicy(request, { scope: "convert-from-url" })
  if (!policy.enabled) {
    return Response.json(errorBody("SERVICE_DISABLED", "Bridge is disabled.", { requestId: policy.requestId }), { status: 503 })
  }
  if (!policy.authorized) {
    return Response.json(errorBody("UNAUTHORIZED", "Invalid bridge token.", { requestId: policy.requestId }), { status: 401 })
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
    const download = await downloadPublicFile(body.pptxUrl, {
      accept: `${PPTX_MIME}, application/octet-stream`,
      maxBytes: positiveEnvInt("BRIDGE_MAX_PPTX_BYTES", DEFAULT_MAX_PPTX_BYTES),
      timeoutMs: positiveEnvInt("BRIDGE_DOWNLOAD_TIMEOUT_MS", DEFAULT_DOWNLOAD_TIMEOUT_MS),
      contentTypeAllowed: isPptxContentType,
    })
    const { zipBytes, requestId } = await convertPptx(download.bytes)
    const job = await createBridgeJob(zipBytes, requestId ?? policy.requestId)

    return Response.json(
      {
        ok: true,
        jobId: job.jobId,
        outZipUrl: `/api/bridge/outzip/${job.jobId}?t=${encodeURIComponent(job.token)}`,
        expiresAt: job.expiresAt,
        ...(requestId ? { requestId } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, headers: { "Content-Type": "application/json" } })
    }
    const downloadError = error instanceof PublicDownloadError ? error : null
    return Response.json(
      errorBody(downloadError?.code ?? "INTERNAL", downloadError?.message ?? "Bridge conversion failed.", {
        requestId: policy.requestId,
        httpStatus: downloadError?.upstreamStatus,
        targetUrl: downloadError?.targetUrl,
      }),
      { status: downloadError?.status ?? 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
