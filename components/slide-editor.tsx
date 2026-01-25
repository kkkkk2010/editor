"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import type { Slide, Element, SlideSize } from "@/lib/types"
import ElementContextMenu from "@/components/context-menu/element-context-menu"
import { renderAdvancedShape } from "@/components/shapes/advanced-shapes"
import TextElementView from "@/components/text-element-view"
import { cn } from "@/lib/utils"
import { ptToPx } from "@/lib/utils/units"

interface SlideEditorProps {
  slide: Slide
  onUpdateSlide: (slide: Slide) => void
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
  const editorRef = useRef<HTMLDivElement>(null)
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const RESIZE_DEBUG = false
  const MIN_ELEMENT_WIDTH = 50
  const MIN_ELEMENT_HEIGHT = 20

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
    e.stopPropagation()

    if (element.style.locked) return
    if ((e.target as HTMLElement).classList.contains("resize-handle")) {
      return
    }

    onTransformStart?.()
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
    e.stopPropagation()
    if (element.style.locked) return
    onElementSelect(element)
    onTransformStart?.()
    setResizing(true)
    setResizeDirection(direction)
    setDraggingElement(element)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!editorRef.current || (!draggingElement && !resizing)) return

    const editorRect = editorRef.current.getBoundingClientRect()
    const pointer = getPointerPosition(e, editorRect)

    if (resizing && selectedElement) {
      let newWidth = selectedElement.size.width
      let newHeight = selectedElement.size.height
      let newX = selectedElement.position.x
      let newY = selectedElement.position.y

      if (resizeDirection.includes("e")) {
        newWidth = pointer.x - selectedElement.position.x
      }

      if (resizeDirection.includes("s")) {
        newHeight = pointer.y - selectedElement.position.y
      }

      if (resizeDirection.includes("w")) {
        newWidth = selectedElement.position.x + selectedElement.size.width - pointer.x
        newX = pointer.x
      }

      if (resizeDirection.includes("n")) {
        newHeight = selectedElement.position.y + selectedElement.size.height - pointer.y
        newY = pointer.y
      }

      const normalizedWidth = normalizeDimension(
        newWidth,
        MIN_ELEMENT_WIDTH,
        selectedElement.size.width,
        "width",
      )
      const normalizedHeight = normalizeDimension(
        newHeight,
        MIN_ELEMENT_HEIGHT,
        selectedElement.size.height,
        "height",
      )

      if (resizeDirection.includes("w")) {
        newX = selectedElement.position.x + selectedElement.size.width - normalizedWidth
      }

      if (resizeDirection.includes("n")) {
        newY = selectedElement.position.y + selectedElement.size.height - normalizedHeight
      }

      newX = normalizePosition(newX, selectedElement.position.x, "x")
      newY = normalizePosition(newY, selectedElement.position.y, "y")

      const newSize = {
        width: normalizedWidth,
        height: normalizedHeight,
      }
      const newPosition = {
        x: newX,
        y: newY,
      }

      const updatedElement = {
        ...selectedElement,
        size: newSize,
        position: newPosition,
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

      const updatedElement = {
        ...draggingElement,
        position: {
          x: Math.max(0, Math.min(newX, slideSize.width - draggingElement.size.width)),
          y: Math.max(0, Math.min(newY, slideSize.height - draggingElement.size.height)),
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
  }

  const handleMouseUp = () => {
    if (draggingElement || resizing) {
      onTransformEnd?.()
    }
    setDraggingElement(null)
    setResizing(false)
    setResizeDirection("")
  }

  const handleTextDoubleClick = (element: Element, e: React.MouseEvent) => {
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
    input.style.fontFamily = element.style.fontFamily || "Times New Roman"
    input.style.fontWeight = element.style.fontWeight || "normal"
    input.style.fontStyle = element.style.fontStyle || "normal"
    input.style.textDecoration = element.style.textDecoration || "none"
    input.style.color = element.style.color || "#000"
    input.style.textAlign = element.style.textAlign || "left"
    input.style.lineHeight = element.style.lineHeight ? `${element.style.lineHeight}` : "normal"
    input.style.border = "none"
    input.style.padding = "0"
    input.style.margin = "0"
    input.style.overflow = "hidden"
    input.style.background = "transparent"
    input.style.resize = "none"
    input.style.outline = "2px solid #3b82f6"
    input.style.whiteSpace = "pre-wrap" // 保留换行和空格
    input.style.overflowWrap = "normal"
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
  }, [draggingElement, resizing, selectedElement, dragOffset, resizeDirection])

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
          onEdit={() => handleTextDoubleClick(element, {} as React.MouseEvent)}
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
            onDoubleClick={(e) => handleTextDoubleClick(element, e)}
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
                isLocked && "select-none pointer-events-none opacity-70",
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
                src={element.content || "/placeholder.svg"}
                alt="Slide element"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: element.style.objectFit || "cover",
                  filter: element.style.filter || "none",
                }}
                draggable="false"
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
                isLocked && "select-none pointer-events-none opacity-70",
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
    const strokeWidth = element.style.strokeWidth || 2

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
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="resize-handle absolute w-2 h-2 bg-primary border border-white rounded-full cursor-nw-resize -top-1 -left-1 z-10 pointer-events-auto"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "nw")}
        />
        <div
          className="resize-handle absolute w-2 h-2 bg-primary border border-white rounded-full cursor-n-resize -top-1 left-1/2 -translate-x-1/2 z-10 pointer-events-auto"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "n")}
        />
        <div
          className="resize-handle absolute w-2 h-2 bg-primary border border-white rounded-full cursor-ne-resize -top-1 -right-1 z-10 pointer-events-auto"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "ne")}
        />
        <div
          className="resize-handle absolute w-2 h-2 bg-primary border border-white rounded-full cursor-e-resize top-1/2 -right-1 -translate-y-1/2 z-10 pointer-events-auto"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "e")}
        />
        <div
          className="resize-handle absolute w-2 h-2 bg-primary border border-white rounded-full cursor-se-resize -bottom-1 -right-1 z-10 pointer-events-auto"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "se")}
        />
        <div
          className="resize-handle absolute w-2 h-2 bg-primary border border-white rounded-full cursor-s-resize -bottom-1 left-1/2 -translate-x-1/2 z-10 pointer-events-auto"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "s")}
        />
        <div
          className="resize-handle absolute w-2 h-2 bg-primary border border-white rounded-full cursor-sw-resize -bottom-1 -left-1 z-10 pointer-events-auto"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "sw")}
        />
        <div
          className="resize-handle absolute w-2 h-2 bg-primary border border-white rounded-full cursor-w-resize top-1/2 -left-1 -translate-y-1/2 z-10 pointer-events-auto"
          onMouseDown={(e) => handleResizeMouseDown(e, element, "w")}
        />
      </div>
    )
  }

  return (
    <div
      ref={editorRef}
      className="relative bg-white shadow-lg"
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
      {slide.elements.map(renderElement)}
    </div>
  )
}
