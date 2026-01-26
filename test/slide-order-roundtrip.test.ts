import { describe, expect, it } from "vitest"
import { mapEditorToImporter } from "@/src/lib/import/mapEditorToImporter"
import { importZipFile } from "@/src/lib/import/zipImport"
import { AssetStore } from "@/src/lib/assets/assetStore"
import type { Slide } from "@/lib/types"
import { defaultSlideSize } from "@/lib/types"
import { makeZipBytes, makeZipInput } from "./utils"

describe("slide order roundtrip", () => {
  it("preserves order and content after reorder and duplicate", async () => {
    const slides: Slide[] = [
      {
        id: "slide-a",
        background: { type: "color", value: "#ffffff" },
        elements: [
          {
            id: "text-a",
            type: "text",
            content: "First slide",
            position: { x: 10, y: 10 },
            size: { width: 200, height: 40 },
            style: { fontSizePt: 18, color: "#111111" },
          },
        ],
      },
      {
        id: "slide-b",
        background: { type: "color", value: "#eeeeee" },
        elements: [
          {
            id: "text-b",
            type: "text",
            content: "Second slide",
            position: { x: 20, y: 20 },
            size: { width: 200, height: 40 },
            style: { fontSizePt: 18, color: "#222222" },
          },
        ],
      },
    ]

    const duplicatedSlide: Slide = {
      ...slides[0],
      id: "slide-a-copy",
      elements: slides[0].elements.map((el) => ({ ...el, id: `${el.id}-copy` })),
    }

    const reorderedSlides = [slides[1], duplicatedSlide, slides[0]]
    const importerDoc = mapEditorToImporter(reorderedSlides, defaultSlideSize)
    const zipBytes = makeZipBytes({
      "doc.json": JSON.stringify(importerDoc, null, 2),
    })
    const input = makeZipInput(zipBytes)

    const imported = await importZipFile(input, new AssetStore())

    expect(imported.doc.slides.map((slide) => slide.id)).toEqual(["slide-b", "slide-a-copy", "slide-a"])
    const duplicated = imported.doc.slides[1]
    const duplicatedText = duplicated.elements[0]
    if (duplicatedText.type !== "text") {
      throw new Error("Expected text element")
    }
    expect(duplicatedText.text).toBe("First slide")
  })
})
