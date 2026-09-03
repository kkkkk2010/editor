import { stat } from "node:fs/promises"
import {
  getBridgeJob,
  incrementBridgeDownloads,
  pruneBridgeJobs,
  readBridgeZip,
  removeBridgeJob,
} from "@/src/lib/bridge/store"
import { tokensEqual } from "@/src/lib/bridge/auth"

export const runtime = "nodejs"

function errorBody(code: string, message: string, requestId?: string) {
  return { code, message, requestId, httpStatus: undefined, targetUrl: undefined, details: undefined }
}

function shouldDebug() {
  return process.env.BRIDGE_DEBUG === "1"
}

type DebugAction =
  | "head_ok"
  | "get_ok"
  | "already_used"
  | "unauthorized"
  | "expired"
  | "not_found"

function logDebug(action: DebugAction, data: { method: string; jobId: string; downloadsUsed?: number; maxDownloads?: number }) {
  if (!shouldDebug()) return
  console.log("[bridge/outzip]", {
    action,
    method: data.method,
    jobId: data.jobId,
    downloadsUsed: data.downloadsUsed,
    maxDownloads: data.maxDownloads,
  })
}

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  await pruneBridgeJobs()
  const { jobId } = await context.params
  const authorization = request.headers.get("authorization") ?? ""
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
  const token = bearerToken || new URL(request.url).searchParams.get("t") || ""
  const method = request.method.toUpperCase()

  if (!token) {
    logDebug("unauthorized", { method, jobId })
    return Response.json(errorBody("UNAUTHORIZED", "Missing download token."), { status: 401 })
  }

  const job = await getBridgeJob(jobId)
  if (!job) {
    logDebug("not_found", { method, jobId })
    return Response.json(errorBody("NOT_FOUND", "Job not found."), { status: 404 })
  }

  if (job.expiresAt <= Date.now()) {
    logDebug("expired", { method, jobId, downloadsUsed: job.downloadsUsed, maxDownloads: job.maxDownloads })
    return Response.json(errorBody("EXPIRED", "Download link expired.", job.requestId), { status: 410 })
  }

  if (!tokensEqual(token, job.token)) {
    logDebug("unauthorized", { method, jobId, downloadsUsed: job.downloadsUsed, maxDownloads: job.maxDownloads })
    return Response.json(errorBody("UNAUTHORIZED", "Invalid download token.", job.requestId), { status: 401 })
  }

  if (job.downloadsUsed >= job.maxDownloads) {
    logDebug("already_used", { method, jobId, downloadsUsed: job.downloadsUsed, maxDownloads: job.maxDownloads })
    return Response.json(errorBody("ALREADY_USED", "Download limit reached.", job.requestId), { status: 410 })
  }

  const baseHeaders = {
    "Content-Type": "application/zip",
    "X-Bridge-Downloads-Used": String(job.downloadsUsed),
    "X-Bridge-Downloads-Max": String(job.maxDownloads),
    ...(job.requestId ? { "X-Request-Id": job.requestId } : {}),
  }

  if (method === "HEAD") {
    try {
      const stats = await stat(job.filePath)
      logDebug("head_ok", { method, jobId, downloadsUsed: job.downloadsUsed, maxDownloads: job.maxDownloads })
      return new Response(null, {
        status: 200,
        headers: {
          ...baseHeaders,
          "Content-Length": String(stats.size),
        },
      })
    } catch {
      await removeBridgeJob(job)
      logDebug("not_found", { method, jobId })
      return Response.json(errorBody("NOT_FOUND", "Job file not found.", job.requestId), { status: 404 })
    }
  }

  try {
    const downloadsUsed = await incrementBridgeDownloads(job)
    if (downloadsUsed === null) {
      return Response.json(errorBody("ALREADY_USED", "Download limit reached.", job.requestId), { status: 410 })
    }
    const bytes = await readBridgeZip(job)
    logDebug("get_ok", { method, jobId, downloadsUsed: job.downloadsUsed, maxDownloads: job.maxDownloads })

    return new Response(bytes, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Disposition": 'attachment; filename="out.zip"',
        "Content-Length": String(bytes.byteLength),
        "X-Bridge-Downloads-Used": String(job.downloadsUsed),
      },
    })
  } catch {
    await removeBridgeJob(job)
    logDebug("not_found", { method, jobId })
    return Response.json(errorBody("NOT_FOUND", "Job file not found.", job.requestId), { status: 404 })
  }
}
