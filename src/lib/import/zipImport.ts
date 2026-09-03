import { unzipSync } from "fflate"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"
import { computeSourceSlideSize } from "@/src/lib/import/mapImporterToEditor"
import type { AssetStore } from "@/src/lib/assets/assetStore"
import { reportError } from "@/src/lib/monitoring"
import { parseImagePlan, type ImagePlan } from "@/src/lib/import/imagePlan"
import { parseImageCredits, type ImageCreditItem } from "@/src/lib/images/imageCredits"
import { validateImporterDoc } from "@/src/lib/import/validateImporterDoc"

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
}
const ALLOWED_ASSET_EXTENSIONS = new Set(Object.keys(MIME_TYPES))
const MAX_ZIP_BYTES = 50 * 1024 * 1024
const MAX_ZIP_ENTRIES = 512
const MAX_ENTRY_BYTES = 64 * 1024 * 1024
const MAX_DOC_JSON_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_UNCOMPRESSED_BYTES = 150 * 1024 * 1024
const MAX_COMPRESSION_RATIO = 100
const ZIP_EOCD_SIGNATURE = 0x06054b50
const ZIP_CENTRAL_ENTRY_SIGNATURE = 0x02014b50

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function assertSafeZipEntryPath(entryPath: string) {
  if (!entryPath || entryPath.length > 512 || entryPath.includes("\0") || entryPath.includes("\\")) {
    throw new Error("ZIP содержит некорректное имя файла")
  }
  if (entryPath.startsWith("/") || /^[a-zA-Z]:\//.test(entryPath)) {
    throw new Error(`ZIP содержит абсолютный путь: ${entryPath}`)
  }
  if (entryPath.split("/").some((segment) => segment === "..")) {
    throw new Error(`ZIP содержит небезопасный путь: ${entryPath}`)
  }
}

function preflightZipDirectory(bytes: Uint8Array) {
  if (bytes.byteLength < 22) throw new Error("Некорректный ZIP архив")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const minOffset = Math.max(0, bytes.byteLength - 22 - 65_535)
  let eocdOffset = -1
  for (let offset = bytes.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_EOCD_SIGNATURE) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset < 0) throw new Error("В ZIP не найден центральный каталог")

  const diskNumber = view.getUint16(eocdOffset + 4, true)
  const centralDisk = view.getUint16(eocdOffset + 6, true)
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true)
  const totalEntries = view.getUint16(eocdOffset + 10, true)
  const centralSize = view.getUint32(eocdOffset + 12, true)
  const centralOffset = view.getUint32(eocdOffset + 16, true)
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== totalEntries ||
    totalEntries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw new Error("Многотомные и ZIP64 архивы не поддерживаются")
  }
  if (totalEntries === 0 || totalEntries > MAX_ZIP_ENTRIES) {
    throw new Error(`Недопустимое количество файлов в ZIP: ${totalEntries}`)
  }
  if (centralOffset + centralSize > eocdOffset || centralOffset < 0) {
    throw new Error("Поврежден центральный каталог ZIP")
  }

  const decoder = new TextDecoder("utf-8", { fatal: true })
  const names = new Set<string>()
  let totalUncompressedBytes = 0
  let offset = centralOffset
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== ZIP_CENTRAL_ENTRY_SIGNATURE) {
      throw new Error("Повреждена запись центрального каталога ZIP")
    }
    const flags = view.getUint16(offset + 8, true)
    const compressedBytes = view.getUint32(offset + 20, true)
    const uncompressedBytes = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength
    if (entryEnd > bytes.byteLength || nameLength === 0) {
      throw new Error("Повреждена длина записи ZIP")
    }
    if ((flags & 0x1) !== 0) throw new Error("Зашифрованные ZIP файлы не поддерживаются")
    if (compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff) {
      throw new Error("ZIP64 записи не поддерживаются")
    }

    let entryPath: string
    try {
      entryPath = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    } catch {
      throw new Error("ZIP содержит невалидное UTF-8 имя файла")
    }
    assertSafeZipEntryPath(entryPath)
    if (names.has(entryPath)) throw new Error(`ZIP содержит повторяющийся файл: ${entryPath}`)
    names.add(entryPath)

    if (!entryPath.endsWith("/")) {
      if (uncompressedBytes > MAX_ENTRY_BYTES) {
        throw new Error(`Файл в ZIP превышает лимит: ${entryPath}`)
      }
      if (entryPath === "doc.json" && uncompressedBytes > MAX_DOC_JSON_BYTES) {
        throw new Error("doc.json превышает допустимый размер")
      }
      totalUncompressedBytes += uncompressedBytes
      if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error("Распакованный ZIP превышает допустимый общий размер")
      }
      if (
        uncompressedBytes > 1024 * 1024 &&
        (compressedBytes === 0 || uncompressedBytes / compressedBytes > MAX_COMPRESSION_RATIO)
      ) {
        throw new Error(`Подозрительная степень сжатия ZIP: ${entryPath}`)
      }
    }
    offset = entryEnd
  }
  if (offset > centralOffset + centralSize) throw new Error("Поврежден размер центрального каталога ZIP")
}

export interface ZipImportResult {
  doc: ImporterDoc
  createdUrls: string[]
  sourceSlideSize: { width: number; height: number }
  imagePlan: ImagePlan | null
  imageCredits: ImageCreditItem[]
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
    preflightZipDirectory(zipBytes)
    const zipContents = unzipSync(zipBytes)
    const entries = new Map(Object.entries(zipContents))
    const actualUncompressedBytes = [...entries.values()].reduce((total, entry) => total + entry.byteLength, 0)
    if (actualUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error("Распакованный ZIP превышает допустимый общий размер")
    }

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

    let imageCredits: ImageCreditItem[] = []
    const imageCreditsBytes = entries.get("imageCredits.json")
    if (imageCreditsBytes) {
      try {
        imageCredits = parseImageCredits(buildDocJson(imageCreditsBytes))
      } catch {
        imageCredits = []
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
    const validation = validateImporterDoc(doc)
    if (!validation.ok) {
      throw new Error(`Некорректный doc.json: ${validation.error}`)
    }
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

    return { doc, createdUrls, sourceSlideSize, imagePlan, imageCredits }
  } catch (error) {
    reportError(error, { scope: "zip_import" })
    throw error
  }
}
