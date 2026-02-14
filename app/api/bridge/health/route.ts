import { checkBridgeAuthorization, getBridgeRequestId, logBridgeUnauthorized } from "@/src/lib/bridge/auth"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const requestId = getBridgeRequestId(request)
  const authState = checkBridgeAuthorization(request)
  const { enabled, authorized } = authState

  if (!enabled) {
    return Response.json(
      {
        code: "SERVICE_DISABLED",
        message: "Bridge is disabled.",
        requestId,
      },
      { status: 503 },
    )
  }

  if (!authorized) {
    logBridgeUnauthorized("health", requestId, authState)
    return Response.json(
      {
        code: "UNAUTHORIZED",
        message: "Invalid bridge token.",
        requestId,
      },
      { status: 401 },
    )
  }

  return Response.json({ ok: true, requestId }, { status: 200 })
}
