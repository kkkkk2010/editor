import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { POST } from "@/app/api/bridge/stage-outzip/route"

const BRIDGE_TOKEN = "test-bridge-token"
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])

function makeRequest(body: Uint8Array, options?: { cookie?: string; authorization?: string; requestId?: string }) {
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
  }
  if (options?.cookie) headers.Cookie = options.cookie
  if (options?.authorization) headers.Authorization = options.authorization
  if (options?.requestId) headers["x-request-id"] = options.requestId

  const requestBody = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
  return new Request("http://localhost/api/bridge/stage-outzip", {
    method: "POST",
    headers,
    body: requestBody,
  })
}

describe("POST /api/bridge/stage-outzip", () => {
  beforeEach(() => {
    process.env.PRESENTONIKA_BRIDGE_TOKEN = BRIDGE_TOKEN
    process.env.BRIDGE_TMP_DIR = "/tmp/outzips-test-stage"
  })

  afterEach(() => {
    delete process.env.PRESENTONIKA_BRIDGE_TOKEN
  })

  it("authorizes via admin_import cookie", async () => {
    const response = await POST(makeRequest(ZIP_BYTES, { cookie: `admin_import=${BRIDGE_TOKEN}`, requestId: "req-cookie-ok" }))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.ok).toBe(true)
    expect(payload.requestId).toBe("req-cookie-ok")
    expect(payload.outZipUrl).toMatch(/^\/api\/bridge\/staged-outzip\/.+\?t=/)
  })

  it("returns 401 without auth", async () => {
    const response = await POST(makeRequest(ZIP_BYTES, { requestId: "req-no-auth" }))
    expect(response.status).toBe(401)
    const payload = await response.json()
    expect(payload.code).toBe("UNAUTHORIZED")
  })

  it("authorizes save flow via x-presentation-id + x-save-token headers", async () => {
    const request = makeRequest(ZIP_BYTES, { requestId: "req-save-flow" })
    request.headers.set("x-presentation-id", "123")
    request.headers.set("x-save-token", "a".repeat(48))

    const response = await POST(request)
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.ok).toBe(true)
    expect(payload.requestId).toBe("req-save-flow")
  })

  it("rejects invalid zip signature", async () => {
    const badBytes = new Uint8Array([0x00, 0x11, 0x22, 0x33])
    const response = await POST(makeRequest(badBytes, { cookie: `admin_import=${BRIDGE_TOKEN}` }))
    expect(response.status).toBe(415)
    const payload = await response.json()
    expect(payload.code).toBe("UNSUPPORTED_MEDIA_TYPE")
  })
})
