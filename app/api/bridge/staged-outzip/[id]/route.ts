import { stat } from "node:fs/promises"
import { getBridgeJob, incrementBridgeDownloads, pruneBridgeJobs, readBridgeZip, removeBridgeJob } from "@/src/lib/bridge/store"

export const runtime = "nodejs"

function errorBody(code: string, message: string, requestId?: string) {
  return { code, message, requestId, httpStatus: undefined, targetUrl: undefined, details: undefined }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await pruneBridgeJobs()
  const { id } = await context.params
  const token = new URL(request.url).searchParams.get("t")

  if (!token) {
    return Response.json(errorBody("UNAUTHORIZED", "Missing download token."), { status: 401 })
  }

  const job = getBridgeJob(id)
  if (!job) {
    return Response.json(errorBody("NOT_FOUND", "Job not found."), { status: 404 })
  }

  if (job.expiresAt <= Date.now()) {
    return Response.json(errorBody("EXPIRED", "Download link expired.", job.requestId), { status: 410 })
  }

  if (token !== job.token) {
    return Response.json(errorBody("UNAUTHORIZED", "Invalid download token.", job.requestId), { status: 401 })
  }

  if (job.downloadsUsed >= job.maxDownloads) {
    return Response.json(errorBody("ALREADY_USED", "Download limit reached.", job.requestId), { status: 410 })
  }

  const baseHeaders = {
    "Content-Type": "application/zip",
    ...(job.requestId ? { "X-Request-Id": job.requestId } : {}),
  }

  if (request.method.toUpperCase() === "HEAD") {
    try {
      const fileStat = await stat(job.filePath)
      return new Response(null, { status: 200, headers: { ...baseHeaders, "Content-Length": String(fileStat.size) } })
    } catch {
      await removeBridgeJob(job)
      return Response.json(errorBody("NOT_FOUND", "Job file not found.", job.requestId), { status: 404 })
    }
  }

  try {
    incrementBridgeDownloads(job)
    const bytes = await readBridgeZip(job)
    return new Response(bytes, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Disposition": 'attachment; filename="out.zip"',
        "Content-Length": String(bytes.byteLength),
      },
    })
  } catch {
    await removeBridgeJob(job)
    return Response.json(errorBody("NOT_FOUND", "Job file not found.", job.requestId), { status: 404 })
  }
}

export async function HEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  return GET(request, context)
}
