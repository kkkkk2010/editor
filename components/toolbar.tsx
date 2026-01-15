"use client"

import { useState } from "react"
import type { Element } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Bold,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Square,
  Table,
  BarChart,
  FileSymlink,
  Save,
  Plus,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import TitleEditor from "./title-editor"
import ImportZipDialog from "@/components/import-zip-dialog"
import type { ImportResult } from "@/src/lib/import/importerDoc"

interface ToolbarProps {
  selectedElement: Element | null
  onUpdateElement: (element: Element) => void
  onAddShape: (type: string) => void
  onAddTable: (rows: number, cols: number) => void
  onAddChart: (type: string) => void
  onAddIcon: (iconName: string) => void
  onAddText: () => void
  title: string
  onTitleChange: (title: string) => void
  onImportZip: (result: ImportResult, createdUrls: string[]) => void
}

export default function Toolbar({
  selectedElement,
  onUpdateElement,
  onAddShape,
  onAddTable,
  onAddChart,
  onAddIcon,
  onAddText,
  title,
  onTitleChange,
  onImportZip,
}: ToolbarProps) {
  const [activeTab, setActiveTab] = useState("text")

  const updateTextStyle = (property: string, value: any) => {
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
              {selectedElement.style.fontSize || 16}px
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {[12, 14, 16, 20, 24, 32, 40, 48, 56, 64, 72].map((size) => (
              <DropdownMenuItem key={size} onClick={() => updateTextStyle("fontSize", size)}>
                {size}px
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

        <input
          type="color"
          value={selectedElement.style.color || "#000000"}
          onChange={(e) => updateTextStyle("color", e.target.value)}
          className="w-10 h-8 p-0 border"
        />
      </div>
    )
  }

  return (
    <div className="border-b bg-background p-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <TitleEditor title={title} onTitleChange={onTitleChange} />
          <Button variant="ghost" size="sm">
            <Save className="h-4 w-4 mr-2" />
            Сохранить
          </Button>
        </div>
        <ImportZipDialog onImport={onImportZip} />
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
            <DropdownMenuItem onClick={() => onAddTable(3, 3)}>
              <Table className="h-4 w-4 mr-2" />
              Таблица
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {renderTextControls()}
      </div>
    </div>
  )
}
