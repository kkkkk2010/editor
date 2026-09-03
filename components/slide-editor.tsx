"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import type { Slide, Element, SlideSize } from "@/lib/types"
import ElementContextMenu from "@/components/context-menu/element-context-menu"
import { renderAdvancedShape } from "@/components/shapes/advanced-shapes"
import TextElementView from "@/components/text-element-view"
import { cn } from "@/lib/utils"
import { ptToPx } from "@/lib/utils/units"
import {
  MAX_TEXT_FONT_SIZE_PT,
  MIN_ELEMENT_HEIGHT,
  MIN_ELEMENT_WIDTH,
  MIN_TEXT_FONT_SIZE_PT,
} from "@/lib/editor-constants"

interface SlideEditorProps {
  slide: Slide
  onUpdateSlide: (slide: Slide) => void
  imagePreview?: {
    elementId: string
    url: string
    fallbackUrl?: string
  } | null
  onBeginTextEdit?: (elementId: string) => void
  onTextEditChange?: (elementId: string, text: string) => void
  onEndTextEdit?: (elementId: string) => void
  onCancelTextEdit?: (elementId: string) => void
  selectedElement: Element | null
  onElementSelect: (element: Element | null) => void
  slideSize: SlideSize
  onCopyElement: (element: Element) => void
  onDeleteElement: (element: Element) => void
  onMoveElementForward: (element: Element) => void
  onMoveElementBackward: (element: Element) => void
  onLockToggle: (element: Element) => void
  onTransformStart?: () => void
  onTransformEnd?: () => void
}

