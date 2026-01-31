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

  constructor(payload: ConverterErrorPayload, httpStatus?: number) {
    super(payload.message)
    this.name = "ConverterClientError"
    this.code = payload.code
    this.requestId = payload.requestId
    this.httpStatus = httpStatus
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
  const baseUrl = process.env.NEXT_PUBLIC_CONVERTER_URL
  if (!baseUrl) {
    throw new ConverterClientError({
      code: "INTERNAL",
      message: "Converter URL is not configured.",
    })
  }
  return baseUrl.replace(/\/$/, "")
}

async function parseJsonError(response: Response): Promise<ConverterClientError> {
  try {
    const payload = (await response.json()) as Partial<ConverterErrorPayload>
    const code = payload.code && CONVERTER_ERROR_CODES.has(payload.code) ? payload.code : "INTERNAL"
    const message = payload.message ?? "Converter request failed."
    return new ConverterClientError({ code, message, requestId: payload.requestId }, response.status)
  } catch (error) {
    return new ConverterClientError(
      { code: "INTERNAL", message: "Failed to parse converter error response." },
      response.status,
    )
  }
}

async function requestConversion(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const baseUrl = getConverterBaseUrl()
  const response = await fetch(`${baseUrl}/convert`, {
    method: "POST",
    headers: {
      "Content-Type": PPTX_MIME,
    },
    body: bytes,
  })

  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    throw await parseJsonError(response)
  }

  if (!response.ok) {
    throw new ConverterClientError(
      {
        code: "INTERNAL",
        message: "Converter returned a non-JSON error response.",
        requestId: response.headers.get("x-request-id") ?? undefined,
      },
      response.status,
    )
  }

  return response.arrayBuffer()
}

export async function convertPptxBytes(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  return requestConversion(bytes)
}

export async function convertPptxFile(file: File): Promise<ArrayBuffer> {
  const bytes = await file.arrayBuffer()
  return requestConversion(bytes)
}

export function isConverterClientError(error: unknown): error is ConverterClientError {
  return error instanceof ConverterClientError
}
