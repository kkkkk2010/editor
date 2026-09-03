import { resolveBridgePolicy } from "@/src/lib/bridge/policy"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
}

export async function POST(request: Request) {
  const policy = await resolveBridgePolicy(request, {
    scope: "session-validate",
    allowSaveFallback: true,
  })
  if (!policy.enabled) {
    return Response.json({ ok: false, message: "Session validation is unavailable" }, {
      status: 503,
      headers: RESPONSE_HEADERS,
    })
  }
  if (!policy.authorized || !policy.saveContext) {
    return Response.json({ ok: false, message: "Presentation session is invalid or expired" }, {
      status: 401,
      headers: RESPONSE_HEADERS,
    })
  }

  return Response.json({
    ok: true,
    presentationId: policy.saveContext.presentationId,
    expiresAt: policy.saveContext.expiresAt,
  }, { headers: RESPONSE_HEADERS })
}
