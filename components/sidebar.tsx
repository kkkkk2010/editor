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
  slideSize: { width: number; height: number }
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
  slideSize,
}: SidebarProps) {
  const thumbnailWidth = 192
  const thumbnailHeight = 108

  const getFitScale = (containerWidth: number, containerHeight: number, slideWidth: number, slideHeight: number) => {
    if (slideWidth <= 0 || slideHeight <= 0) return 1
    return Math.min(containerWidth / slideWidth, containerHeight / slideHeight)
  }

  const renderShapePreview = (element: Slide["elements"][number]) => {
    if (element.type !== "shape") return null

    const shapeType = element.content
    const fill = element.style.fill || "#ffffff"
    const stroke = element.style.stroke || "#000000"
    const strokeWidth = element.style.strokeWidth || 2
    const borderRadius = element.style.borderRadius || 0

    if (shapeType === "circle") {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: fill,
            border: `${strokeWidth}px solid ${stroke}`,
            borderRadius: "50%",
          }}
        />
      )
    }

    if (shapeType === "triangle") {
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="50,0 0,100 100,100" fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      )
    }

    if (shapeType === "line") {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              height: `${strokeWidth}px`,
              backgroundColor: stroke,
            }}
          />
        </div>
      )
    }

    if (shapeType === "arrow") {
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker id={`arrowhead-${element.id}`} markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={stroke} />
            </marker>
          </defs>
          <line
            x1="0"
            y1="50"
            x2="90"
            y2="50"
            stroke={stroke}
            strokeWidth={strokeWidth}
            markerEnd={`url(#arrowhead-${element.id})`}
          />
        </svg>
      )
    }

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: fill,
          border: `${strokeWidth}px solid ${stroke}`,
          borderRadius,
        }}
      />
    )
  }
  const renderSlidePreview = (slide: Slide, index: number) => {
    const scale = getFitScale(thumbnailWidth, thumbnailHeight, slideSize.width, slideSize.height)
    const isCurrent = index === currentSlideIndex

    return (
      <div
        key={slide.id}
        className={cn(
          "relative border rounded-md overflow-hidden cursor-pointer transition-all mb-3 group",
          isCurrent ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/50",
        )}
        style={{
          width: thumbnailWidth,
          height: thumbnailHeight,
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
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: slide.background.value,
          }}
        >
          <div
            style={{
              width: slideSize.width,
              height: slideSize.height,
              transform: `scale(${scale})`,
              transformOrigin: "center center",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
              }}
            >
              {slide.elements.map((element) => {
                if (element.type === "text") {
                  return (
                    <div
                      key={element.id}
                      style={{
                        position: "absolute",
                        left: element.position.x,
                        top: element.position.y,
                        width: element.size.width,
                        height: element.size.height,
                        fontSize: element.style.fontSize || 16,
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
                        left: element.position.x,
                        top: element.position.y,
                        width: element.size.width,
                        height: element.size.height,
                        backgroundImage: `url(${element.content})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                  )
                }
                if (element.type === "shape") {
                  return (
                    <div
                      key={element.id}
                      style={{
                        position: "absolute",
                        left: element.position.x,
                        top: element.position.y,
                        width: element.size.width,
                        height: element.size.height,
                        opacity: element.style.opacity,
                        transform: element.style.rotation ? `rotate(${element.style.rotation}deg)` : undefined,
                      }}
                    >
                      {renderShapePreview(element)}
                    </div>
                  )
                }
                return null
              })}
            </div>
          </div>
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
