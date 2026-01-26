import type { Slide, SlideSize } from "@/lib/types"
import type {
  ImporterDoc,
  ImporterElement,
  ImporterSlide,
  ImporterShapeType,
} from "@/src/lib/import/importerDoc"
function mapTextElement(element: import("@/lib/types").Element): ImporterElement {
  const { fontSizePt, fontSize: _fontSize, ...restStyle } = element.style
  return {
    id: element.id,
    type: "text",
    text: element.content,
    x: element.position.x,
    y: element.position.y,
    width: element.size.width,
    height: element.size.height,
    rotation: element.style.rotation,
    style: {
      ...restStyle,
      fontSizePt: fontSizePt ?? 18,
    },
  }
}

function mapImageElement(element: import("@/lib/types").Element): ImporterElement {
  return {
    id: element.id,
    type: "image",
    src: element.assetPath || element.content,
    x: element.position.x,
    y: element.position.y,
    width: element.size.width,
    height: element.size.height,
    rotation: element.style.rotation,
    objectFit: element.style.objectFit,
  }
}

function mapShapeElement(element: import("@/lib/types").Element): ImporterElement {
  const shapeType =
    element.content === "rectangle" && (element.style.borderRadius ?? 0) > 0
      ? "roundRect"
      : mapEditorShapeType(element.content)

  return {
    id: element.id,
    type: "shape",
    shapeType,
    x: element.position.x,
    y: element.position.y,
    width: element.size.width,
    height: element.size.height,
    rotation: element.style.rotation,
    style: {
      fill: element.style.fill,
      stroke: element.style.stroke,
      strokeWidth: element.style.strokeWidth,
      opacity: element.style.opacity,
      cornerRadius: element.style.borderRadius,
    },
  }
}

function mapSlide(slide: Slide): ImporterSlide {
  const background =
    slide.background.type === "image" && slide.background.assetPath
      ? {
          type: "image" as const,
          src: slide.background.assetPath,
        }
      : undefined

  return {
    id: slide.id,
    background,
    elements: slide.elements
      .filter((element) => element.type === "text" || element.type === "image" || element.type === "shape")
      .map((element) => {
        if (element.type === "text") {
          return mapTextElement(element)
        }
        if (element.type === "shape") {
          return mapShapeElement(element)
        }
        return mapImageElement(element)
      }),
  }
}

function mapEditorShapeType(shapeType: string): ImporterShapeType {
  switch (shapeType) {
    case "rectangle":
      return "rect"
    case "circle":
      return "ellipse"
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
      return "rect"
  }
}

export function mapEditorToImporter(slides: Slide[], slideSize: SlideSize): ImporterDoc {
  return {
    schemaVersion: 1,
    slideSize: {
      width: slideSize.width,
      height: slideSize.height,
      unit: "px",
    },
    slides: slides.map(mapSlide),
  }
}
