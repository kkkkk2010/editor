import { NextResponse } from "next/server"

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
  const imageId = (hash % 1084) + 1
  const hmac = hashString(`${seed}:hmac`).toString(16).padStart(8, "0")
  return {
    id: `${query}-${imageId}-${index + 1}`,
    imageId,
    hmac,
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
  const count = typeof body.count === "number" && body.count > 0 ? Math.min(body.count, 12) : 6

  if (!query) {
    return NextResponse.json({ ok: true, results: [] })
  }

  const encoded = encodeURIComponent(query)
  const results = Array.from({ length: count }, (_, index) => {
    const { id, imageId, hmac } = buildMockImageMeta(query, index)
    return {
      id,
      thumbUrl: `https://via.placeholder.com/300?text=${encoded}-${index + 1}`,
      pageUrl: `https://picsum.photos/id/${imageId}`,
      imageUrl: `https://fastly.picsum.photos/id/${imageId}/1200/800.jpg?hmac=${hmac}`,
      width: 1200,
      height: 800,
      source: "mock",
      licenseLabel: "Demo license",
      licenseUrl: "https://example.com/license",
    }
  })

  return NextResponse.json({ results })
}
