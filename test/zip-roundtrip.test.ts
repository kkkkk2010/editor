import { describe, expect, it } from "vitest"
import { unzipSync } from "fflate"
import { importZipFileWithDebug } from "./utils"
import { exportProjectZip } from "@/src/lib/project/exportProjectZip"
import { AssetStore } from "@/src/lib/assets/assetStore"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"
import { makeProjectZipBytes } from "./utils"

const INVALID_ASSET_PREFIX = /^(blob:|data:|https?:|file:)/i

function getDocFromZip(bytes: Uint8Array): ImporterDoc {
  const entries = unzipSync(bytes)
  const docBytes = entries["doc.json"]
  if (!docBytes) {
    throw new Error("doc.json missing")
  }
  return JSON.parse(new TextDecoder("utf-8").decode(docBytes)) as ImporterDoc
}

function getImageCreditsFromZip(bytes: Uint8Array) {
  const entries = unzipSync(bytes)
  const creditsBytes = entries["imageCredits.json"]
  if (!creditsBytes) {
    throw new Error("imageCredits.json missing")
  }
  return JSON.parse(new TextDecoder("utf-8").decode(creditsBytes)) as unknown
}

describe("zip import/export", () => {
  it("imports fixture zip and keeps custom style fields", async () => {
    const importerDoc: ImporterDoc = {
      schemaVersion: 1,
      slideSize: { width: 960, height: 540, unit: "px" },
      slides: [
        {
          id: "slide-1",
          elements: [
            {
              id: "text-1",
              type: "text",
              text: "Fixture",
              x: 10,
              y: 10,
              width: 200,
              height: 50,
              style: { lineHeight: 1.3, customStyleField: "fixture" },
            },
            {
              id: "image-1",
              type: "image",
              src: "assets/images/fixture.png",
              x: 20,
              y: 20,
              width: 100,
              height: 100,
            },
          ],
        },
      ],
    }
    const zipBytes = makeProjectZipBytes(importerDoc, {
      "images/fixture.png": new Uint8Array([1, 2, 3, 4]),
    })
    const assetStore = new AssetStore()
    const result = await importZipFileWithDebug(zipBytes, assetStore)

    expect(result.doc.schemaVersion).toBe(1)
    const textElement = result.doc.slides[0].elements[0]
    if (textElement.type !== "text") {
      throw new Error("Expected text element")
    }

    expect(textElement.style?.lineHeight).toBe(1.3)
    expect(textElement.style?.customStyleField).toBe("fixture")
    expect(assetStore.entries().length).toBeGreaterThan(0)
  })

  it("exports zip with doc.json + used assets and without blob urls", () => {
    const assetStore = new AssetStore()

    const doc: ImporterDoc = {
      schemaVersion: 1,
      slideSize: { width: 960, height: 540, unit: "px" },
      slides: [
        {
          id: "slide-1",
          elements: [
            {
              id: "text-1",
              type: "text",
              text: "Fixture",
              x: 10,
              y: 10,
              width: 200,
              height: 50,
              style: { lineHeight: 1.3, customStyleField: "fixture" },
            },
            {
              id: "image-1",
              type: "image",
              src: "assets/images/fixture.png",
              x: 20,
              y: 20,
              width: 100,
              height: 100,
            },
          ],
        },
      ],
    }

    assetStore.setAsset("assets/images/fixture.png", new Uint8Array([9, 8, 7]), "image/png")
    assetStore.setAsset("assets/unused.png", new Uint8Array([1, 2, 3]), "image/png")

    const exported = exportProjectZip(doc, assetStore)
    const exportedEntries = unzipSync(exported)

    expect(exportedEntries["doc.json"]).toBeDefined()
    expect(exportedEntries["assets/unused.png"]).toBeUndefined()

    const exportedDoc = getDocFromZip(exported)
    const allAssetPaths = new Set<string>()

    exportedDoc.slides.forEach((slide) => {
      if (slide.background?.type === "image") {
        allAssetPaths.add(slide.background.src)
      }
      slide.elements.forEach((element) => {
        if (element.type === "image") {
          allAssetPaths.add(element.src)
        }
      })
    })

    allAssetPaths.forEach((path) => {
      expect(path.startsWith("/")).toBe(false)
      expect(INVALID_ASSET_PREFIX.test(path)).toBe(false)
      expect(exportedEntries[path]).toBeDefined()
    })

    const textElement = exportedDoc.slides[0].elements[0]
    if (textElement.type !== "text") {
      throw new Error("Expected text element")
    }
    expect(textElement.style?.customStyleField).toBe("fixture")
  })

  it("exports minimal doc with doc.json at archive root", () => {
    const assetStore = new AssetStore()
    const doc: ImporterDoc = {
      schemaVersion: 1,
      slideSize: { width: 960, height: 540, unit: "px" },
      slides: [
        {
          id: "slide-1",
          elements: [],
        },
      ],
    }

    const exported = exportProjectZip(doc, assetStore)
    const exportedEntries = unzipSync(exported)

    expect(exportedEntries["doc.json"]).toBeDefined()
    const parsed = getDocFromZip(exported)
    expect(parsed.schemaVersion).toBe(1)
  })

  it("preserves image credits across an out.zip import/export roundtrip", async () => {
    const assetPath = "assets/images/yandex-result.jpg"
    const doc: ImporterDoc = {
      schemaVersion: 1,
      slideSize: { width: 960, height: 540, unit: "px" },
      slides: [
        {
          id: "slide-1",
          elements: [
            {
              id: "image-1",
              type: "image",
              src: assetPath,
              x: 20,
              y: 20,
              width: 300,
              height: 200,
            },
          ],
        },
      ],
    }
    const credits = [
      {
        src: assetPath,
        slot: { slotId: "manual-image-1", slide: 1, element: 0 },
        pageUrl: "https://example.com/source-page",
        imageUrl: "https://cdn.example.com/result.jpg",
        source: "example.com",
        confirmedAt: "2026-08-11T00:00:00.000Z",
      },
    ]
    const initialAssets = new AssetStore()
    initialAssets.setAsset(assetPath, new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg")

    const firstExport = exportProjectZip(doc, initialAssets, { imageCredits: credits })
    const importedAssets = new AssetStore()
    const imported = await importZipFileWithDebug(firstExport, importedAssets)
    const secondExport = exportProjectZip(imported.doc, importedAssets, {
      imageCredits: imported.imageCredits,
    })

    expect(imported.imageCredits).toEqual(credits)
    expect(getImageCreditsFromZip(secondExport)).toEqual({ version: 1, items: credits })
  })

  it("does not export credits for image assets that are no longer used", () => {
    const assetStore = new AssetStore()
    const doc: ImporterDoc = {
      schemaVersion: 1,
      slideSize: { width: 960, height: 540, unit: "px" },
      slides: [{ id: "slide-1", elements: [] }],
    }

    const exported = exportProjectZip(doc, assetStore, {
      imageCredits: [
        {
          src: "assets/images/deleted.jpg",
          slot: { slotId: "manual-deleted", slide: 1, element: 0 },
          pageUrl: "https://example.com/source-page",
          imageUrl: "https://cdn.example.com/deleted.jpg",
          confirmedAt: "2026-08-11T00:00:00.000Z",
        },
      ],
    })

    expect(unzipSync(exported)["imageCredits.json"]).toBeUndefined()
  })
})
