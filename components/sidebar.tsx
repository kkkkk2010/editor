"use client"

import type { CSSProperties } from "react"
import type { Slide } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarProps {
  slides: Slide[]
  currentSlideIndex: number
  onSlideSelect: (index: number) => void
  onAddSlide: () => void
  onRemoveSlide: (index: number) => void
  onDuplicateSlide: (index: number) => void
  onMoveSlideUp: (index: number) => void
  onMoveSlideDown: (index: number) => void
}

export default function Sidebar({
  slides,
  currentSlideIndex,
  onSlideSelect,
  onAddSlide,
  onRemoveSlide,
  onDuplicateSlide,
  onMoveSlideUp,
  onMoveSlideDown,
}: SidebarProps) {
  const renderSlidePreview = (slide: Slide, index: number) => {
    // Calculate scale to fit the thumbnail
    const scale = 0.2
    const isCurrent = index === currentSlideIndex

    return (
      <div
        key={slide.id}
        className={cn(
          "relative border rounded-md overflow-hidden cursor-pointer transition-all mb-3 group",
          isCurrent ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/50",
        )}
        style={{
          width: 192,
          height: 108,
        }}
        onClick={() => onSlideSelect(index)}
      >
        {isCurrent && (
          <div className="absolute left-1 top-1 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              className={cn(
                "rounded-full bg-background/90 p-1 text-foreground shadow-sm",
                index === 0 && "cursor-not-allowed opacity-50",
              )}
              onClick={(event) => {
                event.stopPropagation()
                onMoveSlideUp(index)
              }}
              disabled={index === 0}
              aria-label="Переместить слайд вверх"
              title="Переместить слайд вверх"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              className={cn(
                "rounded-full bg-background/90 p-1 text-foreground shadow-sm",
                index === slides.length - 1 && "cursor-not-allowed opacity-50",
              )}
              onClick={(event) => {
                event.stopPropagation()
                onMoveSlideDown(index)
              }}
              disabled={index === slides.length - 1}
              aria-label="Переместить слайд вниз"
              title="Переместить слайд вниз"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="rounded-full bg-background/90 p-1 text-foreground shadow-sm"
              onClick={(event) => {
                event.stopPropagation()
                onDuplicateSlide(index)
              }}
              aria-label="Дублировать слайд"
              title="Дублировать слайд"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        )}
        <button
          type="button"
          className={cn(
            "absolute right-1 top-1 z-10 rounded-full bg-background/90 p-1 text-foreground shadow-sm opacity-0 transition-opacity group-hover:opacity-100",
            slides.length === 1 && "cursor-not-allowed opacity-50",
          )}
          onClick={(event) => {
            event.stopPropagation()
            onRemoveSlide(index)
          }}
          disabled={slides.length === 1}
          aria-label="Удалить слайд"
          title="Удалить слайд"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        <div
          className="absolute inset-0"
          style={{
            background: slide.background.value,
          }}
        >
          {slide.elements.map((element) => {
            if (element.type === "text") {
              return (
                <div
                  key={element.id}
                  style={{
                    position: "absolute",
                    left: element.position.x * scale,
                    top: element.position.y * scale,
                    width: element.size.width * scale,
                    height: element.size.height * scale,
                    fontSize: (element.style.fontSize || 16) * scale,
                    fontWeight: element.style.fontWeight,
                    color: element.style.color,
                    textAlign: element.style.textAlign as CSSProperties["textAlign"],
                    overflow: "hidden",
                  }}
                >
                  {element.content}
                </div>
              )
            }
            if (element.type === "image") {
              return (
                <div
                  key={element.id}
                  style={{
                    position: "absolute",
                    left: element.position.x * scale,
                    top: element.position.y * scale,
                    width: element.size.width * scale,
                    height: element.size.height * scale,
                    backgroundImage: `url(${element.content})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              )
            }
            return null
          })}
        </div>
        <div className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-1 rounded">{index + 1}</div>
      </div>
    )
  }

  return (
    <div className="w-56 border-r bg-background flex flex-col h-full">
      <div className="p-3 border-b">
        <Button onClick={onAddSlide} variant="outline" className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Добавить слайд
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">{slides.map((slide, index) => renderSlidePreview(slide, index))}</div>
    </div>
  )
}
