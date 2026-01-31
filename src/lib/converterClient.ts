export type ConverterErrorCode =
  | "LIMIT_EXCEEDED"
  | "TIMEOUT_LIBREOFFICE"
  | "TIMEOUT_PDFTOPPM"
  | "INVALID_PPTX"
  | "UNSUPPORTED_FEATURE"
  | "QUEUE_FULL"
  | "QUEUE_TIMEOUT"
  | "INTERNAL"

export type ConverterErrorPayload = {
  code: ConverterErrorCode
  message: string
  requestId?: string
}

export class ConverterClientError extends Error {
  code: ConverterErrorCode
  requestId?: string
  httpStatus?: number
  targetUrl?: string

  constructor(payload: ConverterErrorPayload, httpStatus?: number, targetUrl?: string) {
    super(payload.message)
    this.name = "ConverterClientError"
    this.code = payload.code
    this.requestId = payload.requestId
    this.httpStatus = httpStatus
    this.targetUrl = targetUrl
  }
}

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
const CONVERTER_ERROR_CODES = new Set<ConverterErrorCode>([
  "LIMIT_EXCEEDED",
  "TIMEOUT_LIBREOFFICE",
  "TIMEOUT_PDFTOPPM",
  "INVALID_PPTX",
  "UNSUPPORTED_FEATURE",
  "QUEUE_FULL",
  "QUEUE_TIMEOUT",
  "INTERNAL",
])

function getConverterBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_CONVERTER_URL?.trim()
  if (baseUrl) {
    if (!/^https?:\/\//i.test(baseUrl)) {
      throw new ConverterClientError({
        code: "INTERNAL",
        message: "Converter URL must start with http or https.",
      })
    }
    return baseUrl.replace(/\/$/, "")
  }
  return ""
}

async function parseJsonError(response: Response): Promise<ConverterClientError> {
  try {
    const payload = (await response.json()) as Partial<ConverterErrorPayload>
    const code = payload.code && CONVERTER_ERROR_CODES.has(payload.code) ? payload.code : "INTERNAL"
    const message = payload.message ?? "Converter request failed."
    return new ConverterClientError({ code, message, requestId: payload.requestId }, response.status)
  } catch {
    return new ConverterClientError(
      { code: "INTERNAL", message: "Failed to parse converter error response." },
      response.status,
    )
  }
}

async function requestConversion(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const baseUrl = getConverterBaseUrl()
  const targetUrl = baseUrl ? `${baseUrl}/convert` : "/api/convert-pptx"
  let response: Response
  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": PPTX_MIME,
      },
      body: bytes,
    })
  } catch (error) {
    throw new ConverterClientError(
      {
        code: "INTERNAL",
        message: "Network error: converter unreachable.",
        requestId: undefined,
      },
      undefined,
      targetUrl,
    )
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    const parsedError = await parseJsonError(response)
    parsedError.targetUrl = targetUrl
    throw parsedError
  }

  if (!response.ok) {
    throw new ConverterClientError(
      {
        code: "INTERNAL",
        message: "Converter returned a non-JSON error response.",
        requestId: response.headers.get("x-request-id") ?? undefined,
      },
      response.status,
      targetUrl,
    )
  }

  return response.arrayBuffer()
}

export async function convertPptxBytes(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  return requestConversion(bytes)
}

export async function convertPptxFile(file: File): Promise<ArrayBuffer> {
  const bytes = await file.arrayBuffer()
  return convertPptxBytes(bytes)
}

export function isConverterClientError(error: unknown): error is ConverterClientError {
  return error instanceof ConverterClientError
}
