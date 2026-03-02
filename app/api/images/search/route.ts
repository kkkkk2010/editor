import { MOCK_IMAGES, ensureMockImagesOnDisk, hashQuery } from "@/src/lib/mock-images"

export const runtime = "nodejs"

type SearchBody = {
  query?: string
  page?: number
  perPage?: number
}

export async function POST(request: Request) {
  let body: SearchBody = {}
  try {
    body = (await request.json()) as SearchBody
  } catch {
    body = {}
  }

  const query = (body.query ?? "").trim().toLowerCase()
  const page = Math.max(1, Number.isFinite(body.page) ? Number(body.page) : 1)
  const perPageRaw = Number.isFinite(body.perPage) ? Number(body.perPage) : 12
  const perPage = Math.min(30, Math.max(1, perPageRaw))

  await ensureMockImagesOnDisk()

  const seed = hashQuery(`${query}:${page}:${perPage}`)
  const selected = Array.from({ length: perPage }, (_, index) => {
    const item = MOCK_IMAGES[(seed + index) % MOCK_IMAGES.length]
    const relativeUrl = `/mock-images/${item.fileName}`
    return {
      id: `${item.fileName}-${seed}-${index}`,
      title: `${item.kind}-${(seed + index) % 1000}`,
      imageUrl: relativeUrl,
      thumbUrl: relativeUrl,
      pageUrl: "https://picsum.photos/",
      contentType: item.contentType,
      dimensions: {
        width: item.width,
        height: item.height,
      },
    }
  })

  return Response.json({
    ok: true,
    query,
    page,
    perPage,
    total: selected.length,
    results: selected,
  })
}
