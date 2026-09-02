import { afterEach, describe, expect, it } from "vitest"
import { POST as enableImport } from "@/app/api/admin/enable-import/route"
import { GET as importStatus } from "@/app/api/admin/import-status/route"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("admin import authorization", () => {
  it("is disabled when no admin token is configured", async () => {
    delete process.env.ADMIN_IMPORT_TOKEN
    const enableResponse = await enableImport(new Request("http://localhost/api/admin/enable-import", { method: "POST" }))
    expect(enableResponse.status).toBe(503)

    const statusResponse = await importStatus(new Request("http://localhost/api/admin/import-status"))
    expect(await statusResponse.json()).toEqual({ enabled: false })
  })

  it("accepts the token only from a header and enables the cookie session", async () => {
    process.env.ADMIN_IMPORT_TOKEN = "a-long-admin-token"
    const queryResponse = await enableImport(
      new Request("http://localhost/api/admin/enable-import?token=a-long-admin-token", { method: "POST" }),
    )
    expect(queryResponse.status).toBe(403)

    const enableResponse = await enableImport(new Request("http://localhost/api/admin/enable-import", {
      method: "POST",
      headers: { "x-admin-token": "a-long-admin-token" },
    }))
    expect(enableResponse.status).toBe(200)
    const cookie = enableResponse.headers.get("set-cookie") ?? ""
    expect(cookie).toContain("admin_import=")

    const statusResponse = await importStatus(new Request("http://localhost/api/admin/import-status", {
      headers: { cookie },
    }))
    expect(await statusResponse.json()).toEqual({ enabled: true })
  })
})
