import { NextResponse } from "next/server"
import { assertPublicUrl } from "@/src/lib/bridge/network"

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const TIMEOUT_MS = 10_000
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

function toError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status })
}

export async function POST(request: Request) {
  let body: { imageUrl?: string }
  try {
    body = (await request.json()) as { imageUrl?: string }
  } catch {
    return toError("Invalid JSON body", 400)
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : ""
  if (!imageUrl) {
    return toError("imageUrl is required", 400)
  }

  let parsed: URL
  try {
    parsed = await assertPublicUrl(imageUrl, "Invalid imageUrl")
  } catch {
    return toError("Blocked imageUrl", 400)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "image/jpeg,image/png,image/webp,*/*",
      },
    })

    if (!response.ok) {
      return toError("Image download failed", 400)
    }

    try {
      await assertPublicUrl(response.url, "Invalid imageUrl")
    } catch {
      return toError("Blocked redirect target", 400)
    }

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
    if (!ALLOWED_TYPES.has(contentType)) {
      return toError("Unsupported content type", 415)
    }

    const contentLength = response.headers.get("content-length")
    if (contentLength) {
      const parsedLength = Number.parseInt(contentLength, 10)
      if (!Number.isNaN(parsedLength) && parsedLength > MAX_IMAGE_BYTES) {
        return toError("Image too large", 413)
      }
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return toError("Image too large", 413)
    }

    const bytesBase64 = Buffer.from(bytes).toString("base64")
    return NextResponse.json({
      ok: true,
      bytesBase64,
      contentType,
      byteLength: bytes.byteLength,
    })
  } catch {
    return toError("Image download timeout", 408)
  } finally {
    clearTimeout(timer)
  }
}

