import { describe, expect, it } from "vitest"
import { validateImporterDoc } from "@/src/lib/import/validateImporterDoc"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"

const baseDoc: ImporterDoc = {
  schemaVersion: 1,
  slideSize: { width: 960, height: 540, unit: "px" },
  slides: [
    {
      id: "slide-1",
      background: { type: "image", src: "assets/backgrounds/bg.png" },
      elements: [
        {
          id: "image-1",
          type: "image",
          src: "assets/images/photo.jpg",
          x: 10,
          y: 20,
          width: 100,
          height: 80,
        },
      ],
    },
  ],
}

describe("validateImporterDoc asset path security", () => {
  it("accepts relative asset paths with allowed extensions", () => {
    const result = validateImporterDoc(baseDoc)
    expect(result.ok).toBe(true)
  })

  it("rejects absolute or protocol asset paths", () => {
    const doc = {
      ...baseDoc,
      slides: [
        {
          ...baseDoc.slides[0],
          background: { type: "image", src: "http://example.com/bg.png" },
        },
      ],
    }
    const result = validateImporterDoc(doc)
    expect(result.ok).toBe(false)
  })

  it("rejects path traversal and unsupported extensions", () => {
    const doc = {
      ...baseDoc,
      slides: [
        {
          ...baseDoc.slides[0],
          elements: [
            {
              ...baseDoc.slides[0].elements[0],
              src: "../secrets.txt",
            },
          ],
        },
      ],
    }
    const result = validateImporterDoc(doc)
    expect(result.ok).toBe(false)
  })
})
