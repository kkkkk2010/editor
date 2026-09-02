export type AssetEntry = {
  bytes: Uint8Array
  mime?: string
}

export class AssetStore {
  private assets = new Map<string, AssetEntry>()

  setAsset(path: string, bytes: Uint8Array, mime = "application/octet-stream") {
    this.assets.set(path, { bytes, mime })
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
