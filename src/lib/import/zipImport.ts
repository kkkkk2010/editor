import { unzipSync } from "fflate"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"
import { computeSourceSlideSize } from "@/src/lib/import/mapImporterToEditor"
import type { AssetStore } from "@/src/lib/assets/assetStore"
import { reportError } from "@/src/lib/monitoring"
import { parseImagePlan, type ImagePlan } from "@/src/lib/import/imagePlan"

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
}
const ALLOWED_ASSET_EXTENSIONS = new Set(Object.keys(MIME_TYPES))
const MAX_ZIP_BYTES = 50 * 1024 * 1024

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export interface ZipImportResult {
  doc: ImporterDoc
  createdUrls: string[]
  sourceSlideSize: { width: number; height: number }
  imagePlan: ImagePlan | null
}

export function revokeImportObjectUrls(urls: string[]) {
  urls.forEach((url) => URL.revokeObjectURL(url))
}

function getExtension(path: string): string {
  const parts = path.split(".")
  if (parts.length < 2) return ""
  return parts[parts.length - 1].toLowerCase()
}

function assertSafeAssetPath(path: string) {
  if (!path || !path.trim()) {
    throw new Error("Пустой путь ассета в импорте")
  }
  if (path.startsWith("/") || path.startsWith("\\")) {
    throw new Error(`Абсолютные пути ассетов не поддерживаются: ${path}`)
  }
  if (path.includes("..")) {
    throw new Error(`Небезопасный путь ассета в импорте: ${path}`)
  }
}

function assertAllowedAssetType(path: string) {
  const extension = getExtension(path)
  if (!ALLOWED_ASSET_EXTENSIONS.has(extension)) {
    throw new Error(`Недопустимый тип ассета для импорта: ${path}`)
  }
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
  try {
    const zipBytes = await readZipBytes(input)
    if (zipBytes.byteLength > MAX_ZIP_BYTES) {
      throw new Error(`ZIP архив превышает лимит размера: ${zipBytes.byteLength} байт`)
    }
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

    if (!parsedDoc || typeof parsedDoc !== "object") {
      throw new Error("Некорректный doc.json: нет slides")
    }

    const rawSlides = (parsedDoc as { slides?: unknown }).slides
    if (!Array.isArray(rawSlides)) {
      throw new Error("Некорректный doc.json: нет slides")
    }

    let imagePlan: ImagePlan | null = null
    const imagePlanBytes = entries.get("imagePlan.json")
    if (imagePlanBytes) {
      try {
        imagePlan = parseImagePlan(buildDocJson(imagePlanBytes))
      } catch {
        imagePlan = null
      }
    }

    const createdUrls: string[] = []
    let droppedElements = 0
    const doc: ImporterDoc = {
      ...(JSON.parse(JSON.stringify(parsedDoc)) as Record<string, unknown>),
      slides: rawSlides.map((slide) => {
        const slideObject = slide && typeof slide === "object" ? (slide as Record<string, unknown>) : {}
        const rawElements = Array.isArray(slideObject.elements) ? slideObject.elements : []
        const filteredElements = rawElements.filter((element) => {
          const type =
            element && typeof element === "object" ? (element as { type?: unknown }).type : undefined
          const keep = type === "text" || type === "image" || type === "shape"
          if (!keep) {
            droppedElements += 1
          }
          return keep
        })
        return {
          ...slideObject,
          elements: filteredElements,
        }
      }),
    } as ImporterDoc
    console.warn("[import] relaxed doc.json: droppedElements=", droppedElements)
    const elementBounds = computeSourceSlideSize(doc)
    let sourceSlideSize = elementBounds

    const resolveAsset = (path: string): { url: string; mimeType: string } => {
      assertSafeAssetPath(path)
      assertAllowedAssetType(path)
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
          assertSafeAssetPath(slide.background.src)
          assertAllowedAssetType(slide.background.src)
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

    return { doc, createdUrls, sourceSlideSize, imagePlan }
  } catch (error) {
    reportError(error, { scope: "zip_import" })
    throw error
  }
}
