import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import dns from "node:dns/promises"
import fs from "node:fs/promises"
import { POST as fetchImagePost } from "@/app/api/images/fetch/route"
import { GET as searchImagesGet, POST as searchImagesPost } from "@/app/api/images/search/route"
import { authorizeImageSearchUsage } from "@/src/lib/bridge/policy"

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
  },
}))

vi.mock("@/src/lib/net/pinnedFetch", () => ({
  fetchPinnedPublicUrl: vi.fn((url: URL, options: RequestInit) => globalThis.fetch(url, options)),
}))

vi.mock("@/src/lib/bridge/policy", () => ({
  resolveBridgePolicy: vi.fn(async (request: Request) => {
    if (request.headers.get("x-test-unauthorized") === "1") {
      return { requestId: "test", enabled: true, authorized: false, authorizationSource: "none" }
    }
    return {
      requestId: "test",
      enabled: true,
      authorized: true,
      authorizationSource: "save-token",
      saveContext: {
        presentationId: request.headers.get("x-presentation-id") || "123",
        userId: "42",
      },
    }
  }),
  authorizeImageSearchUsage: vi.fn(async () => ({
    allowed: true,
    requiresConfirmation: false,
    charged: false,
    cost: 1,
    quota: 8,
    used: 1,
    remaining: 7,
    pointsBalance: 40,
    plan: "basic",
  })),
}))

let requestSequence = 0
let spendLedgerPath = `/tmp/yandex-search-ledger-${process.pid}-${Date.now()}.json`

function jsonRequest(url: string, body: unknown) {
  const source = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const payload = "query" in source && !("placeholderKey" in source)
    ? { ...source, placeholderKey: `test-slot-${++requestSequence}` }
    : source
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-presentation-id": "123" },
    body: JSON.stringify(payload),
  })
}

