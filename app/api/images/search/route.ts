import { NextResponse } from "next/server"

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
  const results = Array.from({ length: count }, (_, index) => ({
    id: `${query}-${index + 1}`,
    thumbUrl: `https://via.placeholder.com/300?text=${encoded}-${index + 1}`,
    pageUrl: `https://example.com/?q=${encoded}`,
  }))

  return NextResponse.json({ ok: true, results })
}
