import { afterEach, describe, expect, it } from "vitest"

import { checkBridgeAuthorization, getExpectedBridgeToken, readBridgeAuth } from "./auth"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("getExpectedBridgeToken", () => {
  it("prefers PRESENTONIKA_BRIDGE_TOKEN over BRIDGE_TOKEN", () => {
    process.env.PRESENTONIKA_BRIDGE_TOKEN = "primary-token"
    process.env.BRIDGE_TOKEN = "fallback-token"

    expect(getExpectedBridgeToken()).toBe("primary-token")
  })

  it("uses BRIDGE_TOKEN when PRESENTONIKA_BRIDGE_TOKEN is missing", () => {
    delete process.env.PRESENTONIKA_BRIDGE_TOKEN
    process.env.BRIDGE_TOKEN = "fallback-token"

    expect(getExpectedBridgeToken()).toBe("fallback-token")
  })
})

describe("readBridgeAuth", () => {
  it("extracts bearer, fallback, and cookie tokens", () => {
    const request = new Request("http://localhost", {
      headers: {
        authorization: "Bearer bearer-token",
        "x-bridge-token": "legacy-token",
        cookie: "other=1; admin_import=cookie-token",
      },
    })

    expect(readBridgeAuth(request)).toMatchObject({
      authScheme: "Bearer",
      bearerToken: "bearer-token",
      fallbackToken: "legacy-token",
      cookieToken: "cookie-token",
    })
  })
})

describe("checkBridgeAuthorization", () => {
  it("authorizes with bearer token", () => {
    process.env.PRESENTONIKA_BRIDGE_TOKEN = "secret"
    const request = new Request("http://localhost", {
      headers: { authorization: "Bearer secret" },
    })

    expect(checkBridgeAuthorization(request)).toMatchObject({
      enabled: true,
      authorized: true,
    })
  })

  it("authorizes with admin_import cookie", () => {
    process.env.PRESENTONIKA_BRIDGE_TOKEN = "secret"
    const request = new Request("http://localhost", {
      headers: { cookie: "admin_import=secret" },
    })

    expect(checkBridgeAuthorization(request)).toMatchObject({
      enabled: true,
      authorized: true,
    })
  })

  it("returns enabled=false when bridge token is not configured", () => {
    delete process.env.PRESENTONIKA_BRIDGE_TOKEN
    delete process.env.BRIDGE_TOKEN

    const request = new Request("http://localhost")

    expect(checkBridgeAuthorization(request)).toMatchObject({
      enabled: false,
      authorized: false,
    })
  })
})
