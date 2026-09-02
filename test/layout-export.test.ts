import { describe, expect, it } from "vitest"
import { unzipSync } from "fflate"
import { exportProjectZip } from "@/src/lib/project/exportProjectZip"
import { AssetStore } from "@/src/lib/assets/assetStore"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"
import {
  buildLayoutOutZipFilename,
  buildPresentationOutZipFilename,
  buildSingleSlideDoc,
} from "@/src/lib/project/layoutExport"

function parseDoc(bytes: Uint8Array): ImporterDoc {
  const entries = unzipSync(bytes)
  const raw = entries["doc.json"]
  if (!raw) throw new Error("doc.json missing")
  return JSON.parse(new TextDecoder().decode(raw)) as ImporterDoc
}

describe("layout out.zip export helpers", () => {
  it("exports current presentation to zip bytes", () => {
    const assetStore = new AssetStore()
    assetStore.setAsset("assets/images/a.png", new Uint8Array([1, 2, 3]), "image/png")

    const doc: ImporterDoc = {
      schemaVersion: 1,
      slideSize: { width: 960, height: 540, unit: "px" },
      slides: [
        {
          id: "slide-1",
          elements: [
            { id: "img-1", type: "image", src: "assets/images/a.png", x: 0, y: 0, width: 100, height: 100 },
          ],
        },
      ],
    }

    const zipBytes = exportProjectZip(doc, assetStore)
    expect(zipBytes).toBeInstanceOf(Uint8Array)
    expect(zipBytes.byteLength).toBeGreaterThan(20)
  })

  it("exports single-slide doc for layout out.zip", () => {
    const assetStore = new AssetStore()
    assetStore.setAsset("assets/images/a.png", new Uint8Array([1]), "image/png")
    assetStore.setAsset("assets/images/b.png", new Uint8Array([2]), "image/png")

    const doc: ImporterDoc = {
      schemaVersion: 1,
      slideSize: { width: 960, height: 540, unit: "px" },
      slides: [
        { id: "cover", elements: [{ id: "img-a", type: "image", src: "assets/images/a.png", x: 0, y: 0, width: 10, height: 10 }] },
        { id: "body", elements: [{ id: "img-b", type: "image", src: "assets/images/b.png", x: 0, y: 0, width: 10, height: 10 }] },
      ],
    }

    const oneSlideDoc = buildSingleSlideDoc(doc, 1)
    const zipBytes = exportProjectZip(oneSlideDoc, assetStore, {
      extraFiles: {
        "meta.json": JSON.stringify({ exportType: "layout" }),
      },
    })

    const parsedDoc = parseDoc(zipBytes)
    const entries = unzipSync(zipBytes)

    expect(parsedDoc.slides).toHaveLength(1)
    expect(parsedDoc.slides[0]?.id).toBe("body")
    expect(entries["assets/images/b.png"]).toBeDefined()
    expect(entries["assets/images/a.png"]).toBeUndefined()
    expect(entries["meta.json"]).toBeDefined()
  })

  it("builds expected file names", () => {
    expect(buildPresentationOutZipFilename("My Deck")).toBe("my-deck.out.zip")
    expect(buildLayoutOutZipFilename("Hero Slide", 0)).toBe("layout-hero-slide.out.zip")
    expect(buildLayoutOutZipFilename("", 3)).toBe("layout-slide-4.out.zip")
  })
})
