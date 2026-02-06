import {
  getBridgeJob,
  markBridgeJobDownloaded,
  pruneBridgeJobs,
  readBridgeZip,
  removeBridgeJob,
} from "@/src/lib/bridge/store"

export const runtime = "nodejs"

function errorBody(code: string, message: string, requestId?: string) {
  return { code, message, requestId, httpStatus: undefined, targetUrl: undefined, details: undefined }
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
    console.info("[bridge/outzip] not_found", { jobId })
    return Response.json(errorBody("NOT_FOUND", "Job not found."), { status: 404 })
  }

  if (token !== job.token) {
    console.warn("[bridge/outzip] unauthorized", { jobId })
    return Response.json(errorBody("UNAUTHORIZED", "Invalid download token.", job.requestId), { status: 401 })
  }

  if (job.expiresAt <= Date.now()) {
    console.info("[bridge/outzip] expired", { jobId })
    return Response.json(errorBody("EXPIRED", "Download link expired.", job.requestId), { status: 410 })
  }

  if (job.downloadsRemaining <= 0) {
    console.info("[bridge/outzip] already_used", { jobId })
    return Response.json(errorBody("ALREADY_USED", "Download limit reached.", job.requestId), { status: 410 })
  }

  try {
    const bytes = await readBridgeZip(job)
    const remaining = await markBridgeJobDownloaded(job)
    console.info("[bridge/outzip] served", { jobId, remaining })

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
    console.info("[bridge/outzip] missing_file", { jobId })
    return Response.json(errorBody("NOT_FOUND", "Job file not found.", job.requestId), { status: 404 })
  }
}
