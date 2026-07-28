"use client"

import React from "react"
import type { Element } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  CloudUpload,
  Download,
  Moon,
  Plus,
  Redo2,
  Save,
  Square,
  Sun,
  Type,
  Undo2,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import TitleEditor from "./title-editor"
import ImportZipDialog from "@/components/import-zip-dialog"
import ImportPptxDialog from "@/components/import-pptx-dialog"
import PresentonikaBrand from "@/components/presentonika-brand"
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

const PRESET_COLORS = [
  "#000000", "#111827", "#374151", "#6b7280", "#ffffff", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#7c2d12", "#14532d", "#1e3a8a",
]

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

  React.useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"

  const updateTextStyle = <K extends keyof Element["style"]>(property: K, value: Element["style"][K]) => {
    if (!selectedElement || selectedElement.type !== "text") return
    onUpdateElement({
      ...selectedElement,
      style: { ...selectedElement.style, [property]: value },
    })
  }

  const renderTextControls = () => {
    if (!selectedElement || selectedElement.type !== "text") {
      return <span className="hidden text-xs text-muted-foreground xl:inline">Выберите текст на слайде, чтобы настроить его</span>
    }

    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden text-xs font-semibold text-muted-foreground xl:inline">Текст</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-[78px] justify-between" title="Размер шрифта">
              {selectedElement.style.fontSizePt ?? 18} pt
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72].map((size) => (
              <DropdownMenuItem key={size} onClick={() => updateTextStyle("fontSizePt", size)}>
                {size} pt
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex h-9 items-center rounded-md border bg-card p-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", selectedElement.style.fontWeight === "bold" && "bg-accent text-accent-foreground")}
            onClick={() => updateTextStyle("fontWeight", selectedElement.style.fontWeight === "bold" ? "normal" : "bold")}
            title="Полужирный"
            aria-label="Полужирный"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <span className="mx-0.5 h-5 w-px bg-border" />
          {([
            ["left", AlignLeft, "По левому краю"],
            ["center", AlignCenter, "По центру"],
            ["right", AlignRight, "По правому краю"],
          ] as const).map(([alignment, Icon, label]) => (
            <Button
              key={alignment}
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", selectedElement.style.textAlign === alignment && "bg-accent text-accent-foreground")}
              onClick={() => updateTextStyle("textAlign", alignment)}
              title={label}
              aria-label={label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9" title="Цвет текста" aria-label="Цвет текста">
              <span
                className="h-4 w-4 rounded-sm border border-black/15"
                style={{ backgroundColor: selectedElement.style.color || "#000000" }}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-3">
            <div className="grid grid-cols-8 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    "h-6 w-6 rounded-sm border transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary",
                    (selectedElement.style.color || "#000000").toLowerCase() === color.toLowerCase() && "ring-2 ring-primary",
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => updateTextStyle("color", color)}
                  aria-label={`Выбрать цвет ${color}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input value={selectedElement.style.color || "#000000"} onChange={(event) => updateTextStyle("color", event.target.value)} />
              <Input
                type="color"
                value={selectedElement.style.color || "#000000"}
                onChange={(event) => updateTextStyle("color", event.target.value)}
                className="h-10 w-12 p-1"
                aria-label="Выбрать произвольный цвет"
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  const saveStatus = isSavingProject ? "Сохраняем" : hasUnsavedChanges ? "Есть изменения" : "Сохранено"

  return (
    <header className="shrink-0 border-b bg-card">
      <div className="flex h-16 items-stretch">
        <div className="flex w-60 shrink-0 items-center border-r px-5">
          <PresentonikaBrand />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => { window.location.href = "https://www.presentonika.ru/cabinet" }}
            title="Вернуться в кабинет"
            aria-label="Вернуться в кабинет"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <TitleEditor title={title} onTitleChange={onTitleChange} />
            <div className={cn("mt-0.5 flex items-center gap-1.5 text-[11px]", hasUnsavedChanges ? "text-amber-600" : "text-emerald-700 dark:text-emerald-400")}>
              {isSavingProject ? <CloudUpload className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              <span>{saveStatus}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 rounded-md border bg-background/60 p-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUndo} disabled={!canUndo} title="Отменить" aria-label="Undo">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRedo} disabled={!canRedo} title="Повторить" aria-label="Redo">
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          <Button size="sm" className="h-9 px-4" onClick={onSaveProject} disabled={isSavingProject}>
            <Save className="h-4 w-4" />
            {isSavingProject ? "Сохраняем" : "Сохранить"}
          </Button>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Светлая тема" : "Тёмная тема"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex h-12 items-stretch border-t">
        <div className="flex w-60 shrink-0 items-center border-r px-5 text-xs font-bold uppercase text-muted-foreground">
          Редактор слайдов
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto px-4 presentonika-scrollbar">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 shrink-0">
                <Plus className="h-4 w-4 text-primary" />
                Добавить
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={onAddText}>
                <Type className="mr-2 h-4 w-4" />
                Текст
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddShape("rectangle")}>
                <Square className="mr-2 h-4 w-4" />
                Фигура
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="h-6 w-px shrink-0 bg-border" />
          {renderTextControls()}

          {showAdminImportTools ? (
            <div className="ml-auto flex shrink-0 items-center gap-2 border-l pl-3">
              <ImportZipDialog importOutZipFromArrayBuffer={importOutZipFromArrayBuffer} hasUnsavedChanges={hasUnsavedChanges} />
              <ImportPptxDialog importOutZipFromArrayBuffer={importOutZipFromArrayBuffer} hasUnsavedChanges={hasUnsavedChanges} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9" disabled={isExportingOutZip || isExportingLayout}>
                    <Download className="h-4 w-4" />
                    Export out.zip
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onExportOutZip} disabled={!onExportOutZip || isExportingOutZip || isExportingLayout}>
                    {isExportingOutZip ? "Экспортируем презентацию…" : "Export current presentation"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onExportCurrentSlideAsLayout} disabled={!onExportCurrentSlideAsLayout || isExportingOutZip || isExportingLayout}>
                    {isExportingLayout ? "Экспортируем layout…" : "Export current slide as layout"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
