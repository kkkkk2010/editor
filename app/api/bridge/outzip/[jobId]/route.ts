import { getBridgeJob, incrementBridgeDownloads, pruneBridgeJobs, readBridgeZip, removeBridgeJob } from "@/src/lib/bridge/store"

export const runtime = "nodejs"

function errorBody(code: string, message: string, requestId?: string) {
  return { code, message, requestId, httpStatus: undefined, targetUrl: undefined, details: undefined }
}

function shouldDebug() {
  return process.env.BRIDGE_DEBUG === "1" || process.env.NODE_ENV !== "production"
}

function logDebug(action: string, job?: { id: string; downloadsUsed: number; maxDownloads: number }) {
  if (!shouldDebug() || !job) return
  console.log("[bridge/outzip]", { action, jobId: job.id, downloadsUsed: job.downloadsUsed, maxDownloads: job.maxDownloads })
}

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  await pruneBridgeJobs()
  const { jobId } = await context.params
  const token = new URL(request.url).searchParams.get("t")

  if (!token) {
    return Response.json(errorBody("UNAUTHORIZED", "Missing download token."), { status: 401 })
  }

  const job = getBridgeJob(jobId)
  if (!job) {
    return Response.json(errorBody("NOT_FOUND", "Job not found."), { status: 404 })
  }

  if (job.expiresAt <= Date.now()) {
    logDebug("expired", job)
    return Response.json(errorBody("EXPIRED", "Download link expired.", job.requestId), { status: 410 })
  }

  if (token !== job.token) {
    logDebug("unauthorized", job)
    return Response.json(errorBody("UNAUTHORIZED", "Invalid download token.", job.requestId), { status: 401 })
  }

  if (job.downloadsUsed >= job.maxDownloads) {
    logDebug("already_used", job)
    return Response.json(errorBody("ALREADY_USED", "Download limit reached.", job.requestId), { status: 410 })
  }

  try {
    incrementBridgeDownloads(job)
    logDebug("served", job)
    const bytes = await readBridgeZip(job)

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="out.zip"',
        "Content-Length": String(bytes.byteLength),
        ...(job.requestId ? { "X-Request-Id": job.requestId } : {}),
      },
    })
  } catch {
    await removeBridgeJob(job)
    logDebug("missing_file", job)
    return Response.json(errorBody("NOT_FOUND", "Job file not found.", job.requestId), { status: 404 })
  }
}
