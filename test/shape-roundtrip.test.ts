import { describe, expect, it } from "vitest"
import { mapEditorToImporter } from "@/src/lib/import/mapEditorToImporter"
import { mapImporterToEditor } from "@/src/lib/import/mapImporterToEditor"
import { importZipFile } from "@/src/lib/import/zipImport"
import { validateImporterDoc } from "@/src/lib/import/validateImporterDoc"
import { AssetStore } from "@/src/lib/assets/assetStore"
import { defaultSlideSize, type Slide } from "@/lib/types"
import { makeProjectZipBytes } from "./utils"

describe("shape save/load roundtrip", () => {
  it("preserves shape elements across export/import", async () => {
    const slides: Slide[] = [
      {
        id: "slide-1",
        background: { type: "color", value: "#ffffff" },
        elements: [
          {
            id: "shape-1",
            type: "shape",
            content: "rectangle",
            position: { x: 10, y: 20 },
            size: { width: 120, height: 80 },
            style: {
              fill: "#ff0000",
              stroke: "#111111",
              strokeWidth: 2,
              opacity: 0.8,
              borderRadius: 6,
            },
          },
        ],
      },
    ]

    const importerDoc = mapEditorToImporter(slides, defaultSlideSize)
    const validation = validateImporterDoc(importerDoc)
    expect(validation.ok).toBe(true)

    const zipBytes = makeProjectZipBytes(importerDoc)

    const imported = await importZipFile(zipBytes, new AssetStore())
    const mapped = mapImporterToEditor(imported.doc, {
      allowResize: true,
      sourceSlideSize: imported.sourceSlideSize,
    })

    const shape = mapped.slides[0].elements.find((element) => element.type === "shape")
    if (!shape || shape.type !== "shape") {
      throw new Error("Expected shape element")
    }

    expect(shape.content).toBe("rectangle")
    expect(shape.position.x).toBeCloseTo(10)
    expect(shape.position.y).toBeCloseTo(20)
    expect(shape.size.width).toBeCloseTo(120)
    expect(shape.size.height).toBeCloseTo(80)
    expect(shape.style.fill).toBe("#ff0000")
    expect(shape.style.stroke).toBe("#111111")
    expect(shape.style.strokeWidth).toBe(2)
    expect(shape.style.opacity).toBe(0.8)
    expect(shape.style.borderRadius).toBe(6)
  })
})
