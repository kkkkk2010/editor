import { afterEach, describe, expect, it, vi } from "vitest"
import { POST as fetchImagePost } from "@/app/api/images/fetch/route"
import { POST as searchImagesPost } from "@/app/api/images/search/route"

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/images/fetch", () => {
  const initialNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    delete process.env.IMAGE_FETCH_ALLOWED_HOSTS
    process.env.NODE_ENV = initialNodeEnv
    vi.restoreAllMocks()
  })

  it("supports local mock-images relative urls", async () => {
    const response = await fetchImagePost(
      jsonRequest("http://localhost/api/images/fetch", {
        imageUrl: "/mock-images/hero1.jpg",
      }),
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.ok).toBe(true)
    expect(payload.finalUrl).toBe("local:/mock-images/hero1.jpg")
    expect(payload.contentType).toBe("image/jpeg")
    expect(payload.bytes).toBeGreaterThan(0)
  })

  it("rejects relative urls outside /mock-images", async () => {
    const response = await fetchImagePost(
      jsonRequest("http://localhost/api/images/fetch", {
        imageUrl: "/etc/passwd",
      }),
    )

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.ok).toBe(false)
  })

  it("allows redirect hop to CDN host when suffix allowlist is used", async () => {
    process.env.IMAGE_FETCH_ALLOWED_HOSTS = "picsum.photos,.picsum.photos"

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://fastly.picsum.photos/id/10/1200/800.jpg?hmac=abc" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      )

    const response = await fetchImagePost(
      jsonRequest("http://localhost/api/images/fetch", {
        imageUrl: "https://picsum.photos/seed/test/1200/800",
      }),
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.ok).toBe(true)
    expect(payload.finalUrl).toBe("https://fastly.picsum.photos/id/10/1200/800.jpg?hmac=abc")
  })
})

describe("POST /api/images/search", () => {
  afterEach(() => {
    delete process.env.YANDEX_SEARCH_ENABLE
    delete process.env.YANDEX_SEARCH_API_KEY
    delete process.env.YANDEX_SEARCH_FOLDER_ID
    vi.restoreAllMocks()
  })

  it("returns deterministic local mock urls", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "false"

    const requestA = jsonRequest("http://localhost/api/images/search", { query: "кот", count: 3 })
    const requestB = jsonRequest("http://localhost/api/images/search", { query: "кот", count: 3 })

    const responseA = await searchImagesPost(requestA)
    const payloadA = await responseA.json()

    const responseB = await searchImagesPost(requestB)
    const payloadB = await responseB.json()

    expect(payloadA.results.map((item: { id: string }) => item.id)).toEqual(
      payloadB.results.map((item: { id: string }) => item.id),
    )

    const first = payloadA.results[0]
    expect(first.imageUrl).toMatch(/^\/mock-images\/.+/)
    expect(first.thumbUrl).toBe(first.imageUrl)
    expect(first.pageUrl).toBe("https://picsum.photos/")
    expect(payloadA.provider).toBe("mock")
    expect(payloadA.cached).toBe(false)
  })
})