describe("POST /api/images/fetch", () => {
  const initialNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    delete process.env.IMAGE_FETCH_ALLOWED_HOSTS
    const mutableEnv = process.env as Record<string, string | undefined>
    mutableEnv.NODE_ENV = initialNodeEnv
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

  it("retries blocked hotlinks with image-origin and empty referers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      )

    const response = await fetchImagePost(
      jsonRequest("http://localhost/api/images/fetch", {
        imageUrl: "https://cdn.example.test/photo.jpg",
        pageUrl: "https://publisher.example.test/article",
      }),
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Referer: "https://publisher.example.test/",
    })
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Referer: "https://cdn.example.test/",
    })
    expect(fetchMock.mock.calls[2]?.[1]?.headers).not.toHaveProperty("Referer")
  })

  it("detects a real png even when the source sends a generic content type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    )

    const response = await fetchImagePost(
      jsonRequest("http://localhost/api/images/fetch", {
        imageUrl: "https://images.example.test/photo.bin",
      }),
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.contentType).toBe("image/png")
  })

  it("requests presentation-compatible formats and accepts gif bytes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new TextEncoder().encode("GIF89a"), {
        status: 200,
        headers: { "content-type": "image/gif" },
      }),
    )

    const response = await fetchImagePost(
      jsonRequest("http://localhost/api/images/fetch", {
        imageUrl: "https://images.example.test/animation.gif",
      }),
    )

    expect(response.status).toBe(200)
    expect((await response.json()).contentType).toBe("image/gif")
    const requestHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(requestHeaders.Accept).not.toContain("image/avif")
    expect(requestHeaders.Accept).toContain("image/jpeg")
  })

  it("rejects html even when a source labels it as an image", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new TextEncoder().encode("<html><body>blocked hotlink</body></html>"), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    )

    const response = await fetchImagePost(
      jsonRequest("http://localhost/api/images/fetch", {
        imageUrl: "https://images.example.test/not-really-a-photo.jpg",
      }),
    )

    expect(response.status).toBe(400)
    expect((await response.json()).message).toBe("Unsupported content type")
  })

  it("blocks a public hostname when DNS resolves it to a private address", async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }])
    const fetchMock = vi.spyOn(globalThis, "fetch")

    const response = await fetchImagePost(
      jsonRequest("http://localhost/api/images/fetch", {
        imageUrl: "https://images.example.test/photo.jpg",
      }),
    )

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/images/search", () => {
  beforeEach(() => {
    process.env.YANDEX_SEARCH_SPEND_LEDGER_PATH = spendLedgerPath
    vi.mocked(authorizeImageSearchUsage).mockReset().mockResolvedValue({
      allowed: true,
      requiresConfirmation: false,
      charged: false,
      cost: 1,
      quota: 8,
      used: 1,
      remaining: 7,
      pointsBalance: 40,
      plan: "basic",
    })
  })

  afterEach(async () => {
    delete process.env.YANDEX_SEARCH_ENABLE
    delete process.env.YANDEX_SEARCH_API_KEY
    delete process.env.YANDEX_SEARCH_FOLDER_ID
    delete process.env.YANDEX_SEARCH_MOCK_FALLBACK
    delete process.env.YANDEX_SEARCH_DEFAULT_TYPE
    delete process.env.YANDEX_SEARCH_FAMILY_MODE
    delete process.env.YANDEX_SEARCH_FIX_TYPO_MODE
    delete process.env.YANDEX_SEARCH_RATE_LIMIT_PER_MINUTE
    delete process.env.YANDEX_SEARCH_DAILY_BILLED_LIMIT
    delete process.env.YANDEX_SEARCH_PRESENTATION_BILLED_LIMIT
    delete process.env.YANDEX_SEARCH_SPEND_LEDGER_PATH
    await fs.rm(spendLedgerPath, { force: true })
    spendLedgerPath = `/tmp/yandex-search-ledger-${process.pid}-${Date.now()}-${++requestSequence}.json`
    vi.restoreAllMocks()
  })

  it("rejects direct unauthenticated calls before contacting Yandex", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "true"
    process.env.YANDEX_SEARCH_FOLDER_ID = "folder-id"
    process.env.YANDEX_SEARCH_API_KEY = "api-key"
    const fetchMock = vi.spyOn(globalThis, "fetch")
    const response = await searchImagesPost(
      new Request("http://localhost/api/images/search", {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-unauthorized": "1" },
        body: JSON.stringify({ query: "кот", count: 8, placeholderKey: "img_s1_hero" }),
      }),
    )

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("requires a bounded placeholder key", async () => {
    const response = await searchImagesPost(jsonRequest("http://localhost/api/images/search", { query: "кот", placeholderKey: "" }))
    expect(response.status).toBe(400)
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

  it("reports readiness without exposing credentials", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "true"
    process.env.YANDEX_SEARCH_FOLDER_ID = "folder-id"
    process.env.YANDEX_SEARCH_API_KEY = "secret-api-key"

    const response = await searchImagesGet()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      ok: true,
      provider: "yandex",
      enabled: true,
      configured: true,
      missing: [],
    })
    expect(JSON.stringify(payload)).not.toContain("secret-api-key")
  })

  it("rejects a partially configured provider instead of silently using mock", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "true"
    process.env.YANDEX_SEARCH_FOLDER_ID = "folder-id"

    const response = await searchImagesPost(
      jsonRequest("http://localhost/api/images/search", { query: "кот" }),
    )
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload.ok).toBe(false)
    expect(payload.missing).toEqual(["YANDEX_SEARCH_API_KEY"])
  })

  it("does not hide rejected live credentials behind the mock provider", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "true"
    process.env.YANDEX_SEARCH_FOLDER_ID = "folder-id"
    process.env.YANDEX_SEARCH_API_KEY = "rejected-api-key"
    process.env.YANDEX_SEARCH_MOCK_FALLBACK = "true"
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ message: "forbidden" }, { status: 403 }),
    )

    const response = await searchImagesPost(
      jsonRequest("http://localhost/api/images/search", { query: "кот" }),
    )
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload.ok).toBe(false)
    expect(payload.message).toBe("Yandex image search credentials were rejected")
    expect(payload.results).toBeUndefined()
  })

  it("applies imagePlan negative terms to the Yandex query", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "true"
    process.env.YANDEX_SEARCH_FOLDER_ID = "folder-id"
    process.env.YANDEX_SEARCH_API_KEY = "api-key"
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        rawData: Buffer.from("<yandexsearch><response><results><grouping/></results></response></yandexsearch>").toString(
          "base64",
        ),
      }),
    )

    const response = await searchImagesPost(
      jsonRequest("http://localhost/api/images/search", {
        query: "римская архитектура",
        negative: ["watermark", "low resolution"],
      }),
    )

    expect(response.status).toBe(200)
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(requestBody.query.queryText).toBe("римская архитектура -watermark -low-resolution")
  })

  it("serializes concurrent duplicates and bills a placeholder only once", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "true"
    process.env.YANDEX_SEARCH_FOLDER_ID = "folder-id"
    process.env.YANDEX_SEARCH_API_KEY = "api-key"
    const emptyResponse = Buffer.from(
      "<yandexsearch><response><results><grouping/></results></response></yandexsearch>",
    ).toString("base64")
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return Response.json({ rawData: emptyResponse })
    })
    const body = { query: `parallel-${Date.now()}`, count: 8, placeholderKey: "img_s1_hero" }

    const [first, second] = await Promise.all([
      searchImagesPost(jsonRequest("http://localhost/api/images/search", body)),
      searchImagesPost(jsonRequest("http://localhost/api/images/search", body)),
    ])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await second.json()).reusedPlaceholder).toBe(true)
  })

  it("runs a fresh search when the query changes for the same placeholder", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "true"
    process.env.YANDEX_SEARCH_FOLDER_ID = "folder-id"
    process.env.YANDEX_SEARCH_API_KEY = "api-key"
    const emptyResponse = Buffer.from(
      "<yandexsearch><response><results><grouping/></results></response></yandexsearch>",
    ).toString("base64")
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ rawData: emptyResponse }))
    const first = await searchImagesPost(jsonRequest("http://localhost/api/images/search", {
      query: `исторические здания ${Date.now()}`,
      placeholderKey: "img_s1_hero",
    }))
    const second = await searchImagesPost(jsonRequest("http://localhost/api/images/search", {
      query: `кот ${Date.now()}`,
      placeholderKey: "img_s1_hero",
    }))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((await second.json()).reusedPlaceholder).toBeUndefined()
  })

  it("does not charge a point when the confirmed Yandex request fails", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "true"
    process.env.YANDEX_SEARCH_FOLDER_ID = "folder-id"
    process.env.YANDEX_SEARCH_API_KEY = "api-key"
    const paidPreflight = {
      allowed: false,
      requiresConfirmation: true,
      charged: false,
      cost: 1,
      quota: 8,
      used: 8,
      remaining: 0,
      pointsBalance: 40,
      plan: "basic" as const,
    }
    vi.mocked(authorizeImageSearchUsage).mockResolvedValue(paidPreflight)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ message: "upstream failed" }, { status: 500 }))

    const response = await searchImagesPost(jsonRequest("http://localhost/api/images/search", {
      query: `paid-failure-${Date.now()}`,
      placeholderKey: "img_s3_hero",
      confirmTokenCharge: true,
    }))

    expect(response.status).toBe(502)
    expect(authorizeImageSearchUsage).toHaveBeenCalledTimes(1)
    expect(vi.mocked(authorizeImageSearchUsage).mock.calls[0]?.[1]).toMatchObject({
      confirmTokenCharge: false,
    })
  })

  it("commits a confirmed point only after Yandex returns successfully", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "true"
    process.env.YANDEX_SEARCH_FOLDER_ID = "folder-id"
    process.env.YANDEX_SEARCH_API_KEY = "api-key"
    const paidPreflight = {
      allowed: false,
      requiresConfirmation: true,
      charged: false,
      cost: 1,
      quota: 8,
      used: 8,
      remaining: 0,
      pointsBalance: 40,
      plan: "basic" as const,
    }
    const paidCommit = {
      ...paidPreflight,
      allowed: true,
      requiresConfirmation: false,
      charged: true,
      pointsBalance: 39,
      used: 9,
    }
    const usageMock = vi.mocked(authorizeImageSearchUsage)
      .mockResolvedValueOnce(paidPreflight)
      .mockResolvedValueOnce(paidCommit)
    const emptyResponse = Buffer.from(
      "<yandexsearch><response><results><grouping/></results></response></yandexsearch>",
    ).toString("base64")
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ rawData: emptyResponse }))

    const response = await searchImagesPost(jsonRequest("http://localhost/api/images/search", {
      query: `paid-success-${Date.now()}`,
      placeholderKey: "img_s4_hero",
      confirmTokenCharge: true,
    }))

    expect(response.status).toBe(200)
    expect(usageMock).toHaveBeenCalledTimes(2)
    expect(usageMock.mock.calls[0]?.[1]).toMatchObject({ confirmTokenCharge: false })
    expect(usageMock.mock.calls[1]?.[1]).toMatchObject({ confirmTokenCharge: true })
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(usageMock.mock.invocationCallOrder[1])
    expect((await response.json()).usage).toMatchObject({ charged: true, pointsBalance: 39 })
  })

  it("fails closed when the daily paid-attempt budget is exhausted", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "true"
    process.env.YANDEX_SEARCH_FOLDER_ID = "folder-id"
    process.env.YANDEX_SEARCH_API_KEY = "api-key"
    process.env.YANDEX_SEARCH_DAILY_BILLED_LIMIT = "1"
    const emptyResponse = Buffer.from(
      "<yandexsearch><response><results><grouping/></results></response></yandexsearch>",
    ).toString("base64")
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ rawData: emptyResponse }))

    const first = await searchImagesPost(jsonRequest("http://localhost/api/images/search", {
      query: `budget-a-${Date.now()}`,
      placeholderKey: "img_s1_hero",
    }))
    const second = await searchImagesPost(jsonRequest("http://localhost/api/images/search", {
      query: `budget-b-${Date.now()}`,
      placeholderKey: "img_s2_hero",
    }))

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect((await second.json()).scope).toBe("daily-budget")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("caps arbitrary placeholder keys for one presentation", async () => {
    process.env.YANDEX_SEARCH_ENABLE = "true"
    process.env.YANDEX_SEARCH_FOLDER_ID = "folder-id"
    process.env.YANDEX_SEARCH_API_KEY = "api-key"
    process.env.YANDEX_SEARCH_PRESENTATION_BILLED_LIMIT = "1"
    const emptyResponse = Buffer.from(
      "<yandexsearch><response><results><grouping/></results></response></yandexsearch>",
    ).toString("base64")
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ rawData: emptyResponse }))

    const first = await searchImagesPost(jsonRequest("http://localhost/api/images/search", {
      query: `presentation-a-${Date.now()}`,
      placeholderKey: "attacker_key_1",
    }))
    const second = await searchImagesPost(jsonRequest("http://localhost/api/images/search", {
      query: `presentation-b-${Date.now()}`,
      placeholderKey: "attacker_key_2",
    }))

    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect((await second.json()).scope).toBe("presentation-budget")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
