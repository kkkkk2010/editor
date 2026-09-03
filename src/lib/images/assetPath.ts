const IMAGE_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
}

export function getImageExtensionForContentType(contentType: string) {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase()
  const extension = IMAGE_EXTENSION_BY_CONTENT_TYPE[normalized]
  if (!extension) throw new Error(`Unsupported image content type: ${contentType}`)
  return extension
}

export function normalizeImageAssetPath(
  preferredPath: string | undefined,
  elementId: string,
  contentType: string,
) {
  const extension = getImageExtensionForContentType(contentType)
  const safeElementId = elementId.replace(/[^a-zA-Z0-9_-]/g, "_") || "image"
  const sourcePath = preferredPath?.trim() || `assets/images/${safeElementId}`
  const slashIndex = Math.max(sourcePath.lastIndexOf("/"), sourcePath.lastIndexOf("\\"))
  const dotIndex = sourcePath.lastIndexOf(".")
  const basePath = dotIndex > slashIndex ? sourcePath.slice(0, dotIndex) : sourcePath
  return `${basePath}.${extension}`
}
