import { zipSync } from "fflate"

export function makeZipBytes(entries: Record<string, Uint8Array | string>): Uint8Array {
  const encoder = new TextEncoder()
  const files: Record<string, Uint8Array> = {}

  Object.entries(entries).forEach(([path, value]) => {
    files[path] = typeof value === "string" ? encoder.encode(value) : value
  })

  return zipSync(files)
}

export function makeZipInput(bytes: Uint8Array): File | Uint8Array {
  const canUseFile = typeof File !== "undefined" && typeof File.prototype?.arrayBuffer === "function"
  if (canUseFile) {
    return new File([bytes], "fixture.zip", { type: "application/zip" })
  }
  return bytes
}
