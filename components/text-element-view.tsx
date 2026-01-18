"use client"

import type React from "react"
import { cn } from "@/lib/utils"
import type { Element } from "@/lib/types"

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
  const fontSize = element.style.fontSize ?? 16

  return (
    <div
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
        style={{
          pointerEvents: "none",
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          margin: 0,
          padding: 0,
          lineHeight: 1,
          letterSpacing: "0px",
          fontFamily: element.style.fontFamily ?? "Arial, sans-serif",
          fontWeight: element.style.fontWeight,
          fontStyle: element.style.fontStyle,
          textDecoration: element.style.textDecoration,
          color: element.style.color,
          fontSize: `${fontSize}px`,
          textAlign: element.style.textAlign as any,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          hyphens: "none",
        }}
      >
        {element.content}
      </div>
      {children}
    </div>
  )
}
