export type AssetEntry = {
  bytes: Uint8Array
  mimeType: string
}

export class AssetStore {
  private assets = new Map<string, AssetEntry>()

  setAsset(path: string, bytes: Uint8Array, mimeType = "application/octet-stream") {
    this.assets.set(path, { bytes, mimeType })
  }

  getAsset(path: string): AssetEntry | undefined {
    return this.assets.get(path)
  }

  hasAsset(path: string): boolean {
    return this.assets.has(path)
  }

  clear() {
    this.assets.clear()
  }

  entries(): Array<[string, AssetEntry]> {
    return Array.from(this.assets.entries())
  }
}
