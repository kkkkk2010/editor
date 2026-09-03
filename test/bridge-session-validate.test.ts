import { describe, expect, it, vi } from "vitest"

const resolveBridgePolicy = vi.hoisted(() => vi.fn())

vi.mock("@/src/lib/bridge/policy", () => ({ resolveBridgePolicy }))

import { POST } from "@/app/api/bridge/session/validate/route"

describe("POST /api/bridge/session/validate", () => {
  it("returns only bounded session metadata for a valid save token", async () => {
    resolveBridgePolicy.mockResolvedValueOnce({
      enabled: true,
      authorized: true,
      authorizationSource: "save-token",
      saveContext: {
        presentationId: "118",
        userId: "42",
        expiresAt: "2026-08-21T12:00:00Z",
      },
    })

    const response = await POST(new Request("http://localhost/api/bridge/session/validate", { method: "POST" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      presentationId: "118",
      expiresAt: "2026-08-21T12:00:00Z",
    })
    expect(response.headers.get("cache-control")).toContain("no-store")
  })

  it("fails closed for an expired or invalid save token", async () => {
    resolveBridgePolicy.mockResolvedValueOnce({ enabled: true, authorized: false })
    const response = await POST(new Request("http://localhost/api/bridge/session/validate", { method: "POST" }))
    expect(response.status).toBe(401)
  })
})
