import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { unzipSync } from "fflate"
import { importZipFile } from "@/src/lib/import/zipImport"
import { exportProjectZip } from "@/src/lib/project/exportProjectZip"
import { AssetStore } from "@/src/lib/assets/assetStore"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"
import { toArrayBuffer } from "./utils"

const fixtureBase64 = readFileSync("test/fixtures/out.zip.base64", "utf8").trim()
const fixtureBytes = new Uint8Array(Buffer.from(fixtureBase64, "base64"))

const INVALID_ASSET_PREFIX = /^(blob:|data:|https?:|file:)/i

function getDocFromZip(bytes: Uint8Array): ImporterDoc {
  const entries = unzipSync(bytes)
  const docBytes = entries["doc.json"]
  if (!docBytes) {
    throw new Error("doc.json missing")
  }
  return JSON.parse(new TextDecoder("utf-8").decode(docBytes)) as ImporterDoc
}

describe("zip import/export", () => {
  it("imports fixture zip and keeps custom style fields", async () => {
    const bytes = fixtureBytes instanceof Uint8Array ? fixtureBytes : new Uint8Array(fixtureBytes as ArrayBufferLike)
    const file = new File([toArrayBuffer(bytes)], "out.zip", { type: "application/zip" })
    const assetStore = new AssetStore()
    const result = await importZipFile(file, assetStore)

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
    const entries = unzipSync(fixtureBytes)
    const assetStore = new AssetStore()

    Object.entries(entries).forEach(([path, bytes]) => {
      if (path !== "doc.json") {
        assetStore.setAsset(path, bytes)
      }
    })

    assetStore.setAsset("assets/unused.png", new Uint8Array([1, 2, 3]), "image/png")

    const doc = getDocFromZip(fixtureBytes)
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
})
