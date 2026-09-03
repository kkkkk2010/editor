import { consumeBridgeLaunch } from "@/src/lib/bridge/launchStore"
import { reportOperationalEvent } from "@/src/lib/serverObservability"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
}

export async function GET(_request: Request, context: { params: Promise<{ launchId: string }> }) {
  const { launchId } = await context.params
  const launch = await consumeBridgeLaunch(launchId)
  if (!launch) {
    void reportOperationalEvent({ event: "bridge.launch_expired", level: "warning", errorCode: "not_found" })
    return Response.json({ code: "NOT_FOUND", message: "Launch session is invalid or expired." }, {
      status: 404,
      headers: RESPONSE_HEADERS,
    })
  }

  return Response.json(
    {
      downloadUrl: `/api/bridge/outzip/${launch.jobId}`,
      downloadToken: launch.downloadToken,
      presentationId: launch.presentationId,
      ...(launch.presentationTitle ? { presentationTitle: launch.presentationTitle } : {}),
      saveToken: launch.saveToken,
      saveEndpoint: launch.saveEndpoint,
      expiresAt: new Date(launch.expiresAt).toISOString(),
    },
    { headers: RESPONSE_HEADERS },
  )
}
