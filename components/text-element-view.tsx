"use client"

import type React from "react"
import { cn } from "@/lib/utils"
import type { Element } from "@/lib/types"
import { ptToPx } from "@/lib/utils/units"

const DEBUG_TEXT_BOX = false

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
  const hasLineBreaks = element.content.includes("\n")
  const formattedContent = element.content.replace(/\n/g, "<br>")

  return (
    <div
      className="absolute"
      style={{
        left: element.position.x,
        top: element.position.y,
        width: element.size.width,
        height: element.size.height,
        overflow: "visible",
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
          isLocked && "select-none pointer-events-none",
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
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
            maxWidth: "none",
            boxSizing: "border-box",
            whiteSpace: hasLineBreaks ? "pre-wrap" : "normal",
            overflowWrap: "break-word",
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
