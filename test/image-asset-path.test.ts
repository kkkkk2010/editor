import { describe, expect, it } from "vitest"
import { normalizeImageAssetPath } from "@/src/lib/images/assetPath"

describe("image asset paths", () => {
  it("uses the detected MIME type instead of the remote URL extension", () => {
    expect(normalizeImageAssetPath(
      "assets/images/img_s1_hero.jpg",
      "img_s1_hero",
      "image/png",
    )).toBe("assets/images/img_s1_hero.png")
  })

  it("creates a safe path for an extensionless remote image", () => {
    expect(normalizeImageAssetPath(undefined, "image:unsafe/id", "image/webp"))
      .toBe("assets/images/image_unsafe_id.webp")
  })
})
