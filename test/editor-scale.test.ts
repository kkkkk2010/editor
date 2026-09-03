import { describe, expect, it } from "vitest"
import { calculateEditorScale } from "@/lib/editor-scale"

describe("calculateEditorScale", () => {
  it("fits a slide into the visible editor area", () => {
    expect(calculateEditorScale({
      containerWidth: 1000,
      containerHeight: 700,
      slideWidth: 1536,
      slideHeight: 864,
    })).toBeCloseTo(968 / 1536, 6)
  })

  it("ignores an unmounted or hidden container", () => {
    expect(calculateEditorScale({
      containerWidth: 0,
      containerHeight: 0,
      slideWidth: 1536,
      slideHeight: 864,
    })).toBeNull()
  })

  it("caps oversized workspaces", () => {
    expect(calculateEditorScale({
      containerWidth: 3000,
      containerHeight: 2000,
      slideWidth: 1536,
      slideHeight: 864,
    })).toBe(1.2)
  })
})
