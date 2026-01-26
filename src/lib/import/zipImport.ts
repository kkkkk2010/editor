import { unzipSync } from "fflate"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"
import { validateImporterDoc } from "@/src/lib/import/validateImporterDoc"
import { computeSourceSlideSize } from "@/src/lib/import/mapImporterToEditor"
import type { AssetStore } from "@/src/lib/assets/assetStore"

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export interface ZipImportResult {
  doc: ImporterDoc
  createdUrls: string[]
  sourceSlideSize: { width: number; height: number }
}

export function revokeImportObjectUrls(urls: string[]) {
  urls.forEach((url) => URL.revokeObjectURL(url))
}

function getExtension(path: string): string {
  const parts = path.split(".")
  if (parts.length < 2) return ""
  return parts[parts.length - 1].toLowerCase()
}

function buildDocJson(bytes: Uint8Array): unknown {
  const text = new TextDecoder("utf-8").decode(bytes)
  return JSON.parse(text) as unknown
}

function isCloseTo(a: number, b: number, tolerance = 2): boolean {
  return Math.abs(a - b) <= tolerance
}

function parseSvgSize(svgText: string): { width: number; height: number } | null {
  const widthMatch = svgText.match(/width=[\"']?([0-9.]+)(px)?[\"']?/i)
  const heightMatch = svgText.match(/height=[\"']?([0-9.]+)(px)?[\"']?/i)
  if (widthMatch && heightMatch) {
    const width = Number.parseFloat(widthMatch[1])
    const height = Number.parseFloat(heightMatch[1])
    if (!Number.isNaN(width) && !Number.isNaN(height)) {
      return { width, height }
    }
  }

  const viewBoxMatch = svgText.match(/viewBox=[\"']?([0-9.\\s]+)[\"']?/i)
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/)
    if (parts.length === 4) {
      const width = Number.parseFloat(parts[2])
      const height = Number.parseFloat(parts[3])
      if (!Number.isNaN(width) && !Number.isNaN(height)) {
        return { width, height }
      }
    }
  }

  return null
}

async function getImageDimensions(bytes: Uint8Array, mimeType: string): Promise<{ width: number; height: number } | null> {
  try {
    if (mimeType === "image/svg+xml") {
      const text = new TextDecoder("utf-8").decode(bytes)
      return parseSvgSize(text)
    }

    if (typeof createImageBitmap === "function") {
      const blob = new Blob([toArrayBuffer(bytes)], { type: mimeType })
      const bitmap = await createImageBitmap(blob)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return size
    }
  } catch (error) {
    console.warn("Failed to read image dimensions:", error)
  }

  return null
}

export type ZipImportInput = File | ArrayBuffer | Uint8Array

async function readZipBytes(input: ZipImportInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    return input
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input)
  }
  if (typeof (input as File).arrayBuffer === "function") {
    const arrayBuffer = await (input as File).arrayBuffer()
    return new Uint8Array(arrayBuffer)
  }
  throw new Error("Неподдерживаемый тип входных данных для ZIP импорта")
}

export async function importZipFile(input: ZipImportInput, assetStore?: AssetStore): Promise<ZipImportResult> {
  const zipBytes = await readZipBytes(input)
  const zipContents = unzipSync(zipBytes)
  const entries = new Map(Object.entries(zipContents))

  if (!entries.has("doc.json")) {
    throw new Error("В архиве отсутствует doc.json в корне")
  }

  const docBytes = entries.get("doc.json")
  if (!docBytes) {
    throw new Error("Не удалось прочитать doc.json")
  }

  let parsedDoc: unknown
  try {
    parsedDoc = buildDocJson(docBytes)
  } catch {
    throw new Error("doc.json содержит невалидный JSON")
  }

  const validation = validateImporterDoc(parsedDoc)
  if (!validation.ok) {
    throw new Error(`Ошибка валидации doc.json: ${validation.error}`)
  }

  const createdUrls: string[] = []
  const doc: ImporterDoc = JSON.parse(JSON.stringify(validation.data))
  const elementBounds = computeSourceSlideSize(doc)
  let sourceSlideSize = elementBounds

  const resolveAsset = (path: string): { url: string; mimeType: string } => {
    const assetBytes = entries.get(path)
    if (!assetBytes) {
      throw new Error(`Файл ассета не найден: ${path}`)
    }
    const extension = getExtension(path)
    const mimeType = MIME_TYPES[extension] || "application/octet-stream"
    assetStore?.setAsset(path, assetBytes, mimeType)
    const url = URL.createObjectURL(new Blob([toArrayBuffer(assetBytes)], { type: mimeType }))
    createdUrls.push(url)
    return { url, mimeType }
  }

  try {
    for (const slide of doc.slides) {
      if (slide.background?.type === "image") {
        const backgroundBytes = entries.get(slide.background.src)
        if (backgroundBytes) {
          const extension = getExtension(slide.background.src)
          const mimeType = MIME_TYPES[extension] || "application/octet-stream"
          const dimensions = await getImageDimensions(backgroundBytes, mimeType)
          if (
            dimensions &&
            isCloseTo(dimensions.width, elementBounds.width) &&
            isCloseTo(dimensions.height, elementBounds.height)
          ) {
            sourceSlideSize = dimensions
            break
          }
        }
      }
    }

    doc.slides.forEach((slide) => {
      if (slide.background?.type === "image") {
        const assetPath = slide.background.src
        const resolved = resolveAsset(assetPath)
        slide.background = {
          ...slide.background,
          runtimeSrc: resolved.url,
          src: assetPath,
          assetPath,
        } as typeof slide.background & { assetPath?: string }
      }

      slide.elements.forEach((element) => {
        if (element.type === "image") {
          const assetPath = element.src
          const resolved = resolveAsset(assetPath)
          element.src = assetPath
          ;(element as typeof element & { assetPath?: string; runtimeSrc?: string }).assetPath = assetPath
          ;(element as typeof element & { assetPath?: string; runtimeSrc?: string }).runtimeSrc = resolved.url
        }
      })
    })
  } catch (error) {
    revokeImportObjectUrls(createdUrls)
    throw error
  }

  return { doc, createdUrls, sourceSlideSize }
}
