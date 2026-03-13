export interface Position {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export type ObjectFitMode = "cover" | "contain" | "fill" | "none" | "scale-down"

export interface TextStyle {
  fontFamily?: string
  fontSizePt?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: "left" | "center" | "right" | "justify"
  fontWeight?: string
  fontStyle?: string
  textDecoration?: string
  color?: string
  textAlign?: string
  lineHeight?: number
  letterSpacing?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  objectFit?: ObjectFitMode
  filter?: string
  rotation?: number
  // 动画相关属性
  animation?: boolean
  animationType?: string
  animationDuration?: number
  animationDelay?: number
  animationLoop?: boolean
  locked?: boolean
  [key: string]: unknown
}

export interface Element {
  id: string
  type: "text" | "image" | "shape"
  content: string
  assetPath?: string
  meta?: {
    search?: {
      query?: string
      negative?: string[]
      kind?: string
      aspect?: string
      updatedAt?: string
    }
  }
  position: Position
  size: Size
  style: TextStyle
}

export interface Background {
  type: "color" | "gradient" | "image"
  value: string
  assetPath?: string
}

export interface Slide {
  id: string
  background: Background
  elements: Element[]
}

export interface SlideSize {
  width: number
  height: number
}

export const defaultSlideSize: SlideSize = {
  width: 960,
  height: 540,
}

export const defaultSlides: Slide[] = [
  {
    id: "slide-1",
    background: {
      type: "color",
      value: "#ffffff",
    },
    elements: [],
  },
  {
    id: "slide-2",
    background: {
      type: "color",
      value: "#ffffff",
    },
    elements: [],
  },
  {
    id: "slide-3",
    background: {
      type: "color",
      value: "#ffffff",
    },
    elements: [],
  },
]
