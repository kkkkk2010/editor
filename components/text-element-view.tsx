"use client"

import type React from "react"
import { useLayoutEffect, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"
import type { Element } from "@/lib/types"

const DEBUG_TEXT_BOX = true
const DEBUG_MAX_LOGS = 2
const debugLoggedIds = new Set<string>()

interface TextElementViewProps {
  element: Element
  isSelected?: boolean
  isLocked?: boolean
  isEditing?: boolean
  containerStyle?: React.CSSProperties
  enablePointerEvents?: boolean
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseDown?: (event: React.MouseEvent<HTMLDivElement>) => void
  onDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void
  children?: React.ReactNode
}

const scaleCache = new Map<string, number>()

function getCacheKey(element: Element) {
  return `${element.id}::${element.content}::${element.style.fontFamily ?? ""}::${element.style.fontSize ?? ""}::${element.style.fontWeight ?? ""}::${element.style.fontStyle ?? ""}::${element.size.width}x${element.size.height}`
}

function shouldWrapAnywhere(text: string) {
  return text.split(/\s+/).some((word) => word.length >= 18)
}

export default function TextElementView({
  element,
  isSelected,
  isLocked,
  isEditing,
  containerStyle,
  enablePointerEvents = true,
  onClick,
  onMouseDown,
  onDoubleClick,
  onContextMenu,
  children,
}: TextElementViewProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const visualRef = useRef<HTMLDivElement>(null)
  const textLayoutRef = useRef<HTMLDivElement>(null)
  const cacheKey = useMemo(() => getCacheKey(element), [element])
  const hasLineBreaks = element.content.includes("\n")
  const formattedContent = element.content.replace(/\n/g, "<br>")

  useLayoutEffect(() => {
    const box = boxRef.current
    const visual = visualRef.current
    const textLayout = textLayoutRef.current
    if (!box || !visual || !textLayout) return

    const cachedScale = scaleCache.get(cacheKey)
    if (cachedScale !== undefined) {
      visual.style.transform = `scale(${cachedScale})`
      return
    }

    if (isEditing) {
      return
    }

    visual.style.transform = "scale(1)"
    visual.style.transformOrigin = "top left"
    textLayout.style.overflowWrap = "normal"
    textLayout.style.wordBreak = "normal"
    textLayout.style.hyphens = "none"
    textLayout.style.whiteSpace = hasLineBreaks ? "pre-wrap" : "normal"


    const boxW = box.clientWidth
    const boxH = box.clientHeight
    let textW = textLayout.scrollWidth
    let textH = textLayout.scrollHeight

    const overflowX = textW > boxW + 1
    const overflowY = textH > boxH + 1

    if (overflowX && shouldWrapAnywhere(element.content)) {
      textLayout.style.overflowWrap = "anywhere"
      textW = textLayout.scrollWidth
      textH = textLayout.scrollHeight
    }

    let scale = 1
    if (overflowX || overflowY) {
      scale = Math.min(1, boxW / textW, boxH / textH)
      if (scale > 0.985) {
        scale = 1
      }
    }

    visual.style.transform = `scale(${scale})`
    scaleCache.set(cacheKey, scale)

    if (debugLoggedIds.size < DEBUG_MAX_LOGS && !debugLoggedIds.has(element.id)) {
      debugLoggedIds.add(element.id)
      const computedWidth = typeof window !== "undefined" ? getComputedStyle(textLayout).width : "n/a"
      console.debug("Text fit", {
        id: element.id,
        overflowX,
        overflowY,
        scale,
        boxW,
        boxH,
        textW,
        textH,
        textLayoutWidth: computedWidth,
      })
    }
  }, [cacheKey, element.content, element.id, hasLineBreaks, isEditing])

  return (
    <div
      ref={boxRef}
      className="absolute"
      style={{
        left: element.position.x,
        top: element.position.y,
        width: element.size.width,
        height: element.size.height,
        overflow: "hidden",
        padding: 0,
        margin: 0,
        transform: element.style.rotation ? `rotate(${element.style.rotation}deg)` : undefined,
        border: DEBUG_TEXT_BOX ? "1px solid red" : undefined,
        boxSizing: "border-box",
        ...containerStyle,
      }}
    >
      <div
        className={cn(
          "absolute inset-0",
          !isLocked && "cursor-move",
          isSelected && "outline outline-2 outline-primary",
          isEditing && "opacity-0",
          isLocked && "select-none pointer-events-none opacity-70",
        )}
        style={{
          pointerEvents: enablePointerEvents ? "auto" : "none",
        }}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      />
      <div
        ref={visualRef}
        className="absolute inset-0"
        style={{
          pointerEvents: "none",
          transformOrigin: "top left",
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div
          ref={textLayoutRef}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            minWidth: 0,
            maxWidth: "none",
            boxSizing: "border-box",
            whiteSpace: hasLineBreaks ? "pre-wrap" : "normal",
            overflowWrap: "normal",
            wordBreak: "normal",
            hyphens: "none",
            lineHeight: 1.1,
            padding: 0,
            margin: 0,
            fontFamily: element.style.fontFamily,
            fontWeight: element.style.fontWeight,
            fontStyle: element.style.fontStyle,
            textDecoration: element.style.textDecoration,
            color: element.style.color,
            fontSize: element.style.fontSize || 16,
            textAlign: element.style.textAlign as any,
          }}
          dangerouslySetInnerHTML={{ __html: formattedContent }}
        />
      </div>
      {children}
    </div>
  )
}
