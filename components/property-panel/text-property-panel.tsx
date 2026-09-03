"use client"

import { useMemo, useState } from "react"
import type { Element } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { normalizeFontFamily } from "@/lib/text-style"
import { MAX_TEXT_FONT_SIZE_PT, MIN_TEXT_FONT_SIZE_PT } from "@/lib/editor-constants"

interface TextPropertyPanelProps {
  element: Element
  onUpdateElement: (element: Element) => void
}

const baseFontFamilies = ["Manrope", "Inter", "Arial", "Georgia", "Times New Roman", "Verdana", "Courier New"]
const seenFontFamilies = new Set(baseFontFamilies)
const PRESET_COLORS = [
  "#000000",
  "#111827",
  "#374151",
  "#6b7280",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#7c2d12",
  "#14532d",
  "#1e3a8a",
]

export default function TextPropertyPanel({
  element,
  onUpdateElement,
}: TextPropertyPanelProps) {
  const [colorDraft, setColorDraft] = useState(element.style.color || "#000000")

  const updateStyle = <K extends keyof Element["style"]>(property: K, value: Element["style"][K]) => {
    onUpdateElement({
      ...element,
      style: {
        ...element.style,
        [property]: value,
      },
    })
  }

  const currentFont = element.style.fontFamily ?? "Inter"
  const normalizedFontFamily = normalizeFontFamily(currentFont)
  if (currentFont.trim()) {
    seenFontFamilies.add(currentFont)
  }
  if (normalizedFontFamily?.trim()) {
    seenFontFamilies.add(normalizedFontFamily)
  }
  const availableFontFamilies = Array.from(seenFontFamilies).filter(
    (font): font is string => typeof font === "string" && font.trim().length > 0,
  )
  const selectedFontSizePt = element.style.fontSizePt ?? 18

  const clampFontSize = (value: number) => {
    const clamped = Math.min(MAX_TEXT_FONT_SIZE_PT, Math.max(MIN_TEXT_FONT_SIZE_PT, value))
    return Math.round(clamped * 2) / 2
  }

  const currentColor = useMemo(() => element.style.color || "#000000", [element.style.color])

  const applyColor = (nextColor: string) => {
    const normalized = nextColor.trim()
    if (!normalized) return
    updateStyle("color", normalized)
    setColorDraft(normalized)
  }

  return (
    <div className="space-y-3 text-xs [&_input]:h-8 [&_input]:text-xs [&_label]:text-xs [&_label]:font-semibold [&_[role=combobox]]:h-8 [&_[role=combobox]]:text-xs">
      <div>
        <Label htmlFor="fontFamily">Шрифт</Label>
        <Select value={currentFont} onValueChange={(value) => updateStyle("fontFamily", value)}>
          <SelectTrigger id="fontFamily" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableFontFamilies.map((fontFamily) => (
              <SelectItem key={fontFamily} value={fontFamily}>
                {fontFamily}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="fontSize">Размер шрифта (pt)</Label>
        <div className="flex items-center mt-1 space-x-2">
          <Slider
            id="fontSize"
            min={MIN_TEXT_FONT_SIZE_PT}
            max={MAX_TEXT_FONT_SIZE_PT}
            step={0.5}
            value={[selectedFontSizePt]}
            onValueChange={(value) => updateStyle("fontSizePt", clampFontSize(value[0]))}
            className="flex-1"
          />
          <Input
            type="number"
            value={selectedFontSizePt}
            onChange={(e) => updateStyle("fontSizePt", clampFontSize(Number(e.target.value)))}
            className="w-14"
            min={MIN_TEXT_FONT_SIZE_PT}
            max={MAX_TEXT_FONT_SIZE_PT}
            step={0.5}
          />
        </div>
      </div>

      <div>
        <Label>Стиль шрифта</Label>
        <div className="flex mt-1 space-x-1">
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 w-8 p-0", element.style.fontWeight === "bold" && "bg-muted")}
            onClick={() => updateStyle("fontWeight", element.style.fontWeight === "bold" ? "normal" : "bold")}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 w-8 p-0", element.style.fontStyle === "italic" && "bg-muted")}
            onClick={() => updateStyle("fontStyle", element.style.fontStyle === "italic" ? "normal" : "italic")}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 w-8 p-0", element.style.textDecoration === "underline" && "bg-muted")}
            onClick={() =>
              updateStyle("textDecoration", element.style.textDecoration === "underline" ? "none" : "underline")
            }
          >
            <Underline className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div>
        <Label>Выравнивание</Label>
        <div className="flex mt-1 space-x-1">
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 w-8 p-0", element.style.textAlign === "left" && "bg-muted")}
            onClick={() => updateStyle("textAlign", "left")}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 w-8 p-0", element.style.textAlign === "center" && "bg-muted")}
            onClick={() => updateStyle("textAlign", "center")}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-8 w-8 p-0", element.style.textAlign === "right" && "bg-muted")}
            onClick={() => updateStyle("textAlign", "right")}
          >
            <AlignRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="color">Цвет текста</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="mt-1 h-8 w-full justify-start gap-2 text-xs">
              <span className="inline-block h-4 w-4 rounded border" style={{ backgroundColor: currentColor }} />
              <span>{currentColor}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-3" align="start">
            <div className="grid grid-cols-8 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    "h-6 w-6 rounded border transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary",
                    currentColor.toLowerCase() === color.toLowerCase() && "ring-2 ring-primary",
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => applyColor(color)}
                  aria-label={`Выбрать цвет ${color}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="color"
                type="text"
                value={colorDraft}
                onChange={(e) => setColorDraft(e.target.value)}
                onBlur={() => applyColor(colorDraft)}
              />
              <Input
                type="color"
                value={currentColor}
                onChange={(e) => applyColor(e.target.value)}
                className="h-8 w-10 p-1"
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div>
        <Label htmlFor="lineHeight">Межстрочный интервал</Label>
        <div className="flex items-center mt-1 space-x-2">
          <Slider
            id="lineHeight"
            min={1}
            max={3}
            step={0.1}
            value={[element.style.lineHeight ?? 1]}
            onValueChange={(value) => updateStyle("lineHeight", value[0])}
            className="flex-1"
          />
          <Input
            type="number"
            value={element.style.lineHeight ?? 1}
            onChange={(e) => updateStyle("lineHeight", Number(e.target.value))}
            className="w-14"
            min={1}
            max={3}
            step={0.1}
          />
        </div>
      </div>
    </div>
  )
}
