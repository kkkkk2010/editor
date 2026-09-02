import type { ImporterDoc } from "@/src/lib/import/importerDoc"

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
}

export function buildPresentationOutZipFilename(title: string | undefined) {
  const base = slugify(title || "") || "presentation"
  return `${base}.out.zip`
}

export function buildLayoutOutZipFilename(slideName: string | undefined, slideIndex: number) {
  const normalized = slugify(slideName || "") || `slide-${slideIndex + 1}`
  return `layout-${normalized}.out.zip`
}

export function buildSingleSlideDoc(doc: ImporterDoc, slideIndex: number): ImporterDoc {
  const slide = doc.slides[slideIndex]
  if (!slide) {
    throw new Error(`Slide with index ${slideIndex} not found`)
  }

  return {
    ...doc,
    slides: [slide],
  }
}

export function buildLayoutMeta(slideIndex: number) {
  return {
    exportType: "layout" as const,
    slideIndex,
    exportedAt: new Date().toISOString(),
  }
}
