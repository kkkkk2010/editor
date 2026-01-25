import { zipSync } from "fflate"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"
import type { AssetStore } from "@/src/lib/assets/assetStore"

const INVALID_ASSET_PREFIX = /^(blob:|data:|https?:|file:)/i

function assertRelativeAssetPath(path: string) {
  if (!path.trim()) {
    throw new Error("Пустой путь ассета для экспорта")
  }
  if (INVALID_ASSET_PREFIX.test(path)) {
    throw new Error(`Недопустимый URL ассета для экспорта: ${path}`)
  }
  if (path.startsWith("/") || path.startsWith("\\")) {
    throw new Error(`Абсолютные пути ассетов не поддерживаются: ${path}`)
  }
  if (path.includes("..")) {
    throw new Error(`Небезопасный путь ассета для экспорта: ${path}`)
  }
}

function collectAssetPaths(doc: ImporterDoc): string[] {
  const paths = new Set<string>()

  doc.slides.forEach((slide) => {
    if (slide.background?.type === "image") {
      assertRelativeAssetPath(slide.background.src)
      paths.add(slide.background.src)
    }
    slide.elements.forEach((element) => {
      if (element.type === "image") {
        assertRelativeAssetPath(element.src)
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

  const zipped = zipSync(files, { level: 6 })
  const src = zipped instanceof Uint8Array ? zipped : new Uint8Array(zipped)
  const bytes = new Uint8Array(src.byteLength)
  bytes.set(src)
  return bytes
}
