"use client"

import type { Element } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ShapePropertyPanelProps {
  element: Element
  onUpdateElement: (element: Element) => void
}

export default function ShapePropertyPanel({ element, onUpdateElement }: ShapePropertyPanelProps) {
  const updateStyle = <K extends keyof Element["style"]>(property: K, value: Element["style"][K]) => {
    onUpdateElement({
      ...element,
      style: {
        ...element.style,
        [property]: value,
      },
    })
  }

  const updateContent = (value: string) => {
    onUpdateElement({
      ...element,
      content: value,
    })
  }

  return (
    <div className="space-y-3 text-xs [&_input]:h-8 [&_input]:text-xs [&_label]:text-xs [&_label]:font-semibold [&_[role=combobox]]:h-8 [&_[role=combobox]]:text-xs">
      <div>
        <Label htmlFor="shapeType">Тип фигуры</Label>
        <Select value={element.content} onValueChange={updateContent}>
          <SelectTrigger id="shapeType">
            <SelectValue placeholder="Выберите фигуру" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rectangle">Прямоугольник</SelectItem>
            <SelectItem value="circle">Круг</SelectItem>
            <SelectItem value="triangle">Треугольник</SelectItem>
            <SelectItem value="line">Линия</SelectItem>
            <SelectItem value="arrow">Стрелка</SelectItem>
            <SelectItem value="star">Звезда</SelectItem>
            <SelectItem value="hexagon">Шестиугольник</SelectItem>
            <SelectItem value="pentagon">Пятиугольник</SelectItem>
            <SelectItem value="cloud">Облако</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="fill">Цвет заливки</Label>
        <div className="flex items-center mt-1 space-x-2">
          <Input
            id="fill"
            type="color"
            value={element.style.fill || "#ffffff"}
            onChange={(e) => updateStyle("fill", e.target.value)}
            className="h-8 w-9 p-1"
          />
          <Input
            type="text"
            value={element.style.fill || "#ffffff"}
            onChange={(e) => updateStyle("fill", e.target.value)}
            className="flex-1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="stroke">Цвет границы</Label>
        <div className="flex items-center mt-1 space-x-2">
          <Input
            id="stroke"
            type="color"
            value={element.style.stroke || "#000000"}
            onChange={(e) => updateStyle("stroke", e.target.value)}
            className="h-8 w-9 p-1"
          />
          <Input
            type="text"
            value={element.style.stroke || "#000000"}
            onChange={(e) => updateStyle("stroke", e.target.value)}
            className="flex-1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="strokeWidth">Толщина границы</Label>
        <div className="flex items-center mt-1 space-x-2">
          <Slider
            id="strokeWidth"
            min={0}
            max={20}
            step={1}
            value={[element.style.strokeWidth || 1]}
            onValueChange={(value) => updateStyle("strokeWidth", value[0])}
            className="flex-1"
          />
          <Input
            type="number"
            value={element.style.strokeWidth || 1}
            onChange={(e) => updateStyle("strokeWidth", Number(e.target.value))}
            className="w-14"
            min={0}
            max={20}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="opacity">Прозрачность</Label>
        <div className="flex items-center mt-1 space-x-2">
          <Slider
            id="opacity"
            min={0}
            max={1}
            step={0.01}
            value={[element.style.opacity || 1]}
            onValueChange={(value) => updateStyle("opacity", value[0])}
            className="flex-1"
          />
          <Input
            type="number"
            value={Math.round((element.style.opacity || 1) * 100)}
            onChange={(e) => updateStyle("opacity", Number(e.target.value) / 100)}
            className="w-14"
            min={0}
            max={100}
          />
        </div>
      </div>
    </div>
  )
}
