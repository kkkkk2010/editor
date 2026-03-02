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

  it("returns redirect_host_not_allowed when redirect target is outside allowlist", async () => {
    process.env.NODE_ENV = "development"
    process.env.IMAGE_FETCH_ALLOWED_HOSTS = "picsum.photos"

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://fastly.picsum.photos/id/11/1200/800.jpg?hmac=def" },
      }),
    )

    const response = await fetchImagePost(
      jsonRequest("http://localhost/api/images/fetch", {
        imageUrl: "https://picsum.photos/seed/test/1200/800",
      }),
    )

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.ok).toBe(false)
    expect(payload.message).toBe("Redirect host not allowed: fastly.picsum.photos")
    expect(payload.debug?.stage).toBe("redirect_host_not_allowed")
    expect(payload.debug?.redirects).toEqual(["https://fastly.picsum.photos/id/11/1200/800.jpg?hmac=def"])
  })
})

describe("POST /api/images/search", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns deterministic final fastly urls when redirects resolve", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://fastly.picsum.photos/id/101/1200/800.jpg?hmac=ok1" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://fastly.picsum.photos/id/202/1200/800.jpg?hmac=ok2" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://fastly.picsum.photos/id/303/1200/800.jpg?hmac=ok3" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    const requestA = jsonRequest("http://localhost/api/images/search", { query: "кот", count: 3 })
    const requestB = jsonRequest("http://localhost/api/images/search", { query: "кот", count: 3 })

    const responseA = await searchImagesPost(requestA)
    const payloadA = await responseA.json()

    vi.restoreAllMocks()
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://fastly.picsum.photos/id/101/1200/800.jpg?hmac=ok1" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://fastly.picsum.photos/id/202/1200/800.jpg?hmac=ok2" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://fastly.picsum.photos/id/303/1200/800.jpg?hmac=ok3" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    const responseB = await searchImagesPost(requestB)
    const payloadB = await responseB.json()

    expect(payloadA.results.map((item: { id: string }) => item.id)).toEqual(
      payloadB.results.map((item: { id: string }) => item.id),
    )

    const first = payloadA.results[0]
    expect(first.imageUrl).toBe("https://fastly.picsum.photos/id/101/1200/800.jpg?hmac=ok1")
    expect(first.pageUrl).toMatch(/^https:\/\/picsum\.photos\//)
  })

  it("falls back to picsum url when redirect points outside picsum hosts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://example.com/bad" },
      }),
    )

    const response = await searchImagesPost(jsonRequest("http://localhost/api/images/search", { query: "кот", count: 1 }))
    const payload = await response.json()

    expect(payload.results[0].imageUrl).toMatch(/^https:\/\/picsum\.photos\/id\/\d+\/1200\/800$/)
  })
})
