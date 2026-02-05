import { consumeBridgeJob, getBridgeJob, pruneBridgeJobs, readBridgeZip } from "@/src/lib/bridge/store"

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
    return Response.json(errorBody("NOT_FOUND", "Job not found."), { status: 404 })
  }

  if (job.used || job.expiresAt <= Date.now()) {
    await consumeBridgeJob(job)
    return Response.json(errorBody("GONE", "Job expired.", job.requestId), { status: 410 })
  }

  if (token !== job.token) {
    return Response.json(errorBody("UNAUTHORIZED", "Invalid download token.", job.requestId), { status: 401 })
  }

  try {
    const bytes = await readBridgeZip(job)
    await consumeBridgeJob(job)

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
    await consumeBridgeJob(job)
    return Response.json(errorBody("NOT_FOUND", "Job file not found.", job.requestId), { status: 404 })
  }
}
