import { describe, expect, it } from "vitest"
import {
  buildPinnedRequestOptions,
  isBlockedNetworkAddress,
} from "@/src/lib/net/pinnedFetch"

describe("pinned public fetch", () => {
  it("connects to the validated address while preserving TLS SNI and Host", () => {
    const options = buildPinnedRequestOptions(
      new URL("https://images.example.test/photo.jpg?size=large"),
      { address: "93.184.216.34", family: 4 },
      { headers: { Accept: "image/png" } },
    )

    expect(options).toMatchObject({
      hostname: "93.184.216.34",
      family: 4,
      servername: "images.example.test",
      path: "/photo.jpg?size=large",
      headers: {
        accept: "image/png",
        host: "images.example.test",
      },
    })
  })

  it("blocks private, loopback, link-local and mapped private addresses", () => {
    expect(isBlockedNetworkAddress("127.0.0.1")).toBe(true)
    expect(isBlockedNetworkAddress("10.1.2.3")).toBe(true)
    expect(isBlockedNetworkAddress("169.254.169.254")).toBe(true)
    expect(isBlockedNetworkAddress("::1")).toBe(true)
    expect(isBlockedNetworkAddress("::ffff:127.0.0.1")).toBe(true)
    expect(isBlockedNetworkAddress("::ffff:7f00:1")).toBe(true)
    expect(isBlockedNetworkAddress("93.184.216.34")).toBe(false)
  })
})
