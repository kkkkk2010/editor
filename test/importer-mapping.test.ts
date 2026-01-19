import { describe, expect, it } from "vitest"
import { mapImporterToEditor } from "@/src/lib/import/mapImporterToEditor"
import { mapEditorToImporter } from "@/src/lib/import/mapEditorToImporter"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"

const baseDoc: ImporterDoc = {
  schemaVersion: 1,
  slideSize: {
    width: 960,
    height: 540,
    unit: "px",
  },
  slides: [
    {
      id: "slide-1",
      elements: [
        {
          id: "text-1",
          type: "text",
          text: "Привет",
          x: 100,
          y: 120,
          width: 300,
          height: 80,
          rotation: 0,
          style: {
            fontFamily: "Inter",
            fontSize: 24,
            color: "#111111",
            bold: true,
            italic: true,
            underline: true,
            align: "center",
            lineHeight: 1.4,
            customStyleField: "keep-me",
          },
        },
      ],
    },
  ],
}

describe("mapImporterToEditor / mapEditorToImporter", () => {
  it("keeps unknown style fields during round-trip", () => {
    const mapped = mapImporterToEditor(baseDoc, { allowResize: true })
    const roundTripped = mapEditorToImporter(mapped.slides, mapped.slideSize)

    const roundTripStyle = roundTripped.slides[0].elements[0]
    if (roundTripStyle.type !== "text") {
      throw new Error("Expected text element")
    }

    expect(roundTripStyle.style?.lineHeight).toBe(1.4)
    expect(roundTripStyle.style?.customStyleField).toBe("keep-me")
  })
})
