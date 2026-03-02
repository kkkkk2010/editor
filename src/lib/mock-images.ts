import fs from "node:fs/promises"
import path from "node:path"

export type MockImageDefinition = {
  fileName: string
  width: number
  height: number
  contentType: string
  kind: "hero" | "photo" | "icon"
}

const TINY_JPEG_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEBAPDw8PDw8PDw8PDw8PDw8QFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGhAQGi0fHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIABAAEAMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAAAQMC/8QAFhABAQEAAAAAAAAAAAAAAAAAAAEC/9oADAMBAAIQAxAAAAH4mQ//xAAZEAEAAgMAAAAAAAAAAAAAAAABABEhMUH/2gAIAQEAAT8Aq0dD4qf/xAAXEQEAAwAAAAAAAAAAAAAAAAABABEh/9oACAECAQE/AJYf/8QAFxEBAAMAAAAAAAAAAAAAAAAAARARIf/aAAgBAwEBPwCZP//Z"
const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5x7hQAAAAASUVORK5CYII="

export const MOCK_IMAGES: MockImageDefinition[] = [
  { fileName: "hero1.jpg", width: 1600, height: 900, contentType: "image/jpeg", kind: "hero" },
  { fileName: "hero2.jpg", width: 1600, height: 900, contentType: "image/jpeg", kind: "hero" },
  { fileName: "photo1.jpg", width: 1200, height: 800, contentType: "image/jpeg", kind: "photo" },
  { fileName: "photo2.jpg", width: 1200, height: 800, contentType: "image/jpeg", kind: "photo" },
  { fileName: "icon1.png", width: 512, height: 512, contentType: "image/png", kind: "icon" },
  { fileName: "icon2.png", width: 512, height: 512, contentType: "image/png", kind: "icon" },
]

function imageBytesByType(contentType: string) {
  if (contentType === "image/png") {
    return Buffer.from(TINY_PNG_BASE64, "base64")
  }
  return Buffer.from(TINY_JPEG_BASE64, "base64")
}

export async function ensureMockImagesOnDisk() {
  const mockDir = path.join(process.cwd(), "public", "mock-images")
  await fs.mkdir(mockDir, { recursive: true })

  await Promise.all(
    MOCK_IMAGES.map(async (image) => {
      const absolutePath = path.join(mockDir, image.fileName)
      try {
        await fs.access(absolutePath)
      } catch {
        await fs.writeFile(absolutePath, imageBytesByType(image.contentType))
      }
    }),
  )
}

export function hashQuery(query: string) {
  let hash = 2166136261
  for (let i = 0; i < query.length; i += 1) {
    hash ^= query.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
