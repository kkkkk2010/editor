import type { Slide, SlideSize } from "@/lib/types"
import type { ImporterDoc, ImporterElement, ImporterSlide } from "@/src/lib/import/importerDoc"
import { editorFontSizeToImporter } from "@/src/lib/units/fontUnits"

function mapTextElement(element: import("@/lib/types").Element): ImporterElement {
  const exportFontSize =
    typeof element.style.fontSize === "number" ? editorFontSizeToImporter(element.style.fontSize, "px") : undefined

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
      ...element.style,
      fontSize: exportFontSize ?? element.style.fontSize,
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
      .filter((element) => element.type === "text" || element.type === "image")
      .map((element) => {
        if (element.type === "text") {
          return mapTextElement(element)
        }
        return mapImageElement(element)
      }),
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
