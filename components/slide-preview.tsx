"use client"

import { useState, useEffect, useRef } from "react"
import type { Element, Slide, SlideSize } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import TextElementView from "@/components/text-element-view"

interface SlidePreviewProps {
  slides: Slide[]
  initialSlide: number
  onExit: () => void
  slideSize: SlideSize
}

export default function SlidePreview({ slides, initialSlide, onExit, slideSize }: SlidePreviewProps) {
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
      ? Math.min((viewport.width - 24) / slideSize.width, (viewport.height - 96) / slideSize.height, 1)
      : 1

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div
        ref={previewRef}
        className="relative bg-white shadow-lg"
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

      <Button
        className="absolute top-4 right-4 text-white hover:text-gray-300"
        variant="ghost"
        size="icon"
        onClick={onExit}
      >
        <X className="h-6 w-6" />
      </Button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white bg-black/50 px-4 py-2 rounded-full">
        {currentSlideIndex + 1} / {slides.length}
      </div>

      <Button
        className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full h-12 w-12 flex items-center justify-center"
        variant="ghost"
        size="icon"
        onClick={goToPreviousSlide}
        disabled={isFirstSlide}
      >
        <ChevronLeft className="h-8 w-8" />
      </Button>

      <Button
        className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full h-12 w-12 flex items-center justify-center"
        variant="ghost"
        size="icon"
        onClick={goToNextSlide}
        disabled={isLastSlide}
      >
        <ChevronRight className="h-8 w-8" />
      </Button>
    </div>
  )
}

// 添加渲染形状的函数
const renderShape = (element: Element) => {
  const shapeType = element.content
  const fill = element.style.fill || "#ffffff"
  const stroke = element.style.stroke || "#000000"
  const strokeWidth = element.style.strokeWidth || 2

  if (shapeType === "rectangle") {
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
