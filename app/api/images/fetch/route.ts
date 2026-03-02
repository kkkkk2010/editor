import fs from "node:fs/promises"
import path from "node:path"

import { assertPublicUrl } from "@/src/lib/bridge/network"
import { ensureMockImagesOnDisk } from "@/src/lib/mock-images"

export const runtime = "nodejs"

const MAX_BYTES = 8 * 1024 * 1024
const MAX_REDIRECTS = 3

function inferContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".png") return "image/png"
  if (ext === ".webp") return "image/webp"
  return "application/octet-stream"
}

function error(code: string, message: string, status = 400) {
  return Response.json({ ok: false, code, message }, { status })
}

async function readLocalMockImage(imageUrl: string) {
  if (!imageUrl.startsWith("/mock-images/")) {
    throw error("INVALID_URL", "Only /mock-images/* relative URLs are allowed.")
  }

  if (imageUrl.includes("..") || imageUrl.includes("\\")) {
    throw error("INVALID_URL", "Path traversal is not allowed.")
  }

  const normalizedRelPath = imageUrl.replace(/^\//, "")
  const publicDir = path.join(process.cwd(), "public")
  const allowedDir = path.join(publicDir, "mock-images")
  const absoluteFilePath = path.join(process.cwd(), "public", normalizedRelPath)
  const normalizedAbsolute = path.normalize(absoluteFilePath)

  if (normalizedAbsolute !== allowedDir && !normalizedAbsolute.startsWith(`${allowedDir}${path.sep}`)) {
    throw error("INVALID_URL", "Path traversal is not allowed.")
  }

  await ensureMockImagesOnDisk()

  const bytes = await fs.readFile(normalizedAbsolute)
  if (bytes.byteLength > MAX_BYTES) {
    throw error("LIMIT_EXCEEDED", "Image is too large.", 413)
  }

  return {
    bytes,
    contentType: inferContentType(normalizedAbsolute),
    finalUrl: `local:${imageUrl}`,
  }
}

async function fetchRemoteImage(rawUrl: string) {
  let current = await assertPublicUrl(rawUrl, "Invalid imageUrl.")

  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const response = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (i === MAX_REDIRECTS) {
        throw error("TOO_MANY_REDIRECTS", "Too many redirects.")
      }
      const location = response.headers.get("location")
      if (!location) {
        throw error("UPSTREAM_FETCH_FAILED", "Redirect location is missing.")
      }
      current = await assertPublicUrl(new URL(location, current).toString(), "Invalid redirect URL.")
      continue
    }

    if (!response.ok) {
      throw error("UPSTREAM_FETCH_FAILED", "Failed to fetch image.")
    }

    const len = Number.parseInt(response.headers.get("content-length") || "", 10)
    if (!Number.isNaN(len) && len > MAX_BYTES) {
      throw error("LIMIT_EXCEEDED", "Image is too large.", 413)
    }

    const arrayBuffer = await response.arrayBuffer()
    const bytes = Buffer.from(arrayBuffer)
    if (bytes.byteLength > MAX_BYTES) {
      throw error("LIMIT_EXCEEDED", "Image is too large.", 413)
    }

    return {
      bytes,
      contentType: response.headers.get("content-type")?.split(";")[0] || "application/octet-stream",
      finalUrl: current.toString(),
    }
  }

  throw error("UPSTREAM_FETCH_FAILED", "Failed to fetch image.")
}

export async function POST(request: Request) {
  let payload: { imageUrl?: string } = {}
  try {
    payload = (await request.json()) as { imageUrl?: string }
  } catch {
    return error("INVALID_REQUEST", "Invalid JSON body.")
  }

  const imageUrl = payload.imageUrl?.trim()
  if (!imageUrl) {
    return error("INVALID_REQUEST", "imageUrl is required.")
  }

  try {
    const result = imageUrl.startsWith("/") ? await readLocalMockImage(imageUrl) : await fetchRemoteImage(imageUrl)
    return Response.json({
      ok: true,
      bytesBase64: result.bytes.toString("base64"),
      contentType: result.contentType,
      finalUrl: result.finalUrl,
      bytes: result.bytes.byteLength,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return error("INTERNAL", "Failed to fetch image.", 500)
  }
}
