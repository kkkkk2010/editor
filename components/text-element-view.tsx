"use client"

import type React from "react"
import { useLayoutEffect, useMemo, useRef } from "react"
import { cn } from "@/lib/utils"
import type { Element } from "@/lib/types"
import { ptToPx } from "@/lib/utils/units"

const DEBUG_TEXT_BOX = false
const DEBUG_TEXT = false
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

function getCacheKey(element: Element) {
  return `${element.id}::${element.content}::${element.style.fontFamily ?? ""}::${
    element.style.fontSizePt ?? ""
  }::${element.style.fontWeight ?? ""}::${element.style.fontStyle ?? ""}::${
    element.size.width
  }x${element.size.height}`
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
  const measureRef = useRef<HTMLDivElement>(null)
  const cacheKey = useMemo(() => getCacheKey(element), [element])
  const hasLineBreaks = element.content.includes("\n")
  const formattedContent = element.content.replace(/\n/g, "<br>")

  useLayoutEffect(() => {
    const box = boxRef.current
    const measure = measureRef.current
    if (!box || !measure) return

    measure.style.overflowWrap = "normal"
    measure.style.wordBreak = "normal"
    measure.style.hyphens = "none"
    measure.style.whiteSpace = hasLineBreaks ? "pre-wrap" : "normal"

    if (DEBUG_TEXT || window.localStorage.getItem("DEBUG_TEXT") === "1") {
      if (
        element.id.endsWith("t1") &&
        debugLoggedIds.size < DEBUG_MAX_LOGS &&
        !debugLoggedIds.has(element.id)
      ) {
        debugLoggedIds.add(element.id)
        const boxW = box.clientWidth
        const boxH = box.clientHeight
        const textW = measure.scrollWidth
        const textH = measure.scrollHeight
        const fontSizePt = element.style.fontSizePt ?? 18
        const fontSizePx = ptToPx(fontSizePt)
        const computedFontSize = window.getComputedStyle(measure).fontSize
        const computedWidth = window.getComputedStyle(measure).width
        console.debug("Text layout", {
          id: element.id,
          fontSizePt,
          fontSizePx,
          computedFontSize,
          boxW,
          boxH,
          textW,
          textH,
          computedWidth,
        })
      }
    }
  }, [cacheKey, element.content, element.id, hasLineBreaks])

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
        minWidth: 0,
        minHeight: 0,
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
          pointerEvents: enablePointerEvents && !isEditing ? "auto" : "none",
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
          opacity: isEditing ? 0 : 1,
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div
          ref={measureRef}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
            maxWidth: "none",
            boxSizing: "border-box",
            whiteSpace: hasLineBreaks ? "pre-wrap" : "normal",
            overflowWrap: "normal",
            wordBreak: "normal",
            hyphens: "none",
            lineHeight: element.style.lineHeight !== undefined ? String(element.style.lineHeight) : "normal",
            padding: 0,
            margin: 0,
            fontFamily: element.style.fontFamily,
            fontWeight: element.style.fontWeight,
            fontStyle: element.style.fontStyle,
            textDecoration: element.style.textDecoration,
            color: element.style.color,
            fontSize: `${ptToPx(element.style.fontSizePt ?? 18)}px`,
            textAlign: element.style.textAlign as React.CSSProperties["textAlign"],
          }}
          dangerouslySetInnerHTML={{ __html: formattedContent }}
        />
      </div>
      {children}
    </div>
  )
}
