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
    <div className="space-y-3">
      <div>
        <h4 className="mb-2 text-xs font-semibold">Управление слоями</h4>
        <div className="grid grid-cols-4 gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onMoveElementToFront?.(element)}
            disabled={isTopElement}
            className="h-8 w-full"
            title="На передний план"
            aria-label="На передний план"
          >
            <ArrowUpToLine className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onMoveElementToBack?.(element)}
            disabled={isBottomElement}
            className="h-8 w-full"
            title="На задний план"
            aria-label="На задний план"
          >
            <ArrowDownToLine className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onMoveElementForward?.(element)}
            disabled={isTopElement}
            className="h-8 w-full"
            title="Поднять на один слой"
            aria-label="Поднять на один слой"
          >
            <MoveUp className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onMoveElementBackward?.(element)}
            disabled={isBottomElement}
            className="h-8 w-full"
            title="Опустить на один слой"
            aria-label="Опустить на один слой"
          >
            <MoveDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="mb-1 text-xs font-semibold">Положение</h4>
        <div className="text-xs text-muted-foreground">
          <p>
            Положение слоя: {elementIndex + 1} / {currentSlide.elements.length}
          </p>
        </div>
      </div>
    </div>
  )
}
