import { resolveBridgePolicy } from "@/src/lib/bridge/policy"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const policy = await resolveBridgePolicy(request, { scope: "health" })

  if (!policy.enabled) {
    return Response.json(
      {
        code: "SERVICE_DISABLED",
        message: "Bridge is disabled.",
        requestId: policy.requestId,
      },
      { status: 503 },
    )
  }

  if (!policy.authorized) {
    return Response.json(
      {
        code: "UNAUTHORIZED",
        message: "Invalid bridge token.",
        requestId: policy.requestId,
      },
      { status: 401 },
    )
  }

  return Response.json({ ok: true, requestId: policy.requestId }, { status: 200 })
}
