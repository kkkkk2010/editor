export interface Position {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface TextStyle {
  fontFamily?: string
  fontSize?: number
  fontWeight?: string
  fontStyle?: string
  textDecoration?: string
  color?: string
  textAlign?: string
  lineHeight?: string | number
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  objectFit?: string
  filter?: string
  rotation?: number
  // 动画相关属性
  animation?: boolean
  animationType?: string
  animationDuration?: number
  animationDelay?: number
  animationLoop?: boolean
  locked?: boolean
}

export interface Element {
  id: string
  type: "text" | "image" | "shape"
  content: string
  position: Position
  size: Size
  style: TextStyle
}

export interface Background {
  type: "color" | "gradient" | "image"
  value: string
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
      type: "gradient",
      value: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
    },
    elements: [
      {
        id: "title-1",
        type: "text",
        content: "Новая презентация",
        position: { x: 200, y: 200 },
        size: { width: 520, height: 80 },
        style: {
          fontSize: 48,
          fontWeight: "bold",
          color: "#ffffff",
          textAlign: "center",
        },
      },
      {
        id: "subtitle-1",
        type: "text",
        content: "Всем привет!",
        position: { x: 280, y: 300 },
        size: { width: 400, height: 40 },
        style: {
          fontSize: 24,
          fontWeight: "normal",
          color: "#ffffff",
          textAlign: "center",
        },
      },
      {
        id: "subtitle-2",
        type: "text",
        content: ":)",
        position: { x: 280, y: 320 },
        size: { width: 400, height: 40 },
        style: {
          fontSize: 24,
          fontWeight: "normal",
          color: "#ffffff",
          textAlign: "center",
        },
      },
    ],
  },
  {
    id: "slide-2",
    background: {
      type: "gradient",
      value: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
    },
    elements: [
      {
        id: "title-2",
        type: "text",
        content: "Введите текст",
        position: { x: 50, y: 50 },
        size: { width: 200, height: 60 },
        style: {
          fontSize: 36,
          fontWeight: "bold",
          color: "#ffffff",
          textAlign: "left",
        },
      },
      {
        id: "content-2",
        type: "text",
        content: "• Потыкайте все кнопочки\n• В деталях опишите, что не нравится\n• Скиньте в тг\n• Я исправлю\n• ;)",
        position: { x: 50, y: 130 },
        size: { width: 400, height: 300 },
        style: {
          fontSize: 24,
          fontWeight: "normal",
          color: "#ffffff",
          textAlign: "left",
        },
      },
    ],
  },
  {
    id: "slide-3",
    background: {
      type: "gradient",
      value: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
    },
    elements: [
      {
        id: "title-3",
        type: "text",
        content: "123",
        position: { x: 50, y: 50 },
        size: { width: 400, height: 60 },
        style: {
          fontSize: 36,
          fontWeight: "bold",
          color: "#ffffff",
          textAlign: "left",
        },
      },
      {
        id: "content-3",
        type: "text",
        content: "• 1\n• 2\n• 3\n• 4\n• 5",
        position: { x: 50, y: 130 },
        size: { width: 400, height: 300 },
        style: {
          fontSize: 24,
          fontWeight: "normal",
          color: "#ffffff",
          textAlign: "left",
        },
      },
      {
        id: "image-3",
        type: "image",
        content: "/placeholder.svg?height=300&width=400",
        position: { x: 500, y: 130 },
        size: { width: 400, height: 300 },
        style: {},
      },
    ],
  },
]
