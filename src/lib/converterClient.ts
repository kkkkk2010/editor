export type ConverterErrorCode =
  | "LIMIT_EXCEEDED"
  | "TIMEOUT_LIBREOFFICE"
  | "TIMEOUT_PDFTOPPM"
  | "INVALID_PPTX"
  | "UNSUPPORTED_FEATURE"
  | "QUEUE_FULL"
  | "QUEUE_TIMEOUT"
  | "UNAUTHORIZED"
  | "INTERNAL"

export type ConverterErrorPayload = {
  code: ConverterErrorCode
  message: string
  requestId?: string
}

export type ConverterErrorDetails = {
  contentType?: string
  responseTextSnippet?: string
  originalErrorName?: string
  originalErrorMessage?: string
}

export class ConverterClientError extends Error {
  code: ConverterErrorCode
  requestId?: string
  httpStatus?: number
  targetUrl?: string
  details?: ConverterErrorDetails

  constructor(
    payload: ConverterErrorPayload,
    options?: {
      httpStatus?: number
      targetUrl?: string
      details?: ConverterErrorDetails
    },
  ) {
    super(payload.message)
    this.name = "ConverterClientError"
    this.code = payload.code ?? "INTERNAL"
    this.requestId = payload.requestId
    this.httpStatus = options?.httpStatus
    this.targetUrl = options?.targetUrl
    this.details = options?.details
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
  "UNAUTHORIZED",
  "INTERNAL",
])

async function parseJsonError(response: Response, targetUrl: string): Promise<ConverterClientError> {
  const contentType = response.headers.get("content-type") ?? ""
  try {
    const payload = (await response.json()) as Partial<ConverterErrorPayload>
    const code = payload.code && CONVERTER_ERROR_CODES.has(payload.code) ? payload.code : "INTERNAL"
    const message = payload.message ?? "Converter request failed."
    return new ConverterClientError(
      { code, message, requestId: payload.requestId },
      {
        httpStatus: response.status,
        targetUrl,
        details: { contentType },
      },
    )
  } catch {
    return new ConverterClientError(
      { code: "INTERNAL", message: "Failed to parse converter error response." },
      {
        httpStatus: response.status,
        targetUrl,
        details: { contentType },
      },
    )
  }
}

async function readResponseSnippet(response: Response, limit = 4096): Promise<string | undefined> {
  try {
    const text = await response.text()
    if (!text) return undefined
    return text.length > limit ? `${text.slice(0, limit)}…` : text
  } catch {
    return undefined
  }
}

async function requestConversion(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const targetUrl = "/api/convert-pptx"
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
    const errorName = error instanceof Error ? error.name : undefined
    const errorMessage = error instanceof Error ? error.message : undefined
    throw new ConverterClientError(
      {
        code: "INTERNAL",
        message: "Network error while calling converter.",
        requestId: undefined,
      },
      {
        targetUrl,
        details: {
          originalErrorName: errorName,
          originalErrorMessage: errorMessage,
        },
      },
    )
  }

  const contentType = response.headers.get("content-type") ?? ""
  const requestId = response.headers.get("x-request-id") ?? undefined
  if (contentType.includes("application/json")) {
    const parsedError = await parseJsonError(response, targetUrl)
    throw parsedError
  }

  if (!response.ok) {
    const responseTextSnippet = await readResponseSnippet(response)
    throw new ConverterClientError(
      {
        code: "INTERNAL",
        message: "Unexpected converter error response.",
        requestId,
      },
      {
        httpStatus: response.status,
        targetUrl,
        details: {
          contentType,
          responseTextSnippet,
        },
      },
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
  if (error instanceof ConverterClientError) {
    return true
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "ConverterClientError" &&
    "code" in error
  )
}
