"use client"

import type { CSSProperties } from "react"
import { useState } from "react"
import type { Slide } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ArrowDown, ArrowUp, Copy, Layers3, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ptToPx } from "@/lib/utils/units"

interface SidebarProps {
  slides: Slide[]
  currentSlideIndex: number
  onSlideSelect: (index: number) => void
  onAddSlide: () => void
  onRemoveSlide: (index: number) => void
  onDuplicateSlide: (index: number) => void
  onMoveSlideUp: (index: number) => void
  onMoveSlideDown: (index: number) => void
  onReorderSlides?: (fromIndex: number, toIndex: number) => void
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
  onReorderSlides,
  slideSize,
}: SidebarProps) {
  const thumbnailWidth = 192
  const thumbnailHeight = 108
  const DEBUG_THUMBNAIL = false
  const [draggingSlideIndex, setDraggingSlideIndex] = useState<number | null>(null)
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null)

  const getFitScale = (containerWidth: number, containerHeight: number, slideWidth: number, slideHeight: number) => {
    if (slideWidth <= 0 || slideHeight <= 0) return 1
    return Math.min(containerWidth / slideWidth, containerHeight / slideHeight)
  }

  const handleDragStart = (index: number, event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", String(index))
    setDraggingSlideIndex(index)
    setDropIndicatorIndex(index)
  }

  const handleDragOver = (index: number, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    if (draggingSlideIndex === null) return
    const rect = event.currentTarget.getBoundingClientRect()
    const before = event.clientY < rect.top + rect.height / 2
    const dropIndex = before ? index : index + 1
    setDropIndicatorIndex(dropIndex)
  }

  const handleDrop = (index: number, event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const from = draggingSlideIndex
    setDraggingSlideIndex(null)

    if (from === null || !onReorderSlides) {
      setDropIndicatorIndex(null)
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const before = event.clientY < rect.top + rect.height / 2
    let to = before ? index : index + 1
    if (to > from) to -= 1

    if (to >= 0 && to < slides.length && to !== from) {
      onReorderSlides(from, to)
    }

    setDropIndicatorIndex(null)
  }

  const handleDragEnd = () => {
    setDraggingSlideIndex(null)
    setDropIndicatorIndex(null)
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

  const resolveBackgroundImage = (value: string) => {
    const trimmed = value.trim()
    const urlMatch = trimmed.match(/^url\((.*)\)$/i)
    if (urlMatch) {
      return urlMatch[1].trim().replace(/^["']|["']$/g, "")
    }
    return trimmed
  }

  const renderSlidePreview = (slide: Slide, index: number) => {
    const scale = getFitScale(thumbnailWidth, thumbnailHeight, slideSize.width, slideSize.height)
    const isCurrent = index === currentSlideIndex

    if (DEBUG_THUMBNAIL) {
      console.debug("Thumbnail scale", {
        containerW: thumbnailWidth,
        containerH: thumbnailHeight,
        baseW: slideSize.width,
        baseH: slideSize.height,
        scale,
      })
    }

    return (
      <div key={slide.id} className="relative">
        {dropIndicatorIndex === index && draggingSlideIndex !== null && (
          <div className="absolute -top-1 left-0 right-0 h-1 rounded bg-primary" aria-hidden="true" />
        )}
        <div
          className={cn(
            "group relative mb-3 cursor-pointer select-none overflow-hidden rounded-md border bg-white shadow-sm transition-[border-color,box-shadow,opacity]",
            isCurrent ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50 hover:shadow-md",
            draggingSlideIndex === index && "opacity-40",
          )}
          style={{
            width: thumbnailWidth,
            height: thumbnailHeight,
          }}
          onClick={() => onSlideSelect(index)}
          draggable
          onDragStart={(event) => handleDragStart(index, event)}
          onDragOver={(event) => handleDragOver(index, event)}
          onDrop={(event) => handleDrop(index, event)}
          onDragEnd={handleDragEnd}
        >
          {isCurrent && (
            <div className="absolute left-1 top-1 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                className={cn(
                  "rounded bg-card/95 p-1 text-foreground shadow-sm ring-1 ring-border",
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
                  "rounded bg-card/95 p-1 text-foreground shadow-sm ring-1 ring-border",
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
                className="rounded bg-card/95 p-1 text-foreground shadow-sm ring-1 ring-border"
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
              "absolute right-1 top-1 z-10 rounded bg-card/95 p-1 text-destructive shadow-sm opacity-0 ring-1 ring-border transition-opacity group-hover:opacity-100",
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
          <div className="absolute inset-0 pointer-events-none select-none">
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: slideSize.width,
                height: slideSize.height,
                transform: `translate(-50%, -50%) scale(${scale})`,
                transformOrigin: "center center",
                border: DEBUG_THUMBNAIL ? "1px dashed rgba(255,255,255,0.6)" : undefined,
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    zIndex: 0,
                    overflow: "hidden",
                    background: slide.background.type === "image" ? "transparent" : slide.background.value,
                  }}
                >
                  {slide.background.type === "image" && (
                    <img
                      src={resolveBackgroundImage(slide.background.value)}
                      alt=""
                      draggable={false}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: "center",
                        display: "block",
                      }}
                    />
                  )}
                </div>
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
                          fontSize: `${ptToPx(element.style.fontSizePt ?? 18)}px`,
                          fontFamily: element.style.fontFamily,
                          fontWeight: element.style.fontWeight,
                          color: element.style.color,
                          textAlign: element.style.textAlign as CSSProperties["textAlign"],
                          lineHeight: element.style.lineHeight !== undefined ? String(element.style.lineHeight) : "normal",
                          display: "block",
                          minWidth: 0,
                          minHeight: 0,
                          overflow: "hidden",
                          zIndex: 1,
                          pointerEvents: "none",
                          userSelect: "none",
                          WebkitUserSelect: "none",
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
                          zIndex: 1,
                          pointerEvents: "none",
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
                          zIndex: 1,
                          pointerEvents: "none",
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
          <div className="absolute bottom-1 left-1 min-w-5 rounded-sm bg-slate-950/75 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">{index + 1}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden bg-card">
      <div className="border-b px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">Слайды</h2>
          </div>
          <span className="text-xs font-medium text-muted-foreground">{slides.length}</span>
        </div>
        <Button onClick={onAddSlide} variant="outline" size="sm" className="w-full border-primary/25 text-primary hover:bg-accent">
          <Plus className="h-4 w-4 mr-2" />
          Добавить слайд
        </Button>
      </div>
      <div className="presentonika-scrollbar flex-1 overflow-y-auto overflow-x-hidden p-4">
        {slides.map((slide, index) => renderSlidePreview(slide, index))}
        {dropIndicatorIndex === slides.length && draggingSlideIndex !== null && (
          <div className="h-1 rounded bg-primary" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
