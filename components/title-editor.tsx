"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Pencil } from "lucide-react"

interface TitleEditorProps {
  title: string
  onTitleChange: (title: string) => void
}

export default function TitleEditor({ title, onTitleChange }: TitleEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = () => {
    setIsEditing(true)
  }

  const handleBlur = () => {
    if (editedTitle.trim()) {
      onTitleChange(editedTitle)
    } else {
      setEditedTitle(title)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBlur()
    } else if (e.key === "Escape") {
      setEditedTitle(title)
      setIsEditing(false)
    }
  }

  return (
    <div className="flex min-w-0 items-center">
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editedTitle}
          onChange={(e) => setEditedTitle(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="h-8 min-w-0 w-full max-w-md border-b border-primary bg-transparent px-1 font-semibold text-foreground outline-none"
          aria-label="Название презентации"
        />
      ) : (
        <div className="flex min-w-0 items-center gap-1">
          <div className="truncate font-semibold text-foreground" onDoubleClick={handleDoubleClick} title={title}>
            {title}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={() => setIsEditing(true)} title="Переименовать" aria-label="Переименовать презентацию">
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}

