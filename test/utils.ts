import { zipSync } from "fflate"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"

export function makeProjectZipBytes(
  doc: ImporterDoc,
  assets: Record<string, Uint8Array | string> = {}
): Uint8Array {
  const encoder = new TextEncoder()
  const files: Record<string, Uint8Array> = {
    "doc.json": encoder.encode(JSON.stringify(doc, null, 2)),
  }

  Object.entries(assets).forEach(([assetName, value]) => {
    const assetPath = assetName.startsWith("assets/") ? assetName : `assets/${assetName}`
    files[assetPath] = typeof value === "string" ? encoder.encode(value) : value
  })

  return zipSync(files)
}
