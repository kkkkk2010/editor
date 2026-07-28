"use client"

import type { Element, Slide } from "@/lib/types"
import type { ImagePlan } from "@/src/lib/import/imagePlan"
import { ScrollArea } from "@/components/ui/scroll-area"
import TextPropertyPanel from "./text-property-panel"
import ShapePropertyPanel from "./shape-property-panel"
import ImagePropertyPanel from "./image-property-panel"
import LayerPropertyPanel from "./layer-property-panel"
import { ImageIcon, MousePointer2, Shapes, Type, X } from "lucide-react"
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
  if (!selectedElement) {
    return (
      <div className="flex h-full flex-col bg-card">
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div>
            <p className="text-xs font-bold uppercase text-muted-foreground">Настройки</p>
            <h3 className="text-sm font-bold">Свойства элемента</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Закрыть свойства" aria-label="Закрыть свойства">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-accent text-primary">
            <MousePointer2 className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">Выберите элемент</p>
          <p className="mt-1 max-w-48 text-xs leading-5 text-muted-foreground">Нажмите на текст, изображение или фигуру на слайде</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
            {selectedElement.type === "text" && <Type className="h-4 w-4" />}
            {selectedElement.type === "shape" && <Shapes className="h-4 w-4" />}
            {selectedElement.type === "image" && <ImageIcon className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Выбранный элемент</p>
            <h3 className="truncate text-sm font-bold">
              {selectedElement.type === "text" && "Текст"}
              {selectedElement.type === "shape" && "Фигура"}
              {selectedElement.type === "image" && "Изображение"}
            </h3>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Закрыть свойства" aria-label="Закрыть свойства">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-5">
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
            <div className="mt-6 border-t pt-4">
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
