"use client"

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
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { normalizeFontFamily } from "@/lib/text-style"

interface TextPropertyPanelProps {
  element: Element
  onUpdateElement: (element: Element) => void
}

export default function TextPropertyPanel({ element, onUpdateElement }: TextPropertyPanelProps) {
  const updateStyle = <K extends keyof Element["style"]>(property: K, value: Element["style"][K]) => {
    onUpdateElement({
      ...element,
      style: {
        ...element.style,
        [property]: value,
      },
    })
  }

  const fontFamilies = ["Times New Roman", "Arial", "Georgia", "Verdana", "Courier New"]
  const selectedFontFamily = element.style.fontFamily ?? "Times New Roman"
  const normalizedFontFamily = normalizeFontFamily(selectedFontFamily)
  const availableFontFamilies = Array.from(
    new Set([selectedFontFamily, normalizedFontFamily].filter(Boolean).concat(fontFamilies)),
  )
  const selectedFontSizePt = element.style.fontSizePt ?? 18

  const clampFontSize = (value: number) => {
    const clamped = Math.min(200, Math.max(6, value))
    return Math.round(clamped * 2) / 2
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="fontFamily">Шрифт</Label>
        <Select value={selectedFontFamily} onValueChange={(value) => updateStyle("fontFamily", value)}>
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
            min={6}
            max={200}
            step={0.5}
            value={[selectedFontSizePt]}
            onValueChange={(value) => updateStyle("fontSizePt", clampFontSize(value[0]))}
            className="flex-1"
          />
          <Input
            type="number"
            value={selectedFontSizePt}
            onChange={(e) => updateStyle("fontSizePt", clampFontSize(Number(e.target.value)))}
            className="w-16"
            min={6}
            max={200}
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
            className={cn(element.style.fontWeight === "bold" && "bg-muted")}
            onClick={() => updateStyle("fontWeight", element.style.fontWeight === "bold" ? "normal" : "bold")}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(element.style.fontStyle === "italic" && "bg-muted")}
            onClick={() => updateStyle("fontStyle", element.style.fontStyle === "italic" ? "normal" : "italic")}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(element.style.textDecoration === "underline" && "bg-muted")}
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
            className={cn(element.style.textAlign === "left" && "bg-muted")}
            onClick={() => updateStyle("textAlign", "left")}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(element.style.textAlign === "center" && "bg-muted")}
            onClick={() => updateStyle("textAlign", "center")}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(element.style.textAlign === "right" && "bg-muted")}
            onClick={() => updateStyle("textAlign", "right")}
          >
            <AlignRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="color">Цвет текста</Label>
        <div className="flex items-center mt-1 space-x-2">
          <Input
            id="color"
            type="color"
            value={element.style.color || "#000000"}
            onChange={(e) => updateStyle("color", e.target.value)}
            className="w-10 h-10 p-1"
          />
          <Input
            type="text"
            value={element.style.color || "#000000"}
            onChange={(e) => updateStyle("color", e.target.value)}
            className="flex-1"
          />
        </div>
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
            className="w-16"
            min={1}
            max={3}
            step={0.1}
          />
        </div>
      </div>
    </div>
  )
}
