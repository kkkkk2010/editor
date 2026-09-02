import { unzipSync, zipSync } from "fflate"
import { importZipFile, type ZipImportInput, type ZipImportResult } from "@/src/lib/import/zipImport"
import type { AssetStore } from "@/src/lib/assets/assetStore"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"

export function makeProjectZipBytes(
  doc: ImporterDoc,
  assets: Record<string, Uint8Array | string> = {}
): Uint8Array {
  const encoder = new TextEncoder()
  const toBytes = (value: unknown): Uint8Array => {
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value)
    }
    if (typeof value === "string") {
      return new Uint8Array(encoder.encode(value))
    }
    return new Uint8Array(encoder.encode(JSON.stringify(value, null, 2)))
  }
  const files: Record<string, Uint8Array> = {
    "doc.json": toBytes(doc),
  }

  Object.entries(assets).forEach(([assetName, value]) => {
    if (assetName === "doc.json" || assetName === "/doc.json" || assetName === "./doc.json") {
      throw new Error("Assets map must not override doc.json")
    }
    const assetPath = assetName.startsWith("assets/") ? assetName : `assets/${assetName}`
    files[assetPath] = toBytes(value)
  })
  if (!ArrayBuffer.isView(files["doc.json"])) {
    throw new Error("makeProjectZipBytes must serialize doc.json into bytes")
  }

  return zipSync(files)
}

export function makeFixtureZipFile(bytes: Uint8Array): File | Uint8Array {
  const canUseFile = typeof File !== "undefined" && typeof File.prototype?.arrayBuffer === "function"
  if (!canUseFile) {
    return bytes
  }
  const part = bytes.slice()
  return new File([part], "fixture.zip", { type: "application/zip" })
}

export function getZipEntryKeys(bytes: Uint8Array, limit = 50): string[] {
  const entries = unzipSync(bytes)
  return Object.keys(entries).slice(0, limit)
}

export async function importZipFileWithDebug(
  input: ZipImportInput,
  assetStore?: AssetStore
): Promise<ZipImportResult> {
  try {
    return await importZipFile(input, assetStore)
  } catch (error) {
    if (error instanceof Error && error.message.includes("doc.json")) {
      if (input instanceof Uint8Array) {
        console.warn("ZIP entries (first 50):", getZipEntryKeys(input))
      } else if (input instanceof ArrayBuffer) {
        console.warn("ZIP entries (first 50):", getZipEntryKeys(new Uint8Array(input)))
      } else if (typeof File !== "undefined" && input instanceof File) {
        const ab = await input.arrayBuffer()
        console.warn("ZIP entries (first 50):", getZipEntryKeys(new Uint8Array(ab)))
      }
    }
    throw error
  }
}
