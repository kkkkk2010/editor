import { zipSync } from "fflate"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"
import type { AssetStore } from "@/src/lib/assets/assetStore"

function collectAssetPaths(doc: ImporterDoc): string[] {
  const paths = new Set<string>()

  doc.slides.forEach((slide) => {
    if (slide.background?.type === "image") {
      paths.add(slide.background.src)
    }
    slide.elements.forEach((element) => {
      if (element.type === "image") {
        paths.add(element.src)
      }
    })
  })

  return Array.from(paths)
}

export function exportProjectZip(doc: ImporterDoc, assetStore: AssetStore): Uint8Array {
  const encoder = new TextEncoder()
  const files: Record<string, Uint8Array> = {
    "doc.json": encoder.encode(JSON.stringify(doc, null, 2)),
  }

  const assetPaths = collectAssetPaths(doc)
  assetPaths.forEach((path) => {
    const asset = assetStore.getAsset(path)
    if (!asset) {
      throw new Error(`Не найден ассет для экспорта: ${path}`)
    }
    files[path] = asset.bytes
  })

  return zipSync(files, { level: 6 })
}
