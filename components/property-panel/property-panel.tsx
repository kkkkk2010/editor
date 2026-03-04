"use client"

import { useEffect } from "react"
import type { Element, Slide } from "@/lib/types"
import type { ImagePlan } from "@/src/lib/import/imagePlan"
import { ScrollArea } from "@/components/ui/scroll-area"
import TextPropertyPanel from "./text-property-panel"
import ShapePropertyPanel from "./shape-property-panel"
import ImagePropertyPanel from "./image-property-panel"
import LayerPropertyPanel from "./layer-property-panel"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PropertyPanelProps {
  selectedElement: Element | null
  selectedElementIndex?: number | null
  onUpdateElement: (element: Element) => void
  onReplaceImage?: (imageUrl: string, file?: File) => void
  onClose: () => void
  currentSlide?: Slide
  currentSlideIndex?: number
  imagePlan?: ImagePlan | null
  projectTopic?: string
  language?: string
  hasPlaceholderReplacement?: (srcPath: string) => boolean
  onInsertImageFromSearch?: (payload: {
    elementId: string
    currentContent: string
    srcPath?: string
    searchMeta: {
      query: string
      negative: string[]
      kind: string
      aspect: string
    }
    selection: {
      pageUrl: string
      imageUrl: string
      licenseLabel?: string
      licenseUrl?: string
      source?: string
    }
  }) => Promise<void>
  onResetPlaceholderImage?: (payload: { srcPath: string }) => void
  onMoveElementForward?: (element: Element) => void
  onMoveElementBackward?: (element: Element) => void
  onMoveElementToFront?: (element: Element) => void
  onMoveElementToBack?: (element: Element) => void
}

export default function PropertyPanel({
  selectedElement,
  selectedElementIndex,
  onUpdateElement,
  onReplaceImage,
  onClose,
  currentSlide,
  currentSlideIndex,
  imagePlan,
  projectTopic,
  language,
  hasPlaceholderReplacement,
  onInsertImageFromSearch,
  onResetPlaceholderImage,
  onMoveElementForward,
  onMoveElementBackward,
  onMoveElementToFront,
  onMoveElementToBack,
}: PropertyPanelProps) {
  useEffect(() => {
    console.log("[ui] PropertyPanel render selected=", selectedElement?.id ?? null)
  }, [selectedElement])
  if (!selectedElement) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-medium">Панель свойств</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Выберите элемент для редактирования свойств
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b">
        <h3 className="font-medium">
          {selectedElement.type === "text" && "Свойства текста"}
          {selectedElement.type === "shape" && "Свойства фигуры"}
          {selectedElement.type === "image" && "Свойства изображения"}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* STYLE ONLY */}
      <ScrollArea className="flex-1 h-[calc(100vh-150px)]">
        <div className="p-4">
          {selectedElement.type === "text" && (
            <TextPropertyPanel element={selectedElement} onUpdateElement={onUpdateElement} />
          )}
          {selectedElement.type === "shape" && (
            <ShapePropertyPanel element={selectedElement} onUpdateElement={onUpdateElement} />
          )}
          {selectedElement.type === "image" && (
            <ImagePropertyPanel
              element={selectedElement}
              currentSlide={currentSlide}
              currentSlideIndex={currentSlideIndex}
              selectedElementIndex={selectedElementIndex}
              imagePlan={imagePlan}
              hasPlaceholderReplacement={
                selectedElement.assetPath ? hasPlaceholderReplacement?.(selectedElement.assetPath) : false
              }
              onInsertImageFromSearch={onInsertImageFromSearch}
              onResetPlaceholderImage={onResetPlaceholderImage}
              projectMeta={{ topic: projectTopic, language }}
              onUpdateElement={onUpdateElement}
              onReplaceImage={onReplaceImage}
            />
          )}
          {currentSlide && (
            <div className="mt-6 pt-4 border-t">
              <LayerPropertyPanel
                element={selectedElement}
                currentSlide={currentSlide}
                onMoveElementForward={onMoveElementForward}
                onMoveElementBackward={onMoveElementBackward}
                onMoveElementToFront={onMoveElementToFront}
                onMoveElementToBack={onMoveElementToBack}
              />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
