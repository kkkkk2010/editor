import type { Slide, SlideSize, Element, Background } from "@/lib/types"
import type { ImporterDoc, ImporterSlide, ImporterElement, ImportMetadata, ImportResult } from "@/src/lib/import/importerDoc"
import { defaultSlideSize } from "@/lib/types"
import { importerFontSizeToEditor } from "@/src/lib/units/fontUnits"

const DEFAULT_BACKGROUND: Background = {
  type: "color",
  value: "#ffffff",
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
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
  element: ImporterElement & { assetPath?: string; runtimeSrc?: string },
  scale: number,
  baseUrl?: string,
  fontUnit?: string,
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
    const fontSize = style.fontSize
      ? importerFontSizeToEditor(style.fontSize, fontUnit) * scale
      : undefined
    const fontWeight =
      style.fontWeight ?? (style.bold === undefined ? undefined : style.bold ? "bold" : "normal")
    const fontStyle =
      style.fontStyle ?? (style.italic === undefined ? undefined : style.italic ? "italic" : "normal")
    const textDecoration =
      style.textDecoration ?? (style.underline === undefined ? undefined : style.underline ? "underline" : "none")
    const textAlign = style.textAlign ?? style.align

    return {
      id: createId("text"),
      type: "text",
      content: element.text,
      position,
      size,
      style: {
        ...style,
        fontFamily: style.fontFamily,
        fontSize,
        color: style.color,
        fontWeight,
        fontStyle,
        textDecoration,
        textAlign,
        rotation: element.rotation,
      },
    }
  }

  return {
    id: createId("image"),
    type: "image",
    content: element.runtimeSrc ?? resolveAssetUrl(element.src, baseUrl),
    assetPath: element.assetPath,
    position,
    size,
    style: {
      objectFit: element.objectFit || "cover",
      rotation: element.rotation,
    },
  }
}

function mapSlide(
  slide: ImporterSlide & {
    background?: ImporterSlide["background"] & { assetPath?: string; runtimeSrc?: string }
  },
  scale: number,
  baseUrl?: string,
  fontUnit?: string,
): Slide {
  let background = DEFAULT_BACKGROUND

  if (slide.background?.type === "image") {
    const resolvedBackground = slide.background.runtimeSrc ?? resolveAssetUrl(slide.background.src, baseUrl)
    background = {
      type: "image",
      value: `url(${resolvedBackground})`,
      assetPath: slide.background.assetPath,
    }
  }

  return {
    id: createId("slide"),
    background,
    elements: slide.elements.map((element) => mapElement(element, scale, baseUrl, fontUnit)),
  }
}

export function mapImporterToEditor(
  doc: ImporterDoc,
  options?: {
    baseUrl?: string
    slideSize?: SlideSize
    sourceSlideSize?: { width: number; height: number }
    allowResize?: boolean
  },
): ImportResult {
  const sourceSize = options?.sourceSlideSize ?? computeSourceSlideSize(doc)
  const canvasSize = sourceSize.width > 0 && sourceSize.height > 0 ? sourceSize : defaultSlideSize
  const targetSlideSize = options?.allowResize ? canvasSize : options?.slideSize || defaultSlideSize
  const scale = options?.allowResize ? 1 : calculateScale(canvasSize, targetSlideSize)

  const fontUnit = doc.slideSize?.unit
  const slides = doc.slides.map((slide) => mapSlide(slide, scale, options?.baseUrl, fontUnit))

  const metadata: ImportMetadata = {
    baseUrl: options?.baseUrl,
    canvasSize,
    scale,
    sourceSlideSize: {
      width: canvasSize.width,
      height: canvasSize.height,
      unit: doc.slideSize?.unit,
    },
  }

  return {
    slides,
    slideSize: targetSlideSize,
    metadata,
  }
}
