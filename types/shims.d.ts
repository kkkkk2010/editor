declare module "fflate" {
  export function unzipSync(data: Uint8Array): Record<string, Uint8Array>
  export function zipSync(data: Record<string, Uint8Array>): Uint8Array
}

declare module "file-saver" {
  export function saveAs(data: Blob | File | string, filename?: string): void
}

declare module "vitest" {
  export const describe: (...args: any[]) => any
  export const it: (...args: any[]) => any
  export const test: (...args: any[]) => any
  export const expect: any
  export const beforeEach: (...args: any[]) => any
  export const afterEach: (...args: any[]) => any
  export const beforeAll: (...args: any[]) => any
  export const afterAll: (...args: any[]) => any
  export const vi: any
}

declare module "vitest/config" {
  export function defineConfig(config: any): any
}
