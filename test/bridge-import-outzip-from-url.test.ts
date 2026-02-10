import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as dns from "node:dns/promises"
import { POST } from "@/app/api/bridge/import-outzip-from-url/route"

const BRIDGE_TOKEN = "test-bridge-token"
const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04])

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/bridge/import-outzip-from-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
    },
    body: JSON.stringify(body),
  })
}

describe("POST /api/bridge/import-outzip-from-url", () => {
  beforeEach(() => {
    process.env.BRIDGE_TOKEN = BRIDGE_TOKEN
    process.env.BRIDGE_TMP_DIR = "/tmp/outzips-test-import"
    process.env.BRIDGE_MAX_OUTZIP_BYTES = "8"
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.BRIDGE_MAX_OUTZIP_BYTES
  })

  it("returns tokenized outZipUrl for a valid zip", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.concat([ZIP_HEADER, Buffer.from([0x00, 0x01, 0x02, 0x03])]), {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-length": "8",
        },
      }),
    )

    const response = await POST(
      makeRequest({ outZipUrl: "https://presentonika.ru/wp-content/uploads/latest.out.zip" }),
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.outZipUrl).toMatch(/^\/api\/bridge\/outzip\/.+\?t=/)
    expect(payload.expiresAt).toBeTypeOf("string")
    expect(payload.requestId).toBeTypeOf("string")
  })

  it("rejects invalid url protocol", async () => {
    const response = await POST(makeRequest({ outZipUrl: "file:///tmp/latest.out.zip" }))

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.code).toBe("INVALID_URL")
  })

  it("rejects oversized zip", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.concat([ZIP_HEADER, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04])]), {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-length": "9",
        },
      }),
    )

    const response = await POST(
      makeRequest({ outZipUrl: "https://presentonika.ru/wp-content/uploads/latest.out.zip" }),
    )

    expect(response.status).toBe(413)
    const payload = await response.json()
    expect(payload.code).toBe("LIMIT_EXCEEDED")
  })

  it("rejects file with non-zip signature", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.from([0x11, 0x22, 0x33, 0x44, 0x55]), {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": "5",
        },
      }),
    )

    const response = await POST(
      makeRequest({ outZipUrl: "https://presentonika.ru/wp-content/uploads/latest.out.zip" }),
    )

    expect(response.status).toBe(415)
    const payload = await response.json()
    expect(payload.code).toBe("UNSUPPORTED_MEDIA_TYPE")
  })
})
