import { unzipSync } from "fflate"
import type { ImporterDoc } from "@/src/lib/import/importerDoc"
import { validateImporterDoc } from "@/src/lib/import/validateImporterDoc"

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
}

export interface ZipImportResult {
  doc: ImporterDoc
  createdUrls: string[]
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

export async function importZipFile(file: File): Promise<ZipImportResult> {
  const arrayBuffer = await file.arrayBuffer()
  const zipContents = unzipSync(new Uint8Array(arrayBuffer))
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
  } catch (error) {
    throw new Error("doc.json содержит невалидный JSON")
  }

  const validation = validateImporterDoc(parsedDoc)
  if (!validation.ok) {
    throw new Error(`Ошибка валидации doc.json: ${validation.error}`)
  }

  const createdUrls: string[] = []
  const doc: ImporterDoc = JSON.parse(JSON.stringify(validation.data))

  const resolveAsset = (path: string): string => {
    const assetBytes = entries.get(path)
    if (!assetBytes) {
      throw new Error(`Файл ассета не найден: ${path}`)
    }
    const extension = getExtension(path)
    const mimeType = MIME_TYPES[extension] || "application/octet-stream"
    const url = URL.createObjectURL(new Blob([assetBytes], { type: mimeType }))
    createdUrls.push(url)
    return url
  }

  try {
    doc.slides.forEach((slide) => {
      if (slide.background?.type === "image") {
        slide.background.src = resolveAsset(slide.background.src)
      }

      slide.elements.forEach((element) => {
        if (element.type === "image") {
          element.src = resolveAsset(element.src)
        }
      })
    })
  } catch (error) {
    revokeImportObjectUrls(createdUrls)
    throw error
  }

  return { doc, createdUrls }
}
