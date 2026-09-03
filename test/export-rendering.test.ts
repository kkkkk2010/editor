import { describe, expect, it } from "vitest"
import { applyBaseExportElementStyles, applyTextExportElementStyles } from "@/lib/export-ppt"
import type { Element } from "@/lib/types"

describe("PPT raster rendering styles", () => {
  it("preserves authored geometry, opacity, typography and wrapping", () => {
    const element: Element = {
      id: "title",
      type: "text",
      content: "Первая строка\nВторая строка",
      position: { x: 80, y: 92 },
      size: { width: 1376, height: 120 },
      style: {
        fontFamily: "Manrope",
        fontSizePt: 42,
        fontWeight: "700",
        color: "#18202A",
        textAlign: "center",
        lineHeight: 1.04,
        letterSpacing: 0,
        opacity: 0.08,
        rotation: 3,
      },
    }
    const target = document.createElement("div")

    applyBaseExportElementStyles(target, element)
    applyTextExportElementStyles(target, element)

    expect(target.style.left).toBe("80px")
    expect(target.style.width).toBe("1376px")
    expect(target.style.opacity).toBe("0.08")
    expect(target.style.transform).toBe("rotate(3deg)")
    expect(target.style.fontFamily).toBe("Manrope")
    expect(target.style.fontSize).toBe("56px")
    expect(target.style.fontWeight).toBe("700")
    expect(target.style.lineHeight).toBe("1.04")
    expect(target.style.whiteSpace).toBe("pre-wrap")
    expect(target.style.overflow).toBe("visible")
  })
})