export default function SlideEditor({
  slide,
  onUpdateSlide,
  imagePreview,
  onBeginTextEdit,
  onTextEditChange,
  onEndTextEdit,
  onCancelTextEdit,
  selectedElement,
  onElementSelect,
  slideSize,
  onCopyElement,
  onDeleteElement,
  onMoveElementForward,
  onMoveElementBackward,
  onLockToggle,
  onTransformStart,
  onTransformEnd,
}: SlideEditorProps) {
  const [draggingElement, setDraggingElement] = useState<Element | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [resizing, setResizing] = useState(false)
  const [resizeDirection, setResizeDirection] = useState("")
  const [activeGuides, setActiveGuides] = useState<Array<{ orientation: "vertical" | "horizontal"; position: number }>>([])
  const editorRef = useRef<HTMLDivElement>(null)
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const resizeSessionRef = useRef<{
    elementId: string
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    startFontSizePt: number
    direction: string
  } | null>(null)
  const RESIZE_DEBUG = false
  // базовый допуск для snap при drag/resize ручками
  const SNAP_TOLERANCE = 14

  const toggleInteractionSelectionLock = useCallback((enabled: boolean) => {
    if (enabled) {
      document.body.classList.add("editor-interaction-active")
      document.documentElement.classList.add("editor-interaction-active")
      return
    }
    document.body.classList.remove("editor-interaction-active")
    document.documentElement.classList.remove("editor-interaction-active")
  }, [])

  useEffect(() => {
    console.log("[ui] SlideEditor render slide=", slide.id, "elements=", slide.elements.length)
  }, [slide])
  const getEditorScale = (rect: DOMRect) => {
    const scaleX = rect.width / slideSize.width
    const scaleY = rect.height / slideSize.height
    const scale = Math.min(scaleX, scaleY)
    if (!Number.isFinite(scale) || scale <= 0) {
      return 1
    }
    return scale
  }

  const getPointerPosition = (event: { clientX: number; clientY: number }, rect: DOMRect) => {
    const scale = getEditorScale(rect)
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
      scale,
    }
  }

  const normalizeDimension = (value: number, minValue: number, fallback: number, label: string) => {
    if (!Number.isFinite(value)) {
      if (RESIZE_DEBUG) {
        console.warn(`[resize] ${label} is not finite`, value)
      }
      return fallback
    }
    return Math.max(minValue, value)
  }

  const normalizePosition = (value: number, fallback: number, label: string) => {
    if (!Number.isFinite(value)) {
      if (RESIZE_DEBUG) {
        console.warn(`[resize] ${label} position is not finite`, value)
      }
      return fallback
    }
    return value
  }

  const clampRectToSlide = (x: number, y: number, width: number, height: number) => {
    const maxWidth = Math.max(MIN_ELEMENT_WIDTH, slideSize.width)
    const maxHeight = Math.max(MIN_ELEMENT_HEIGHT, slideSize.height)
    const clampedWidth = Math.min(Math.max(width, MIN_ELEMENT_WIDTH), maxWidth)
    const clampedHeight = Math.min(Math.max(height, MIN_ELEMENT_HEIGHT), maxHeight)
    const clampedX = Math.min(Math.max(x, 0), Math.max(0, slideSize.width - clampedWidth))
    const clampedY = Math.min(Math.max(y, 0), Math.max(0, slideSize.height - clampedHeight))

    return {
      x: clampedX,
      y: clampedY,
      width: clampedWidth,
      height: clampedHeight,
    }
  }

  const handleElementClick = (element: Element, e: React.MouseEvent) => {
    e.stopPropagation()
    if (element.style.locked) return
    onElementSelect(element)
  }

  // 添加右键菜单处理函数
  const handleElementContextMenu = (e: React.MouseEvent) => {
    // 阻止默认浏览器右键菜单
    e.preventDefault()
  }

  const handleEditorClick = () => {
    onElementSelect(null)
  }

  const handleElementMouseDown = (element: Element, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (element.style.locked) return
    if ((e.target as HTMLElement).classList.contains("resize-handle")) {
      return
    }

    onTransformStart?.()
    toggleInteractionSelectionLock(true)
    setDraggingElement(element)

    const editorRect = editorRef.current?.getBoundingClientRect()
    if (!editorRect) return

    const pointer = getPointerPosition(e, editorRect)
    setDragOffset({
      x: pointer.x - element.position.x,
      y: pointer.y - element.position.y,
    })
  }

  const handleResizeMouseDown = (e: React.MouseEvent, element: Element, direction: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (element.style.locked) return
    onElementSelect(element)
    onTransformStart?.()
    toggleInteractionSelectionLock(true)
    setResizing(true)
    setResizeDirection(direction)
    setDraggingElement(element)
    resizeSessionRef.current = {
      elementId: element.id,
      startX: element.position.x,
      startY: element.position.y,
      startWidth: element.size.width,
      startHeight: element.size.height,
      startFontSizePt: element.style.fontSizePt ?? 18,
      direction,
    }
  }


  const applySlideSmartGuides = useCallback((
    x: number,
    y: number,
    width: number,
    height: number,
    options?: { mode?: "drag" | "resize"; direction?: string },
  ) => {
    let nextX = x
    let nextY = y
    let nextWidth = width
    let nextHeight = height
    const guides: Array<{ orientation: "vertical" | "horizontal"; position: number }> = []

    const mode = options?.mode ?? "drag"
    const direction = options?.direction ?? ""
    const slideCenterX = slideSize.width / 2
    const slideCenterY = slideSize.height / 2
    const targetsX = [0, slideCenterX, slideSize.width]
    const targetsY = [0, slideCenterY, slideSize.height]

    const pickClosest = (deltas: Array<{ delta: number; target: number }>) => {
      let best: { delta: number; target: number } | null = null
      for (const item of deltas) {
        if (Math.abs(item.delta) > SNAP_TOLERANCE) continue
        if (!best || Math.abs(item.delta) < Math.abs(best.delta)) {
          best = item
        }
      }
      return best
    }

    const buildAxisDeltas = (anchors: number[], targets: number[]) => {
      const deltas: Array<{ delta: number; target: number }> = []
      anchors.forEach((anchor) => {
        targets.forEach((target) => {
          deltas.push({ delta: target - anchor, target })
        })
      })
      return deltas
    }

    const hasEast = direction.includes("e")
    const hasWest = direction.includes("w")
    const hasSouth = direction.includes("s")
    const hasNorth = direction.includes("n")

    const anchorsX =
      mode === "resize"
        ? hasEast && !hasWest
          ? [x + width]
          : hasWest && !hasEast
            ? [x]
            : [x, x + width / 2, x + width]
        : [x, x + width / 2, x + width]

    const anchorsY =
      mode === "resize"
        ? hasSouth && !hasNorth
          ? [y + height]
          : hasNorth && !hasSouth
            ? [y]
            : [y, y + height / 2, y + height]
        : [y, y + height / 2, y + height]

    const snapX = pickClosest(buildAxisDeltas(anchorsX, targetsX))
    if (snapX) {
      guides.push({ orientation: "vertical", position: snapX.target })
      if (mode === "resize") {
        if (hasEast && !hasWest) {
          nextWidth += snapX.delta
        } else if (hasWest && !hasEast) {
          nextX += snapX.delta
          nextWidth -= snapX.delta
        } else {
          nextX += snapX.delta
        }
      } else {
        nextX += snapX.delta
      }
    }

    const snapY = pickClosest(buildAxisDeltas(anchorsY, targetsY))
    if (snapY) {
      guides.push({ orientation: "horizontal", position: snapY.target })
      if (mode === "resize") {
        if (hasSouth && !hasNorth) {
          nextHeight += snapY.delta
        } else if (hasNorth && !hasSouth) {
          nextY += snapY.delta
          nextHeight -= snapY.delta
        } else {
          nextY += snapY.delta
        }
      } else {
        nextY += snapY.delta
      }
    }

    return {
      x: nextX,
      y: nextY,
      width: Math.max(MIN_ELEMENT_WIDTH, nextWidth),
      height: Math.max(MIN_ELEMENT_HEIGHT, nextHeight),
      guides,
    }
  }, [slideSize.height, slideSize.width])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!editorRef.current || (!draggingElement && !resizing)) return
    if (window.getSelection) {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        selection.removeAllRanges()
      }
    }

    const editorRect = editorRef.current.getBoundingClientRect()
    const pointer = getPointerPosition(e, editorRect)

    if (resizing && selectedElement) {
      const session = resizeSessionRef.current
      if (!session || session.elementId !== selectedElement.id) return

      let newWidth = session.startWidth
      let newHeight = session.startHeight
      let newX = session.startX
      let newY = session.startY

      if (session.direction.includes("e")) {
        newWidth = pointer.x - session.startX
      }

      if (session.direction.includes("s")) {
        newHeight = pointer.y - session.startY
      }

      if (session.direction.includes("w")) {
        newWidth = session.startX + session.startWidth - pointer.x
        newX = pointer.x
      }

      if (session.direction.includes("n")) {
        newHeight = session.startY + session.startHeight - pointer.y
        newY = pointer.y
      }

      const normalizedWidth = normalizeDimension(
        newWidth,
        MIN_ELEMENT_WIDTH,
        session.startWidth,
        "width",
      )
      const normalizedHeight = normalizeDimension(
        newHeight,
        MIN_ELEMENT_HEIGHT,
        session.startHeight,
        "height",
      )

      if (session.direction.includes("w")) {
        newX = session.startX + session.startWidth - normalizedWidth
      }

      if (session.direction.includes("n")) {
        newY = session.startY + session.startHeight - normalizedHeight
      }

      newX = normalizePosition(newX, session.startX, "x")
      newY = normalizePosition(newY, session.startY, "y")

      // smart guides для resize (когда тянут за ручки)
      const snapped = applySlideSmartGuides(newX, newY, normalizedWidth, normalizedHeight, {
        mode: "resize",
        direction: session.direction,
      })
      const clamped = clampRectToSlide(snapped.x, snapped.y, snapped.width, snapped.height)
      setActiveGuides(snapped.guides)

      const newSize = {
        width: clamped.width,
        height: clamped.height,
      }
      const newPosition = {
        x: clamped.x,
        y: clamped.y,
      }

      const widthRatio = session.startWidth > 0 ? newSize.width / session.startWidth : 1
      const heightRatio = session.startHeight > 0 ? newSize.height / session.startHeight : 1
      let textScale = Math.sqrt(Math.max(0.0001, widthRatio * heightRatio))
      if ((session.direction === "e" || session.direction === "w") && Number.isFinite(widthRatio)) {
        textScale = widthRatio
      }
      if ((session.direction === "n" || session.direction === "s") && Number.isFinite(heightRatio)) {
        textScale = heightRatio
      }
      const scaledFontSizePt = Math.max(
        MIN_TEXT_FONT_SIZE_PT,
        Math.min(MAX_TEXT_FONT_SIZE_PT, session.startFontSizePt * textScale),
      )

      const updatedElement = {
        ...selectedElement,
        size: newSize,
        position: newPosition,
        style:
          selectedElement.type === "text"
            ? {
                ...selectedElement.style,
                fontSizePt: Math.round(scaledFontSizePt * 10) / 10,
              }
            : selectedElement.style,
      }

      if (RESIZE_DEBUG) {
        console.debug("[resize] update", {
          id: selectedElement.id,
          width: newSize.width,
          height: newSize.height,
          scale: pointer.scale,
        })
      }

      const updatedElements = slide.elements.map((el) => (el.id === selectedElement.id ? updatedElement : el))

      onUpdateSlide({
        ...slide,
        elements: updatedElements,
      })

      onElementSelect(updatedElement)
    } else if (draggingElement) {
      const newX = pointer.x - dragOffset.x
      const newY = pointer.y - dragOffset.y
      const snapped = applySlideSmartGuides(newX, newY, draggingElement.size.width, draggingElement.size.height, {
        mode: "drag",
      })
      const clamped = clampRectToSlide(snapped.x, snapped.y, snapped.width, snapped.height)
      setActiveGuides(snapped.guides)

      const updatedElement = {
        ...draggingElement,
        position: {
          x: clamped.x,
          y: clamped.y,
        },
      }

      const updatedElements = slide.elements.map((el) => (el.id === draggingElement.id ? updatedElement : el))

      onUpdateSlide({
        ...slide,
        elements: updatedElements,
      })

      if (selectedElement && selectedElement.id === draggingElement.id) {
        onElementSelect(updatedElement)
      }
    }
  }, [
    dragOffset,
    draggingElement,
    resizing,
    resizeDirection,
    selectedElement,
    slide,
    slideSize,
    onUpdateSlide,
    onElementSelect,
    applySlideSmartGuides,
  ])

  const handleMouseUp = useCallback(() => {
    if (draggingElement || resizing) {
      onTransformEnd?.()
    }
    toggleInteractionSelectionLock(false)
    setDraggingElement(null)
    setResizing(false)
    setResizeDirection("")
    setActiveGuides([])
    resizeSessionRef.current = null
  }, [draggingElement, resizing, onTransformEnd, toggleInteractionSelectionLock])

  useEffect(() => {
    if (!(draggingElement || resizing)) return
    const previousUserSelect = document.body.style.userSelect
    const previousWebkitUserSelect = document.body.style.webkitUserSelect
    document.body.style.userSelect = "none"
    document.body.style.webkitUserSelect = "none"

    return () => {
      document.body.style.userSelect = previousUserSelect
      document.body.style.webkitUserSelect = previousWebkitUserSelect
    }
  }, [draggingElement, resizing])

  const handleTextDoubleClick = (element: Element) => {
    if (element.type !== "text" || element.style.locked) return

    const input = document.createElement("textarea")
    onBeginTextEdit?.(element.id)
    input.value = element.content
    input.style.position = "absolute"
    input.style.left = `${element.position.x}px`
    input.style.top = `${element.position.y}px`
    input.style.width = `${element.size.width}px`
    input.style.height = `${element.size.height}px`
    input.style.fontSize = `${ptToPx(element.style.fontSizePt ?? 18)}px`
    input.style.fontFamily = element.style.fontFamily || "Inter"
    input.style.fontWeight = element.style.fontWeight || "normal"
    input.style.fontStyle = element.style.fontStyle || "normal"
    input.style.textDecoration = element.style.textDecoration || "none"
    input.style.color = element.style.color || "#000"
    input.style.textAlign = element.style.textAlign || "left"
    input.style.lineHeight = element.style.lineHeight ? `${element.style.lineHeight}` : "normal"
    input.style.border = "none"
    input.style.padding = "0"
    input.style.margin = "0"
    input.style.overflowX = "hidden"
    input.style.overflowY = "auto"
    input.style.background = "transparent"
    input.style.resize = "none"
    input.style.outline = "2px solid #3b82f6"
    input.style.whiteSpace = "pre-wrap" // 保留换行和空格
    input.style.overflowWrap = "break-word"
    input.style.wordBreak = "normal"
    input.style.hyphens = "none"
    input.style.boxSizing = "border-box"
    input.style.display = "block"
    input.style.minWidth = "0"
    input.style.minHeight = "0"

    // 设置编辑元素的ID，用于在渲染时隐藏原始元素
    const editingId = element.id
    setEditingElementId(editingId)

    let didCancel = false

    const handleBlur = () => {
      if (didCancel) {
        return
      }
      const updatedElement = {
        ...element,
        content: input.value,
      }

      const updatedElements = slide.elements.map((el) => (el.id === element.id ? updatedElement : el))

      onUpdateSlide({
        ...slide,
        elements: updatedElements,
      })

      onEndTextEdit?.(element.id)

      if (selectedElement && selectedElement.id === element.id) {
        onElementSelect(updatedElement)
      }

      input.remove()
      setEditingElementId(null)
    }

    const handleInput = () => {
      onTextEditChange?.(element.id, input.value)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        didCancel = true
        onCancelTextEdit?.(element.id)
        input.remove()
        setEditingElementId(null)
      }
    }

    input.addEventListener("blur", handleBlur)
    input.addEventListener("input", handleInput)
    input.addEventListener("keydown", handleKeyDown)

    editorRef.current?.appendChild(input)
    input.focus()
  }

  // 修改键盘事件处理函数，检查焦点是否在textarea或input内
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedElement) return

      // 检查焦点是否在属性面板内的输入元素中
      const activeElement = document.activeElement
      const isEditable = activeElement instanceof HTMLElement && activeElement.isContentEditable
      const isInputElement =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        isEditable

      if (isInputElement) {
        return // 如果焦点在输入元素中，不处理快捷键
      }

      // 检查是否在编辑文本
      if (editingElementId) return

      // 删除元素 (Delete 或 Backspace)
      if ((e.key === "Delete" || e.key === "Backspace") && !editingElementId) {
        e.preventDefault()
        onDeleteElement(selectedElement)
      }

      // 复制元素 (Ctrl+C 或 Cmd+C)
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && !editingElementId) {
        e.preventDefault()
        onCopyElement(selectedElement)
      }

      // 上移一层 (Ctrl+↑ 或 Cmd+↑)
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowUp" && !editingElementId) {
        e.preventDefault()
        onMoveElementForward(selectedElement)
      }

      // 下移一层 (Ctrl+↓ 或 Cmd+↓)
      if ((e.ctrlKey || e.metaKey) && e.key === "ArrowDown" && !editingElementId) {
        e.preventDefault()
        onMoveElementBackward(selectedElement)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [selectedElement, editingElementId, onDeleteElement, onCopyElement, onMoveElementForward, onMoveElementBackward])

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // 修改整个元素的渲染容器，确保正确的定位
  const renderElement = (element: Element) => {
    const isSelected = selectedElement?.id === element.id
    const isLocked = element.style.locked || false

    // 修改文本元素的渲染方式，确保ElementContextMenu只包含一个子元素
    // 修改文本元素的渲染，添加调整大小的句柄
    // 修改文本元素的渲染方式，确保ElementContextMenu只包含一个子元素
    // 修改元素渲染，确保动画效果正确应用

    // 修改文本元素的渲染，确保动画效果正确应用
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
        <ElementContextMenu
          key={element.id}
          element={element}
          onCopy={onCopyElement}
          onDelete={onDeleteElement}
          onMoveForward={onMoveElementForward}
          onMoveBackward={onMoveElementBackward}
          onEdit={() => handleTextDoubleClick(element)}
          onLockToggle={onLockToggle}
        >
          <TextElementView
            element={element}
            isSelected={isSelected}
            isLocked={isLocked}
            isEditing={editingElementId === element.id}
            containerStyle={animationStyle}
            onClick={(e) => handleElementClick(element, e)}
            onMouseDown={(e) => handleElementMouseDown(element, e)}
            onDoubleClick={() => handleTextDoubleClick(element)}
            onContextMenu={handleElementContextMenu}
          >
            {isSelected && !isLocked && renderResizeHandles(element)}
          </TextElementView>
        </ElementContextMenu>
      )
    }

    // 修改其他元素的渲染，确保调整大小的句柄在正确的位置
    // 修改图片元素的渲染
    if (element.type === "image") {
      return (
        <ElementContextMenu
          key={element.id}
          element={element}
          onCopy={onCopyElement}
          onDelete={onDeleteElement}
          onMoveForward={onMoveElementForward}
          onMoveBackward={onMoveElementBackward}
          onEdit={() => {}}
          onLockToggle={onLockToggle}
        >
          <div className="relative" style={{ position: "absolute", left: element.position.x, top: element.position.y }}>
            <div
              className={cn(
                "w-full h-full",
                !isLocked && "cursor-move",
                isSelected && "outline outline-2 outline-primary",
                isLocked && "select-none pointer-events-none",
              )}
              style={{
                width: element.size.width,
                height: element.size.height,
                borderRadius: `${element.style.borderRadius || 0}px`,
                opacity: element.style.opacity,
                overflow: "hidden",
                transform: element.style.rotation ? `rotate(${element.style.rotation}deg)` : undefined,
                transition: element.style.animation ? "all 0.3s ease-in-out" : "none",
              }}
              onClick={(e) => handleElementClick(element, e)}
              onMouseDown={(e) => handleElementMouseDown(element, e)}
              onContextMenu={handleElementContextMenu}
            >
              <img
                src={(imagePreview?.elementId === element.id ? imagePreview.url : element.content) || "/placeholder.svg"}
                alt="Slide element"
                style={{
                  width: "100%",
                  height: "100%",
                        objectFit: element.style.objectFit ?? "cover",
                  filter: element.style.filter || "none",
                }}
                draggable="false"
                onError={(event) => {
                  if (
                    imagePreview?.elementId === element.id &&
                    imagePreview.fallbackUrl &&
                    event.currentTarget.src !== imagePreview.fallbackUrl
                  ) {
                    event.currentTarget.src = imagePreview.fallbackUrl
                  }
                }}
                onDragStart={(e) => e.preventDefault()}
              />
            </div>
            {isSelected && !isLocked && renderResizeHandles(element)}
          </div>
        </ElementContextMenu>
      )
    }

    // 修改形状元素的渲染
    if (element.type === "shape") {
      return (
        <ElementContextMenu
          key={element.id}
          element={element}
          onCopy={onCopyElement}
          onDelete={onDeleteElement}
          onMoveForward={onMoveElementForward}
          onMoveBackward={onMoveElementBackward}
          onEdit={() => {}}
          onLockToggle={onLockToggle}
        >
          <div className="relative" style={{ position: "absolute", left: element.position.x, top: element.position.y }}>
            <div
              className={cn(
                "w-full h-full",
                !isLocked && "cursor-move",
                isSelected && "outline outline-2 outline-primary",
                isLocked && "select-none pointer-events-none",
              )}
              style={{
                width: element.size.width,
                height: element.size.height,
                opacity: element.style.opacity,
                transform: element.style.rotation ? `rotate(${element.style.rotation}deg)` : undefined,
                transition: element.style.animation ? "all 0.3s ease-in-out" : "none",
              }}
              onClick={(e) => handleElementClick(element, e)}
              onMouseDown={(e) => handleElementMouseDown(element, e)}
              onContextMenu={handleElementContextMenu}
            >
              {renderShape(element)}
            </div>
            {isSelected && !isLocked && renderResizeHandles(element)}
          </div>
        </ElementContextMenu>
      )
    }

    return null
  }

  // 添加渲染形状的函数
  const renderShape = (element: Element) => {
    const shapeType = element.content
    const fill = element.style.fill || "#ffffff"
    const stroke = element.style.stroke || "#000000"
    const strokeWidth = element.style.strokeWidth ?? 0

    // 高级形状渲染
    const advancedShapes = ["star", "hexagon", "pentagon", "cloud"]
    if (advancedShapes.includes(shapeType)) {
      return renderAdvancedShape(element)
    }

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
        }}
      />
    )
  }

  // 添加渲染调整大小手柄的函数
  const renderResizeHandles = (element: Element) => {
    return (
      <div className="absolute inset-0 overflow-visible pointer-events-none">
        <div
          className="resize-handle absolute z-20 h-4 w-4 -top-2 -left-2 rounded-full border-2 border-background bg-primary shadow ring-1 ring-primary/30 pointer-events-auto cursor-nw-resize transition-transform hover:scale-110 active:scale-95"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "nw")}
        />
        <div
          className="resize-handle absolute z-20 h-4 w-4 -top-2 left-1/2 -translate-x-1/2 rounded-full border-2 border-background bg-primary shadow ring-1 ring-primary/30 pointer-events-auto cursor-n-resize transition-transform hover:scale-110 active:scale-95"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "n")}
        />
        <div
          className="resize-handle absolute z-20 h-4 w-4 -top-2 -right-2 rounded-full border-2 border-background bg-primary shadow ring-1 ring-primary/30 pointer-events-auto cursor-ne-resize transition-transform hover:scale-110 active:scale-95"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "ne")}
        />
        <div
          className="resize-handle absolute z-20 h-4 w-4 top-1/2 -right-2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow ring-1 ring-primary/30 pointer-events-auto cursor-e-resize transition-transform hover:scale-110 active:scale-95"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "e")}
        />
        <div
          className="resize-handle absolute z-20 h-4 w-4 -bottom-2 -right-2 rounded-full border-2 border-background bg-primary shadow ring-1 ring-primary/30 pointer-events-auto cursor-se-resize transition-transform hover:scale-110 active:scale-95"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "se")}
        />
        <div
          className="resize-handle absolute z-20 h-4 w-4 -bottom-2 left-1/2 -translate-x-1/2 rounded-full border-2 border-background bg-primary shadow ring-1 ring-primary/30 pointer-events-auto cursor-s-resize transition-transform hover:scale-110 active:scale-95"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "s")}
        />
        <div
          className="resize-handle absolute z-20 h-4 w-4 -bottom-2 -left-2 rounded-full border-2 border-background bg-primary shadow ring-1 ring-primary/30 pointer-events-auto cursor-sw-resize transition-transform hover:scale-110 active:scale-95"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "sw")}
        />
        <div
          className="resize-handle absolute z-20 h-4 w-4 top-1/2 -left-2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow ring-1 ring-primary/30 pointer-events-auto cursor-w-resize transition-transform hover:scale-110 active:scale-95"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "w")}
        />
      </div>
    )
  }

  return (
    <div
      ref={editorRef}
      className="editor-slide-frame relative bg-white"
      style={{
        width: slideSize.width,
        height: slideSize.height,
        ...(slide.background.type === "image"
          ? {
              backgroundImage: slide.background.value.startsWith("url(")
                ? slide.background.value
                : `url(${slide.background.value})`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }
          : {
              background: slide.background.value,
            }),
      }}
      onClick={handleEditorClick}
    >
      {activeGuides.map((guide, index) =>
        guide.orientation === "vertical" ? (
          <div
            key={`guide-v-${index}-${guide.position}`}
            className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-sky-500/80"
            style={{ left: guide.position }}
          />
        ) : (
          <div
            key={`guide-h-${index}-${guide.position}`}
            className="pointer-events-none absolute left-0 right-0 z-30 h-px bg-sky-500/80"
            style={{ top: guide.position }}
          />
        ),
      )}
      {slide.elements.map(renderElement)}
    </div>
  )
}
