import crypto from "node:crypto"
import { checkBridgeAuthorization, logBridgeUnauthorized } from "@/src/lib/bridge/auth"
import { createJobFromZipBytes } from "@/src/lib/bridge/store"

export const runtime = "nodejs"

const DEFAULT_MAX_STAGE_BYTES = 60 * 1024 * 1024

function errorBody(code: string, message: string, requestId?: string) {
  return { code, message, requestId, httpStatus: undefined, targetUrl: undefined, details: undefined }
}

function getMaxStageBytes() {
  const raw = process.env.BRIDGE_MAX_STAGE_OUTZIP_BYTES
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_MAX_STAGE_BYTES
  return parsed
}

function hasValidWpSaveContext(request: Request) {
  const presentationId = request.headers.get("x-presentation-id")?.trim() || ""
  const saveToken = request.headers.get("x-save-token")?.trim() || ""

  const isPresentationIdValid = /^\d+$/.test(presentationId)
  const isSaveTokenValid = saveToken.length >= 24

  return {
    ok: isPresentationIdValid && isSaveTokenValid,
    presentationId,
    hasSaveToken: Boolean(saveToken),
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID()
  const authState = checkBridgeAuthorization(request)
  const { enabled, authorized } = authState
  const wpSaveContext = hasValidWpSaveContext(request)
  if (!enabled) {
    return Response.json(errorBody("SERVICE_DISABLED", "Bridge is disabled.", requestId), { status: 503 })
  }
  if (!authorized && !wpSaveContext.ok) {
    logBridgeUnauthorized("stage-outzip", requestId, authState)
    return Response.json(errorBody("UNAUTHORIZED", "Invalid bridge token.", requestId), { status: 401 })
  }

  if (!authorized && wpSaveContext.ok) {
    console.info("[bridge/stage-outzip] authorized-via-save-context", {
      requestId,
      presentationId: wpSaveContext.presentationId,
      hasSaveToken: wpSaveContext.hasSaveToken,
    })
  }

  const contentLength = request.headers.get("content-length")
  const maxBytes = getMaxStageBytes()
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10)
    if (!Number.isNaN(parsedLength) && parsedLength > maxBytes) {
      return Response.json(errorBody("LIMIT_EXCEEDED", "out.zip too large.", requestId), { status: 413 })
    }
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await request.arrayBuffer())
  } catch {
    return Response.json(errorBody("INVALID_REQUEST", "Invalid request body.", requestId), { status: 400 })
  }

  if (bytes.byteLength === 0) {
    return Response.json(errorBody("INVALID_REQUEST", "Request body is empty.", requestId), { status: 400 })
  }

  if (bytes.byteLength > maxBytes) {
    return Response.json(errorBody("LIMIT_EXCEEDED", "out.zip too large.", requestId), { status: 413 })
  }

  const hasZipSignature = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
  if (!hasZipSignature) {
    return Response.json(errorBody("UNSUPPORTED_MEDIA_TYPE", "Invalid out.zip signature.", requestId), { status: 415 })
  }

  try {
    const job = await createJobFromZipBytes(Buffer.from(bytes), { requestId })
    console.log("[bridge/stage-outzip] staged", { requestId, jobId: job.jobId })
    return Response.json({
      ok: true,
      outZipUrl: `/api/bridge/staged-outzip/${job.jobId}?t=${encodeURIComponent(job.token)}`,
      expiresAt: job.expiresAt,
      requestId,
    })
  } catch {
    return Response.json(errorBody("INTERNAL", "Failed to stage out.zip.", requestId), { status: 500 })
  }
}
