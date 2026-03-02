"use client"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { MoveUp, MoveDown, ArrowUpToLine, ArrowDownToLine } from "lucide-react"
import type { Element, Slide } from "@/lib/types"

interface LayerPropertyPanelProps {
  element: Element
  currentSlide: Slide
  onMoveElementForward?: (element: Element) => void
  onMoveElementBackward?: (element: Element) => void
  onMoveElementToFront?: (element: Element) => void
  onMoveElementToBack?: (element: Element) => void
}

export default function LayerPropertyPanel({
  element,
  currentSlide,
  onMoveElementForward,
  onMoveElementBackward,
  onMoveElementToFront,
  onMoveElementToBack,
}: LayerPropertyPanelProps) {
  const elementIndex = currentSlide.elements.findIndex((el) => el.id === element.id)
  const isTopElement = elementIndex === currentSlide.elements.length - 1
  const isBottomElement = elementIndex === 0

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-2">Управление слоями</h4>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMoveElementToFront?.(element)}
            disabled={isTopElement}
            className="flex h-auto items-start justify-start gap-2 whitespace-normal break-words py-2 text-left leading-tight"
          >
            <ArrowUpToLine className="mt-0.5 h-4 w-4 shrink-0" />
            <span>На передний план</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMoveElementToBack?.(element)}
            disabled={isBottomElement}
            className="flex h-auto items-start justify-start gap-2 whitespace-normal break-words py-2 text-left leading-tight"
          >
            <ArrowDownToLine className="mt-0.5 h-4 w-4 shrink-0" />
            <span>На задний план</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMoveElementForward?.(element)}
            disabled={isTopElement}
            className="flex h-auto items-start justify-start gap-2 whitespace-normal break-words py-2 text-left leading-tight"
          >
            <MoveUp className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Поднять на один слой</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onMoveElementBackward?.(element)}
            disabled={isBottomElement}
            className="flex h-auto items-start justify-start gap-2 whitespace-normal break-words py-2 text-left leading-tight"
          >
            <MoveDown className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Опустить на один слой</span>
          </Button>
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="text-sm font-medium mb-2">Информация о слое</h4>
        <div className="text-sm text-muted-foreground">
          <p>
            Положение слоя: {elementIndex + 1} / {currentSlide.elements.length}
          </p>
        </div>
      </div>
    </div>
  )
}
