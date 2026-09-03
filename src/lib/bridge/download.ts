import { assertPublicUrl, sanitizeUrlForLogs } from "@/src/lib/bridge/network"
import { fetchPinnedPublicUrl } from "@/src/lib/net/pinnedFetch"

export class PublicDownloadError extends Error {
  constructor(
    readonly code: "INVALID_URL" | "UPSTREAM_FETCH_FAILED" | "LIMIT_EXCEEDED" | "UNSUPPORTED_MEDIA_TYPE",
    message: string,
    readonly status: number,
    readonly targetUrl?: string,
    readonly upstreamStatus?: number,
  ) {
    super(message)
  }
}

type PublicDownloadOptions = {
  accept: string
  maxBytes: number
  timeoutMs: number
  maxRedirects?: number
  contentTypeAllowed?: (contentType: string) => boolean
}

export async function downloadPublicFile(rawUrl: string, options: PublicDownloadOptions) {
  const maxRedirects = options.maxRedirects ?? 3
  let parsedUrl: URL

  try {
    parsedUrl = await assertPublicUrl(rawUrl)
  } catch {
    throw new PublicDownloadError("INVALID_URL", "Invalid or blocked URL.", 400)
  }

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)
    let response: Response

    try {
      response = await fetchPinnedPublicUrl(parsedUrl, {
        method: "GET",
        headers: { Accept: options.accept },
        signal: controller.signal,
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (!location || hop >= maxRedirects) {
          throw new PublicDownloadError(
            "UPSTREAM_FETCH_FAILED",
            location ? "Too many redirects." : "Redirect response without location.",
            400,
            sanitizeUrlForLogs(parsedUrl.toString()),
            response.status,
          )
        }

        try {
          parsedUrl = await assertPublicUrl(new URL(location, parsedUrl).toString())
        } catch {
          throw new PublicDownloadError("INVALID_URL", "Redirect points to a blocked URL.", 400)
        }
        continue
      }

      if (!response.ok) {
        throw new PublicDownloadError(
          "UPSTREAM_FETCH_FAILED",
          "Failed to download remote file.",
          400,
          sanitizeUrlForLogs(parsedUrl.toString()),
          response.status,
        )
      }

      const contentLength = response.headers.get("content-length")
      if (contentLength) {
        const parsedLength = Number.parseInt(contentLength, 10)
        if (!Number.isNaN(parsedLength) && parsedLength > options.maxBytes) {
          throw new PublicDownloadError("LIMIT_EXCEEDED", "Remote file is too large.", 413)
        }
      }

      const contentType = response.headers.get("content-type") ?? ""
      if (contentType && options.contentTypeAllowed && !options.contentTypeAllowed(contentType)) {
        throw new PublicDownloadError("UNSUPPORTED_MEDIA_TYPE", "Unexpected remote file type.", 415)
      }

      if (!response.body) {
        throw new PublicDownloadError("UPSTREAM_FETCH_FAILED", "Remote response has no body.", 400)
      }

      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let totalBytes = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        totalBytes += value.byteLength
        if (totalBytes > options.maxBytes) {
          await reader.cancel().catch(() => undefined)
          throw new PublicDownloadError("LIMIT_EXCEEDED", "Remote file is too large.", 413)
        }
        chunks.push(value)
      }

      return {
        bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes),
        contentType,
        finalUrl: parsedUrl,
      }
    } catch (error) {
      if (error instanceof PublicDownloadError) throw error
      throw new PublicDownloadError(
        "UPSTREAM_FETCH_FAILED",
        error instanceof Error && error.name === "AbortError" ? "Remote download timed out." : "Remote download failed.",
        400,
        sanitizeUrlForLogs(parsedUrl.toString()),
      )
    } finally {
      clearTimeout(timer)
    }
  }

  throw new PublicDownloadError("UPSTREAM_FETCH_FAILED", "Remote download failed.", 400)
}
