export interface ImporterDoc {
  schemaVersion: 1
  slideSize?: {
    width: number
    height: number
    unit: string
  }
  slides: ImporterSlide[]
}

export interface ImporterSlide {
  id: string
  background?: ImporterBackground
  elements: ImporterElement[]
}

export interface ImporterBackground {
  type: "image"
  src: string
}

export type ImporterElement = ImporterTextElement | ImporterImageElement | ImporterShapeElement

export interface ImporterBaseElement {
  id: string
  type: "text" | "image"
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

export interface ImporterTextStyle {
  fontFamily?: string
  fontSizePt?: number
  fontSize?: number
  color?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: "left" | "center" | "right" | "justify"
  lineHeight?: number
  letterSpacing?: number
  [key: string]: unknown
}

export interface ImporterTextElement extends ImporterBaseElement {
  type: "text"
  text: string
  style?: ImporterTextStyle
}

export interface ImporterImageElement extends ImporterBaseElement {
  type: "image"
  src: string
  objectFit?: string
}

export type ImporterShapeType =
  | "rect"
  | "ellipse"
  | "roundRect"
  | "line"
  | "arrow"
  | "triangle"
  | "star"
  | "hexagon"
  | "pentagon"
  | "cloud"

export interface ImporterShapeStyle {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  cornerRadius?: number
  [key: string]: unknown
}

export interface ImporterShapeElement extends ImporterBaseElement {
  type: "shape"
  shapeType: ImporterShapeType
  style?: ImporterShapeStyle
}

export interface ImportMetadata {
  baseUrl?: string
  canvasSize: {
    width: number
    height: number
  }
  scale: number
  sourceSlideSize?: {
    width: number
    height: number
    unit?: string
  }
}

export interface ImportResult {
  slides: import("@/lib/types").Slide[]
  slideSize: import("@/lib/types").SlideSize
  metadata: ImportMetadata
}
