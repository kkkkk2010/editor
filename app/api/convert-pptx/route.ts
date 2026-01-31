const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"

function getConverterUrl(): string {
  return process.env.CONVERTER_URL?.trim() || "http://127.0.0.1:3001"
}

function buildJsonError(code: string, message: string, requestId?: string) {
  return {
    code,
    message,
    requestId,
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.includes(PPTX_MIME)) {
    return Response.json(buildJsonError("INVALID_PPTX", "Invalid Content-Type."), { status: 400 })
  }

  const body = await request.arrayBuffer()
  const converterUrl = getConverterUrl().replace(/\/$/, "")
  const response = await fetch(`${converterUrl}/convert`, {
    method: "POST",
    headers: {
      "Content-Type": PPTX_MIME,
    },
    body,
  })

  const responseContentType = response.headers.get("content-type") ?? ""
  const requestId = response.headers.get("x-request-id") ?? undefined

  if (responseContentType.includes("application/zip")) {
    const bytes = await response.arrayBuffer()
    return new Response(bytes, {
      status: response.status,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": bytes.byteLength.toString(),
        ...(requestId ? { "X-Request-Id": requestId } : {}),
      },
    })
  }

  if (responseContentType.includes("application/json")) {
    const jsonBody = await response.json()
    return Response.json(jsonBody, {
      status: response.status,
      headers: requestId ? { "X-Request-Id": requestId } : undefined,
    })
  }

  return Response.json(buildJsonError("INTERNAL", "Unexpected converter response.", requestId), {
    status: response.status || 500,
    headers: requestId ? { "X-Request-Id": requestId } : undefined,
  })
}
