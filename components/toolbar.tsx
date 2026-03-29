"use client"
import React from "react"
import type { Element } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Bold,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Square,
  Save,
  Plus,
  Undo2,
  Redo2,
  Download,
  Moon,
  Sun,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import TitleEditor from "./title-editor"
import ImportZipDialog from "@/components/import-zip-dialog"
import ImportPptxDialog from "@/components/import-pptx-dialog"
import { Input } from "@/components/ui/input"
import { useTheme } from "next-themes"

interface ToolbarProps {
  selectedElement: Element | null
  onUpdateElement: (element: Element) => void
  onAddShape: (type: string) => void
  onAddText: () => void
  title: string
  onTitleChange: (title: string) => void
  importOutZipFromArrayBuffer: (outZip: ArrayBuffer) => Promise<void>
  showAdminImportTools?: boolean
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onSaveProject: () => void
  hasUnsavedChanges?: boolean
  isSavingProject?: boolean
  onExportOutZip?: () => void
  onExportCurrentSlideAsLayout?: () => void
  isExportingOutZip?: boolean
  isExportingLayout?: boolean
}

export default function Toolbar({
  selectedElement,
  onUpdateElement,
  onAddShape,
  onAddText,
  title,
  onTitleChange,
  importOutZipFromArrayBuffer,
  showAdminImportTools,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSaveProject,
  hasUnsavedChanges,
  isSavingProject,
  onExportOutZip,
  onExportCurrentSlideAsLayout,
  isExportingOutZip,
  isExportingLayout,
}: ToolbarProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === "dark"

  const PRESET_COLORS = [
    "#000000", "#111827", "#374151", "#6b7280", "#ffffff",
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
    "#3b82f6", "#8b5cf6", "#ec4899", "#7c2d12", "#14532d", "#1e3a8a",
  ]

  const updateTextStyle = <K extends keyof Element["style"]>(property: K, value: Element["style"][K]) => {
    if (!selectedElement || selectedElement.type !== "text") return

    onUpdateElement({
      ...selectedElement,
      style: {
        ...selectedElement.style,
        [property]: value,
      },
    })
  }

  const renderTextControls = () => {
    if (!selectedElement || selectedElement.type !== "text") {
      return null
    }

    return (
      <div className="flex items-center space-x-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-24">
              {selectedElement.style.fontSizePt ?? 18}pt
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72].map((size) => (
              <DropdownMenuItem key={size} onClick={() => updateTextStyle("fontSizePt", size)}>
                {size}pt
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          className={cn(selectedElement.style.fontWeight === "bold" && "bg-muted")}
          onClick={() => updateTextStyle("fontWeight", selectedElement.style.fontWeight === "bold" ? "normal" : "bold")}
        >
          <Bold className="h-4 w-4" />
        </Button>

        <div className="flex border rounded-md">
          <Button
            variant="ghost"
            size="sm"
            className={cn(selectedElement.style.textAlign === "left" && "bg-muted")}
            onClick={() => updateTextStyle("textAlign", "left")}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(selectedElement.style.textAlign === "center" && "bg-muted")}
            onClick={() => updateTextStyle("textAlign", "center")}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(selectedElement.style.textAlign === "right" && "bg-muted")}
            onClick={() => updateTextStyle("textAlign", "right")}
          >
            <AlignRight className="h-4 w-4" />
          </Button>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-20 justify-start gap-2">
              <span
                className="inline-block h-4 w-4 rounded border"
                style={{ backgroundColor: selectedElement.style.color || "#000000" }}
              />
              Цвет
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-3">
            <div className="grid grid-cols-8 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    "h-6 w-6 rounded border transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary",
                    (selectedElement.style.color || "#000000").toLowerCase() === color.toLowerCase() && "ring-2 ring-primary",
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => updateTextStyle("color", color)}
                  aria-label={`Выбрать цвет ${color}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={selectedElement.style.color || "#000000"}
                onChange={(e) => updateTextStyle("color", e.target.value)}
              />
              <Input
                type="color"
                value={selectedElement.style.color || "#000000"}
                onChange={(e) => updateTextStyle("color", e.target.value)}
                className="h-10 w-12 p-1"
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  return (
    <div className="border-b bg-background p-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <div className="flex items-center mr-2 space-x-1">
            <Button variant="outline" size="icon" className="border" onClick={onUndo} disabled={!canUndo} aria-label="Undo">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="border" onClick={onRedo} disabled={!canRedo} aria-label="Redo">
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
          <TitleEditor title={title} onTitleChange={onTitleChange} />
          <Button variant="outline" size="sm" className="border" onClick={onSaveProject} disabled={isSavingProject}>
            <Save className="h-4 w-4 mr-2" />
            {isSavingProject ? "Saving…" : "Сохранить"}
          </Button>
          <Button variant="outline" size="sm" className="ml-2 border" onClick={() => {
            window.location.href = "https://www.presentonika.ru/cabinet"
          }}>
            Кабинет
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="border"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {showAdminImportTools ? (
            <>
              <ImportZipDialog importOutZipFromArrayBuffer={importOutZipFromArrayBuffer} hasUnsavedChanges={hasUnsavedChanges} />
              <ImportPptxDialog importOutZipFromArrayBuffer={importOutZipFromArrayBuffer} hasUnsavedChanges={hasUnsavedChanges} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="border" disabled={isExportingOutZip || isExportingLayout}>
                    <Download className="mr-2 h-4 w-4" />
                    Export out.zip
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onExportOutZip} disabled={!onExportOutZip || isExportingOutZip || isExportingLayout}>
                    {isExportingOutZip ? "Экспортируем презентацию…" : "Export current presentation"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onExportCurrentSlideAsLayout}
                    disabled={!onExportCurrentSlideAsLayout || isExportingOutZip || isExportingLayout}
                  >
                    {isExportingLayout ? "Экспортируем layout…" : "Export current slide as layout"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Добавить элемент
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onAddText}>
              <Type className="h-4 w-4 mr-2" />
              Текст
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddShape("rectangle")}>
              <Square className="h-4 w-4 mr-2" />
              Фигура
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {renderTextControls()}
      </div>
    </div>
  )
}
