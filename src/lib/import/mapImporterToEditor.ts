import type { Slide, SlideSize, Element, Background } from "@/lib/types"
import type { ImporterDoc, ImporterSlide, ImporterElement, ImportMetadata, ImportResult } from "@/src/lib/import/importerDoc"
import { defaultSlideSize } from "@/lib/types"

const ptToPx = (pt: number) => (pt * 96) / 72
const IMPORT_TEXT_SCALE = 0.92
let loggedTextCount = 0

const DEFAULT_BACKGROUND: Background = {
  type: "color",
  value: "#ffffff",
}

function resolveAssetUrl(source: string, baseUrl?: string): string {
  if (!source) return source
  try {
    if (baseUrl) {
      return new URL(source, baseUrl).toString()
    }
    return new URL(source).toString()
  } catch {
    return source
  }
}

function getCanvasSize(slides: ImporterSlide[]): { width: number; height: number } {
  let maxWidth = 0
  let maxHeight = 0

  slides.forEach((slide) => {
    slide.elements.forEach((element) => {
      const right = element.x + element.width
      const bottom = element.y + element.height
      if (right > maxWidth) maxWidth = right
      if (bottom > maxHeight) maxHeight = bottom
    })
  })

  return {
    width: maxWidth,
    height: maxHeight,
  }
}

function getFallbackCanvasSize(doc: ImporterDoc): { width: number; height: number } {
  if (doc.slideSize && doc.slideSize.width > 0 && doc.slideSize.height > 0) {
    if (doc.slideSize.unit === "in") {
      return {
        width: doc.slideSize.width * 96,
        height: doc.slideSize.height * 96,
      }
    }
    return {
      width: doc.slideSize.width,
      height: doc.slideSize.height,
    }
  }

  return {
    width: defaultSlideSize.width,
    height: defaultSlideSize.height,
  }
}

export function computeSourceSlideSize(doc: ImporterDoc): { width: number; height: number } {
  const canvasSize = getCanvasSize(doc.slides)
  if (canvasSize.width > 0 && canvasSize.height > 0) {
    return canvasSize
  }

  return getFallbackCanvasSize(doc)
}

function calculateScale(canvas: { width: number; height: number }, target: SlideSize): number {
  if (canvas.width <= 0 || canvas.height <= 0) return 1

  const scaleX = target.width / canvas.width
  const scaleY = target.height / canvas.height

  return Math.min(scaleX, scaleY)
}

function mapElement(
  element: ImporterElement,
  scale: number,
  baseUrl?: string,
): Element {
  const position = {
    x: element.x * scale,
    y: element.y * scale,
  }
  const size = {
    width: element.width * scale,
    height: element.height * scale,
  }

  if (element.type === "text") {
    const style = element.style || {}
    const sourceSize = style.fontSize
    const isProbablyPt = typeof sourceSize === "number" && sourceSize <= 72
    const sizePx = typeof sourceSize === "number" ? (isProbablyPt ? ptToPx(sourceSize) : sourceSize) : undefined
    const finalPx = typeof sizePx === "number" ? Math.round(sizePx * IMPORT_TEXT_SCALE * 2) / 2 : undefined

    if (loggedTextCount < 10) {
      console.log({
        text: element.text.slice(0, 30),
        sourceSize,
        sizePx,
        finalPx,
      })
      loggedTextCount += 1
    }

    return {
      id: element.id,
      type: "text",
      content: element.text,
      position,
      size,
      style: {
        fontFamily: style.fontFamily,
        fontSize: finalPx,
        color: style.color,
        fontWeight: style.bold ? "bold" : "normal",
        fontStyle: style.italic ? "italic" : "normal",
        textDecoration: style.underline ? "underline" : "none",
        textAlign: style.align,
        rotation: element.rotation,
      },
    }
  }

  return {
    id: element.id,
    type: "image",
    content: resolveAssetUrl(element.src, baseUrl),
    position,
    size,
    style: {
      objectFit: element.objectFit || "cover",
      rotation: element.rotation,
    },
  }
}

function mapSlide(slide: ImporterSlide, scale: number, baseUrl?: string): Slide {
  let background = DEFAULT_BACKGROUND

  if (slide.background?.type === "image") {
    const resolvedBackground = resolveAssetUrl(slide.background.src, baseUrl)
    background = {
      type: "image",
      value: `url(${resolvedBackground})`,
    }
  }

  return {
    id: slide.id,
    background,
    elements: slide.elements.map((element) => mapElement(element, scale, baseUrl)),
  }
}

export function mapImporterToEditor(
  doc: ImporterDoc,
  options?: {
    baseUrl?: string
    slideSize?: SlideSize
    sourceSlideSize?: { width: number; height: number }
    allowResize?: boolean
    importSettings?: { imported: boolean; textScale: number; textFontDeltaPt?: number }
  },
): ImportResult {
  const importSettings = options?.importSettings
  const sourceSize = options?.sourceSlideSize ?? computeSourceSlideSize(doc)
  const canvasSize = sourceSize.width > 0 && sourceSize.height > 0 ? sourceSize : defaultSlideSize
  const targetSlideSize = options?.allowResize ? canvasSize : options?.slideSize || defaultSlideSize
  const scale = options?.allowResize ? 1 : calculateScale(canvasSize, targetSlideSize)

  const slides = doc.slides.map((slide) => mapSlide(slide, scale, options?.baseUrl))

  const metadata: ImportMetadata = {
    baseUrl: options?.baseUrl,
    canvasSize,
    scale,
    sourceSlideSize: {
      width: canvasSize.width,
      height: canvasSize.height,
      unit: doc.slideSize?.unit,
    },
    importSettings: importSettings
      ? {
          imported: importSettings.imported,
          textScale: importSettings.textScale,
          textFontDeltaPt: importSettings.textFontDeltaPt,
        }
      : undefined,
  }

  return {
    slides,
    slideSize: targetSlideSize,
    metadata,
  }
}
