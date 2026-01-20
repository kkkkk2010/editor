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
const FIT_CACHE = new Map<string, { scale: number; fontSizePt: number; usedFallback: boolean }>()

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
    const visual = visualRef.current
    const measure = measureRef.current
    if (!box || !visual || !measure) return

    if (isEditing) {
      visual.style.transform = "scale(1)"
      measure.style.fontSize = `${ptToPx(element.style.fontSizePt ?? 18)}px`
      return
    }

    measure.style.overflowWrap = "normal"
    measure.style.wordBreak = "normal"
    measure.style.hyphens = "none"
    measure.style.whiteSpace = hasLineBreaks ? "pre-wrap" : "normal"

    const cacheEntry = FIT_CACHE.get(cacheKey)
    if (cacheEntry) {
      visual.style.transform = `scale(${cacheEntry.scale})`
      measure.style.fontSize = `${ptToPx(cacheEntry.fontSizePt)}px`
      return
    }

    const baseFontSizePt = element.style.fontSizePt ?? 18
    measure.style.fontSize = `${ptToPx(baseFontSizePt)}px`

    const boxW = box.clientWidth
    const boxH = box.clientHeight
    let textW = measure.scrollWidth
    let textH = measure.scrollHeight

    const overflowX = textW > boxW + 1
    const overflowY = textH > boxH + 1
    let scale = Math.min(1, boxW / textW, boxH / textH)
    let usedFallback = false
    let effectiveFontSizePt = baseFontSizePt

    if (overflowX && overflowY && scale < 0.97) {
      const reducedFontSizePt = Math.max(6, baseFontSizePt - 0.5)
      if (reducedFontSizePt !== baseFontSizePt) {
        measure.style.fontSize = `${ptToPx(reducedFontSizePt)}px`
        textW = measure.scrollWidth
        textH = measure.scrollHeight
        scale = Math.min(1, boxW / textW, boxH / textH)
        usedFallback = true
        effectiveFontSizePt = reducedFontSizePt
      }
    }

    visual.style.transform = `scale(${scale})`
    FIT_CACHE.set(cacheKey, { scale, fontSizePt: effectiveFontSizePt, usedFallback })

    if (
      (DEBUG_TEXT || window.localStorage.getItem("DEBUG_TEXT") === "1") &&
      element.id.endsWith("t1") &&
      debugLoggedIds.size < DEBUG_MAX_LOGS &&
      !debugLoggedIds.has(element.id)
    ) {
      debugLoggedIds.add(element.id)
      const computedFontSize = window.getComputedStyle(measure).fontSize
      const computedWidth = window.getComputedStyle(measure).width
      if (process.env.NODE_ENV === "development" && (window as { __DEBUG_TEXT_FIT?: boolean }).__DEBUG_TEXT_FIT) {
        console.debug("Text fit fallback", {
          id: element.id,
          overflowX,
          overflowY,
          baseFontSizePt,
          reducedFontSizePt: usedFallback ? effectiveFontSizePt : undefined,
          scale,
        })
      }
      console.debug("Text layout", {
        id: element.id,
        fontSizePt: effectiveFontSizePt,
        fontSizePx: ptToPx(effectiveFontSizePt),
        computedFontSize,
        boxW,
        boxH,
        textW,
        textH,
        computedWidth,
      })
    }
  }, [cacheKey, element.content, element.id, element.style.fontSizePt, hasLineBreaks, isEditing])

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
          transformOrigin: "top left",
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
