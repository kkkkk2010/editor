import { NextResponse } from "next/server"

const DEFAULT_COUNT = 6
const MAX_COUNT = 12
const IMAGE_WIDTH = 1200
const IMAGE_HEIGHT = 800

const MOCK_IMAGES = [
  { path: "/mock-images/hero1.jpg", contentType: "image/jpeg" },
  { path: "/mock-images/hero2.jpg", contentType: "image/jpeg" },
  { path: "/mock-images/photo1.jpg", contentType: "image/jpeg" },
  { path: "/mock-images/photo2.jpg", contentType: "image/jpeg" },
  { path: "/mock-images/icon1.png", contentType: "image/png" },
  { path: "/mock-images/icon2.png", contentType: "image/png" },
] as const

function hashString(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function buildMockImageMeta(query: string, index: number) {
  const seed = `${query}:${index}`
  const hash = hashString(seed)
  const image = MOCK_IMAGES[hash % MOCK_IMAGES.length]

  return {
    id: `${query}-${hash}-${index + 1}`,
    image,
  }
}

export async function POST(request: Request) {
  let body: { query?: string; count?: number }
  try {
    body = (await request.json()) as { query?: string; count?: number }
  } catch {
    return NextResponse.json({ ok: true, results: [] })
  }

  const query = typeof body.query === "string" ? body.query.trim() : ""
  const count = typeof body.count === "number" && body.count > 0 ? Math.min(body.count, MAX_COUNT) : DEFAULT_COUNT

  if (!query) {
    return NextResponse.json({ ok: true, results: [] })
  }

  const metas = Array.from({ length: count }, (_, index) => buildMockImageMeta(query, index))
  const results = metas.map(({ id, image }) => ({
    id,
    thumbUrl: image.path,
    pageUrl: "https://picsum.photos/",
    imageUrl: image.path,
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    dimensions: {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
    },
    contentType: image.contentType,
    source: "mock",
    licenseLabel: "Demo license",
    licenseUrl: "https://example.com/license",
  }))

  return NextResponse.json({ results })
}
