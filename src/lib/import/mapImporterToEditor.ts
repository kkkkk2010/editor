import type { Slide, SlideSize, Element, Background } from "@/lib/types"
import type {
  ImporterDoc,
  ImporterSlide,
  ImporterElement,
  ImporterTextStyle,
  ImportMetadata,
  ImportResult,
  ImporterShapeType,
} from "@/src/lib/import/importerDoc"
import { defaultSlideSize } from "@/lib/types"
import { normalizeFontFamily } from "@/lib/text-style"
import { pxToPt } from "@/lib/utils/units"

const allowedObjectFits = new Set(["cover", "contain", "fill", "none", "scale-down"] as const)
type ObjectFitValue = (typeof allowedObjectFits extends Set<infer T> ? T : never)

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

function normalizeTextStyle(style?: ImporterTextStyle) {
  const fontWeight: string | undefined = style?.bold ? "700" : undefined
  const fontStyle: string | undefined = style?.italic ? "italic" : undefined
  const textDecoration: string | undefined = style?.underline ? "underline" : undefined
  const textAlign: "left" | "center" | "right" | "justify" | undefined =
    style?.align === "left" || style?.align === "center" || style?.align === "right" || style?.align === "justify"
      ? style?.align
      : undefined

  return {
    fontFamily: style?.fontFamily,
    fontSizePt: style?.fontSizePt,
    fontSize: style?.fontSize,
    color: style?.color,
    fontWeight,
    fontStyle,
    textDecoration,
    textAlign,
    lineHeight: style?.lineHeight,
    letterSpacing: style?.letterSpacing,
  } as const
}

function mapElement(
  element: ImporterElement & { assetPath?: string; runtimeSrc?: string },
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
    const normalizedStyle = normalizeTextStyle(style)
    const fontSizePt =
      normalizedStyle.fontSizePt ?? (normalizedStyle.fontSize !== undefined ? pxToPt(normalizedStyle.fontSize) : undefined) ?? 18
    const { fontFamily, fontSize, fontSizePt: rawFontSizePt, ...restStyle } = style
    void fontSize
    void rawFontSizePt

    return {
      id: createId("text"),
      type: "text",
      content: element.text,
      position,
      size,
      style: {
        ...restStyle,
        fontFamily: normalizeFontFamily(fontFamily),
        fontSizePt,
        color: normalizedStyle.color,
        fontWeight: normalizedStyle.fontWeight,
        fontStyle: normalizedStyle.fontStyle,
        textDecoration: normalizedStyle.textDecoration,
        textAlign: normalizedStyle.textAlign,
        rotation: element.rotation,
      },
    }
  }

  if (element.type === "shape") {
    const shapeStyle = element.style || {}
    const cornerRadius =
      typeof shapeStyle.cornerRadius === "number" ? shapeStyle.cornerRadius * scale : undefined
    const shapeType = mapImporterShapeType(element.shapeType)

    return {
      id: createId("shape"),
      type: "shape",
      content: shapeType,
      position,
      size,
      style: {
        ...shapeStyle,
        fill: shapeStyle.fill,
        stroke: shapeStyle.stroke,
        strokeWidth: shapeStyle.strokeWidth,
        opacity: shapeStyle.opacity,
        borderRadius: cornerRadius,
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
      objectFit: allowedObjectFits.has(element.objectFit as ObjectFitValue)
        ? (element.objectFit as ObjectFitValue)
        : "cover",
      rotation: element.rotation,
    },
  }
}

function mapImporterShapeType(shapeType: ImporterShapeType | undefined): string {
  switch (shapeType) {
    case "rect":
      return "rectangle"
    case "ellipse":
      return "circle"
    case "roundRect":
      return "rectangle"
    case "line":
      return "line"
    case "arrow":
      return "arrow"
    case "triangle":
      return "triangle"
    case "star":
      return "star"
    case "hexagon":
      return "hexagon"
    case "pentagon":
      return "pentagon"
    case "cloud":
      return "cloud"
    default:
      return "rectangle"
  }
}

function mapSlide(
  slide: ImporterSlide & {
    background?: ImporterSlide["background"] & { assetPath?: string; runtimeSrc?: string }
  },
  scale: number,
  baseUrl?: string,
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
  },
): ImportResult {
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
  }

  return {
    slides,
    slideSize: targetSlideSize,
    metadata,
  }
}
