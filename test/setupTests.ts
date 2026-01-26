import { vi } from "vitest"

function arrayBufferFromReader(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    value: function arrayBuffer() {
      return arrayBufferFromReader(this)
    },
    configurable: true,
  })
}

if (typeof File !== "undefined" && !File.prototype.arrayBuffer) {
  Object.defineProperty(File.prototype, "arrayBuffer", {
    value: function arrayBuffer() {
      if (typeof Blob !== "undefined" && Blob.prototype.arrayBuffer) {
        return Blob.prototype.arrayBuffer.call(this)
      }
      return arrayBufferFromReader(this)
    },
    configurable: true,
  })
}

if (typeof URL.createObjectURL !== "function") {
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => "blob:mock"),
    configurable: true,
  })
}

if (typeof URL.revokeObjectURL !== "function") {
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
  })
}
