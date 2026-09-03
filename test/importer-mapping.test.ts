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
            fontSizePt: 24,
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
  it("uses declared slide size instead of element bounds", () => {
    const mapped = mapImporterToEditor(baseDoc, { allowResize: true })

    expect(mapped.slideSize).toEqual({ width: 960, height: 540 })
    expect(mapped.metadata.canvasSize).toEqual({ width: 960, height: 540 })
  })

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

  it("preserves image radius and opacity during round-trip", () => {
    const doc: ImporterDoc = {
      ...baseDoc,
      slides: [{
        id: "slide-image",
        elements: [{
          id: "image-1",
          type: "image",
          src: "assets/images/photo.png",
          x: 20,
          y: 30,
          width: 400,
          height: 260,
          objectFit: "cover",
          style: { borderRadius: 28, opacity: 0.9 },
        }],
      }],
    }
    const mapped = mapImporterToEditor(doc, { allowResize: true })
    expect(mapped.slides[0].elements[0].style.borderRadius).toBe(28)
    expect(mapped.slides[0].elements[0].style.opacity).toBe(0.9)

    const roundTripped = mapEditorToImporter(mapped.slides, mapped.slideSize)
    const image = roundTripped.slides[0].elements[0]
    if (image.type !== "image") throw new Error("Expected image element")
    expect(image.style?.borderRadius).toBe(28)
    expect(image.style?.opacity).toBe(0.9)
  })

  it("preserves metadata and locks decorative layers without changing opacity", () => {
    const doc: ImporterDoc = {
      ...baseDoc,
      slides: [{
        id: "slide-shadow",
        elements: [{
          id: "shadow-1",
          type: "shape",
          shapeType: "roundRect",
          x: 40,
          y: 50,
          width: 300,
          height: 180,
          style: { fill: "#000000", opacity: 0.08 },
          meta: { adaptiveRole: "shadow", adaptiveGroup: "card-1" },
        }],
      }],
    }

    const mapped = mapImporterToEditor(doc, { allowResize: true })
    const element = mapped.slides[0].elements[0]
    expect(element.style.locked).toBe(true)
    expect(element.style.opacity).toBe(0.08)
    expect(element.meta?.adaptiveGroup).toBe("card-1")

    const roundTripped = mapEditorToImporter(mapped.slides, mapped.slideSize)
    const shape = roundTripped.slides[0].elements[0]
    if (shape.type !== "shape") throw new Error("Expected shape element")
    expect(shape.style?.locked).toBe(true)
    expect(shape.style?.opacity).toBe(0.08)
    expect(shape.meta?.adaptiveRole).toBe("shadow")
  })
})
