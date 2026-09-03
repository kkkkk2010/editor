"use client"

import { useState, useEffect, useRef } from "react"
import type { Element, Slide, SlideSize } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import TextElementView from "@/components/text-element-view"
import PresentonikaBrand from "@/components/presentonika-brand"

interface SlidePreviewProps {
  slides: Slide[]
  initialSlide: number
  onExit: () => void
  slideSize: SlideSize
  title?: string
}

export default function SlidePreview({ slides, initialSlide, onExit, slideSize, title = "Презентация" }: SlidePreviewProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(initialSlide)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onExit()
      } else if (event.key === "ArrowRight") {
        setCurrentSlideIndex((prevIndex) => Math.min(prevIndex + 1, slides.length - 1))
      } else if (event.key === "ArrowLeft") {
        setCurrentSlideIndex((prevIndex) => Math.max(prevIndex - 1, 0))
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onExit, slides.length])

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    updateViewport()
    window.addEventListener("resize", updateViewport)
    return () => window.removeEventListener("resize", updateViewport)
  }, [])

  const currentSlide = slides[currentSlideIndex]
  const isFirstSlide = currentSlideIndex === 0

  useEffect(() => {
    console.log("[ui] SlidePreview render slides=", slides.length, "first slide=", slides[0])
  }, [slides])
  const isLastSlide = currentSlideIndex === slides.length - 1

  const goToPreviousSlide = () => {
    if (!isFirstSlide) {
      setCurrentSlideIndex(currentSlideIndex - 1)
    }
  }

  const goToNextSlide = () => {
    if (!isLastSlide) {
      setCurrentSlideIndex(currentSlideIndex + 1)
    }
  }

  const previewScale =
    viewport.width > 0 && viewport.height > 0
      ? Math.min((viewport.width - 32) / slideSize.width, (viewport.height - 152) / slideSize.height, 1)
      : 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17191f] pt-16 pb-16">
      <div className="absolute inset-x-0 top-0 flex h-16 items-center justify-between border-b border-white/10 bg-card px-4 sm:px-6">
        <PresentonikaBrand compact />
        <div className="min-w-0 flex-1 px-4 text-center">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">Режим просмотра</p>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onExit} title="Закрыть просмотр" aria-label="Закрыть просмотр">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div
        ref={previewRef}
        className="relative bg-white shadow-2xl ring-1 ring-white/10"
        style={{
          width: slideSize.width,
          height: slideSize.height,
          transform: `scale(${previewScale})`,
          transformOrigin: "center center",
          ...(currentSlide.background.type === "image"
            ? {
                backgroundImage: currentSlide.background.value.startsWith("url(")
                  ? currentSlide.background.value
                  : `url(${currentSlide.background.value})`,
                backgroundSize: "100% 100%",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }
            : {
                background: currentSlide.background.value,
              }),
        }}
      >
        {currentSlide.elements.map((element) => {
          // 修改预览模式下的元素渲染，添加旋转和动画支持
          if (element.type === "text") {
            let animationStyle = {}
            if (element.style.animation && element.style.animationType) {
              const duration = element.style.animationDuration || 0.5
              const delay = element.style.animationDelay || 0
              const loop = element.style.animationLoop ? "infinite" : "1"

              switch (element.style.animationType) {
                case "fade":
                  animationStyle = {
                    animation: `fadeIn ${duration}s ease ${delay}s ${loop}`,
                    opacity: 0,
                    animationFillMode: "forwards",
                  }
                  break
                case "slide":
                  animationStyle = {
                    animation: `slideIn ${duration}s ease ${delay}s ${loop}`,
                    transform: "translateY(20px)",
                    animationFillMode: "forwards",
                  }
                  break
                case "scale":
                  animationStyle = {
                    animation: `scaleIn ${duration}s ease ${delay}s ${loop}`,
                    transform: "scale(0.8)",
                    animationFillMode: "forwards",
                  }
                  break
                case "rotate":
                  animationStyle = {
                    animation: `rotateIn ${duration}s ease ${delay}s ${loop}`,
                    transform: "rotate(-10deg)",
                    animationFillMode: "forwards",
                  }
                  break
                case "bounce":
                  animationStyle = {
                    animation: `bounce ${duration}s ease ${delay}s ${loop}`,
                    animationFillMode: "forwards",
                  }
                  break
              }
            }

            return (
              <TextElementView
                key={element.id}
                element={element}
                enablePointerEvents={false}
                containerStyle={animationStyle}
              />
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
                  overflow: "hidden",
                  borderRadius: `${element.style.borderRadius || 0}px`,
                }}
              >
                <img
                  src={element.content || "/placeholder.svg"}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: element.style.objectFit || "cover",
                    filter: element.style.filter || "none",
                    opacity: element.style.opacity,
                  }}
                />
              </div>
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
                }}
              >
                {renderShape(element)}
              </div>
            )
          }
          return null
        })}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex h-16 items-center justify-center gap-3 border-t border-white/10 bg-[#1d2027] px-4 text-white">
        <Button
          className="h-9 w-9 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          variant="outline"
          size="icon"
          onClick={goToPreviousSlide}
          disabled={isFirstSlide}
          title="Предыдущий слайд"
          aria-label="Предыдущий слайд"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-20 text-center text-sm font-semibold">{currentSlideIndex + 1} / {slides.length}</div>
        <Button
          className="h-9 w-9 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          variant="outline"
          size="icon"
          onClick={goToNextSlide}
          disabled={isLastSlide}
          title="Следующий слайд"
          aria-label="Следующий слайд"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}

// 添加渲染形状的函数
const renderShape = (element: Element) => {
  const shapeType = element.content
  const fill = element.style.fill || "#ffffff"
  const stroke = element.style.stroke || "#000000"
  const strokeWidth = element.style.strokeWidth ?? 0

  if (shapeType === "rectangle") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: fill,
          border: `${strokeWidth}px solid ${stroke}`,
          borderRadius: `${element.style.borderRadius || 0}px`,
        }}
      />
    )
  }

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

  // 其他形状...
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: fill,
        border: `${strokeWidth}px solid ${stroke}`,
      }}
    />
  )
}
