type OperationalEvent = {
  event: string
  level?: "info" | "warning" | "error" | "critical"
  requestId?: string
  presentationId?: string | number
  errorCode?: string
  stage?: string
}

export async function reportOperationalEvent(event: OperationalEvent): Promise<void> {
  const endpoint = process.env.BRIDGE_OBSERVABILITY_URL?.trim()
    || "https://www.presentonika.ru/wp-json/presentonika/v1/editor-observability"
  const bearer = process.env.BRIDGE_SAVE_TOKEN_VALIDATE_BEARER?.trim()
  if (!bearer) return

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1_500)
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        ...(event.requestId ? { "x-request-id": event.requestId } : {}),
      },
      body: JSON.stringify(event),
      cache: "no-store",
      signal: controller.signal,
    })
  } catch {
    console.error(JSON.stringify({ event: "observability.forward_failed", errorCode: "transport" }))
  } finally {
    clearTimeout(timeout)
  }
}
