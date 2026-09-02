const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
const DEFAULT_MAX_PPTX_BYTES = 30 * 1024 * 1024

function getConverterUrl(): string {
  return process.env.CONVERTER_URL?.trim() || "http://127.0.0.1:3001"
}

function getMaxPptxBytes(): number {
  const raw = process.env.CONVERTER_MAX_PPTX_BYTES
  if (!raw) return DEFAULT_MAX_PPTX_BYTES
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_MAX_PPTX_BYTES : parsed
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

  const maxBytes = getMaxPptxBytes()
  const contentLength = request.headers.get("content-length")
  if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
    return Response.json(buildJsonError("LIMIT_EXCEEDED", "PPTX payload too large."), { status: 413 })
  }

  const body = await request.arrayBuffer()
  if (body.byteLength > maxBytes) {
    return Response.json(buildJsonError("LIMIT_EXCEEDED", "PPTX payload too large."), { status: 413 })
  }
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
