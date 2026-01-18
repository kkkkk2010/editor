"use client"

import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { Element } from "@/lib/types"

const DEBUG_TEXT_BOX = true
const DEBUG_MAX_LOGS = 5
const debugLoggedIds = new Set<string>()

interface TextElementViewProps {
  element: Element
  isSelected?: boolean
  isLocked?: boolean
  isEditing?: boolean
  importSettings?: { imported: boolean; textScale: number; textFontDeltaPt?: number }
  containerStyle?: React.CSSProperties
  enablePointerEvents?: boolean
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseDown?: (event: React.MouseEvent<HTMLDivElement>) => void
  onDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void
  children?: React.ReactNode
}

const scaleCache = new Map<string, number>()
const fontShrinkCache = new Map<string, number>()

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
  importSettings,
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
  const [fontsReadyFlag, setFontsReadyFlag] = useState(false)
  const baseFontSize = element.style.baseFontSize ?? element.style.fontSize ?? 16

  useEffect(() => {
    let isMounted = true
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready
        .then(() => {
          if (isMounted) {
            setFontsReadyFlag(true)
          }
        })
        .catch(() => {
          if (isMounted) {
            setFontsReadyFlag(true)
          }
        })
    } else {
      setFontsReadyFlag(true)
    }

    return () => {
      isMounted = false
    }
  }, [])

  useLayoutEffect(() => {
    let isActive = true
    const box = boxRef.current
    const visual = visualRef.current
    const textLayout = textLayoutRef.current
    if (!box || !visual || !textLayout) return

    const keyWithFonts = `${cacheKey}|fontsReady=${fontsReadyFlag}`
    const cachedScale = scaleCache.get(keyWithFonts)
    if (cachedScale !== undefined) {
      visual.style.transform = `scale(${cachedScale})`
      return () => {
        isActive = false
      }
    }

    const measure = async () => {
      const boxW = box.clientWidth
      const boxH = box.clientHeight

      textLayout.style.width = `${boxW}px`
      textLayout.style.height = `${boxH}px`
      textLayout.style.maxWidth = `${boxW}px`
      textLayout.style.maxHeight = `${boxH}px`
      textLayout.style.boxSizing = "border-box"
      textLayout.style.position = "absolute"
      textLayout.style.left = "0"
      textLayout.style.top = "0"

      visual.style.transform = "none"
      visual.style.transformOrigin = "top left"
      textLayout.style.overflowWrap = "normal"
      textLayout.style.wordBreak = "normal"
      textLayout.style.hyphens = "none"
      textLayout.style.whiteSpace = hasLineBreaks ? "pre-wrap" : "normal"

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })

      let textW = textLayout.scrollWidth
      let textH = textLayout.scrollHeight

      const dx = textW - boxW
      const dy = textH - boxH
      const overflowX = dx > 3
      const overflowY = dy > 3

      if (importSettings?.imported) {
        const shrinkKey = `${cacheKey}|${boxW}x${boxH}|base=${baseFontSize}|fontsReady=${fontsReadyFlag}`
        const cachedFontSize = fontShrinkCache.get(shrinkKey)
        if (cachedFontSize !== undefined) {
          textLayout.style.fontSize = `${cachedFontSize}pt`
        } else {
          if (overflowX && shouldWrapAnywhere(element.content)) {
            textLayout.style.overflowWrap = "anywhere"
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            })
            textW = textLayout.scrollWidth
            textH = textLayout.scrollHeight
          }

          const minDelta = baseFontSize < 12 ? 1 : 3
          const minFontSize = Math.max(8, baseFontSize - minDelta)
          let bestFontSize = baseFontSize

          if (overflowX || overflowY) {
            for (let fs = baseFontSize; fs >= minFontSize; fs -= 0.5) {
              textLayout.style.fontSize = `${fs}pt`
              await new Promise<void>((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
              })
              const testW = textLayout.scrollWidth
              const testH = textLayout.scrollHeight
              if (testW <= boxW - 2 && testH <= boxH - 2) {
                bestFontSize = fs
                break
              }
            }
          }

          textLayout.style.fontSize = `${bestFontSize}pt`
          fontShrinkCache.set(shrinkKey, bestFontSize)
        }

        if (!isActive) return
        visual.style.transform = "none"

        if (debugLoggedIds.size < DEBUG_MAX_LOGS && !debugLoggedIds.has(element.id)) {
          debugLoggedIds.add(element.id)
          const computedWidth = typeof window !== "undefined" ? getComputedStyle(textLayout).width : "n/a"
          const computedFontSize = typeof window !== "undefined" ? getComputedStyle(textLayout).fontSize : "n/a"
          const computedLineHeight = typeof window !== "undefined" ? getComputedStyle(textLayout).lineHeight : "n/a"
          const clientHeight = textLayout.clientHeight
          console.debug("Text fit", {
            id: element.id,
            boxW,
            boxH,
            textW,
            textH,
            clientHeight,
            dx,
            dy,
            overflowX,
            overflowY,
            scale: 1,
            textLayoutWidth: computedWidth,
            computedFontSize,
            computedLineHeight,
          })
        }

        return
      }

      if (isEditing) {
        return
      }

      if (overflowX && shouldWrapAnywhere(element.content)) {
        textLayout.style.overflowWrap = "anywhere"
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        textW = textLayout.scrollWidth
        textH = textLayout.scrollHeight
      }

      let scale = 1
      if (overflowX || overflowY) {
        scale = Math.min(1, boxW / textW, boxH / textH)
        if (scale > 0.99) {
          scale = 1
        }
      }

      if (!isActive) return
      visual.style.transform = scale === 1 ? "none" : `scale(${scale})`
      scaleCache.set(keyWithFonts, scale)

      if (debugLoggedIds.size < DEBUG_MAX_LOGS && !debugLoggedIds.has(element.id)) {
        debugLoggedIds.add(element.id)
        const computedWidth = typeof window !== "undefined" ? getComputedStyle(textLayout).width : "n/a"
        const computedFontSize = typeof window !== "undefined" ? getComputedStyle(textLayout).fontSize : "n/a"
        const computedLineHeight = typeof window !== "undefined" ? getComputedStyle(textLayout).lineHeight : "n/a"
        const clientHeight = textLayout.clientHeight
        console.debug("Text fit", {
          id: element.id,
          boxW,
          boxH,
          textW,
          textH,
          clientHeight,
          dx,
          dy,
          overflowX,
          overflowY,
          scale,
          textLayoutWidth: computedWidth,
          computedFontSize,
          computedLineHeight,
        })
      }
    }

    void measure()

    return () => {
      isActive = false
    }
  }, [cacheKey, element.content, element.id, hasLineBreaks, isEditing, fontsReadyFlag, baseFontSize, importSettings?.imported])

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
          data-text-layout
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
            maxWidth: "none",
            maxHeight: "none",
            boxSizing: "border-box",
            whiteSpace: hasLineBreaks ? "pre-wrap" : "normal",
            overflowWrap: "normal",
            wordBreak: "normal",
            hyphens: "none",
            lineHeight: 1,
            padding: 0,
            margin: 0,
            border: 0,
            fontFamily: `${element.style.fontFamily ?? ""}, Arial, \"Helvetica Neue\", Helvetica, sans-serif`,
            fontWeight: element.style.fontWeight,
            fontStyle: element.style.fontStyle,
            textDecoration: element.style.textDecoration,
            color: element.style.color,
            fontSize: `${element.style.baseFontSize ?? element.style.fontSize ?? 16}pt`,
            textAlign: element.style.textAlign as any,
            letterSpacing: "0px",
            textRendering: "geometricPrecision",
            fontKerning: "none",
          }}
          dangerouslySetInnerHTML={{ __html: formattedContent }}
        />
      </div>
      {children}
    </div>
  )
}
