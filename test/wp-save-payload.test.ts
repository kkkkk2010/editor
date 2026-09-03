import { describe, expect, it } from "vitest"
import { buildWpSavePayload } from "@/src/lib/save/wpSavePayload"

describe("buildWpSavePayload", () => {
  it("uses staged outZipUrl and keeps requestId for correlation", () => {
    const payload = buildWpSavePayload({
      stagedOutZipUrl: "http://localhost/api/bridge/staged-outzip/abc?t=123",
      presentationId: "18",
      presentationTitle: "  Закон Архимеда  ",
      saveToken: "save-token",
      requestId: "save-req-1",
    })

    expect(payload).toEqual({
      outZipUrl: "http://localhost/api/bridge/staged-outzip/abc?t=123",
      presentationId: "18",
      presentationTitle: "Закон Архимеда",
      saveToken: "save-token",
      requestId: "save-req-1",
    })
    expect(payload.outZipUrl).toContain("/api/bridge/staged-outzip/")
    expect(payload.outZipUrl).not.toContain("/api/bridge/outzip/")
  })

  it("rejects a title longer than the bridge contract allows", () => {
    expect(() => buildWpSavePayload({
      stagedOutZipUrl: "http://localhost/api/bridge/staged-outzip/abc?t=123",
      presentationId: "18",
      presentationTitle: "x".repeat(201),
      saveToken: "save-token",
      requestId: "save-req-2",
    })).toThrow(/must not exceed 200 characters/)
  })
})
