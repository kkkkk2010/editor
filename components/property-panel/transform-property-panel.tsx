"use client"

import { useState } from "react"
import type { Element } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RotateCw, Zap } from "lucide-react"

interface TransformPropertyPanelProps {
  element: Element
  onUpdateElement: (element: Element) => void
}

export default function TransformPropertyPanel({ element, onUpdateElement }: TransformPropertyPanelProps) {
  const [animationType, setAnimationType] = useState(element.style.animationType || "none")

  const updateStyle = (property: string, value: any) => {
    onUpdateElement({
      ...element,
      style: {
        ...element.style,
        [property]: value,
      },
    })
  }

  const handleAnimationChange = (value: string) => {
    setAnimationType(value)

    // Update element's animation type
    updateStyle("animationType", value)

    // If animation is selected, enable animation
    if (value !== "none") {
      updateStyle("animation", true)
    } else {
      updateStyle("animation", false)
    }
  }

  return (
    <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium flex items-center">
            <RotateCw className="h-4 w-4 mr-2" />
            Вращение
          </Label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="rotation">Угол вращения</Label>
            <span className="text-sm text-muted-foreground">{element.style.rotation || 0}°</span>
          </div>
          <div className="flex items-center space-x-2">
            <Slider
              id="rotation"
              min={0}
              max={360}
              step={1}
              value={[element.style.rotation || 0]}
              onValueChange={(value) => updateStyle("rotation", value[0])}
              className="flex-1"
            />
            <Input
              type="number"
              value={element.style.rotation || 0}
              onChange={(e) => updateStyle("rotation", Number(e.target.value))}
              className="w-16"
              min={0}
              max={360}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium flex items-center">
            <Zap className="h-4 w-4 mr-2" />
            Анимация
          </Label>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="animationType">Тип анимации</Label>
            <Select value={animationType} onValueChange={handleAnimationChange}>
              <SelectTrigger id="animationType">
                <SelectValue placeholder="Выберите тип анимации" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без анимации</SelectItem>
                <SelectItem value="fade">Появление</SelectItem>
                <SelectItem value="slide">Скольжение</SelectItem>
                <SelectItem value="scale">Масштабирование</SelectItem>
                <SelectItem value="rotate">Вращение</SelectItem>
                <SelectItem value="bounce">Отскок</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {animationType !== "none" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="animationDuration">Длительность анимации (секунд)</Label>
                <div className="flex items-center space-x-2">
                  <Slider
                    id="animationDuration"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={[element.style.animationDuration || 0.5]}
                    onValueChange={(value) => updateStyle("animationDuration", value[0])}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={element.style.animationDuration || 0.5}
                    onChange={(e) => updateStyle("animationDuration", Number(e.target.value))}
                    className="w-16"
                    min={0.1}
                    max={5}
                    step={0.1}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="animationDelay">Задержка анимации (секунд)</Label>
                <div className="flex items-center space-x-2">
                  <Slider
                    id="animationDelay"
                    min={0}
                    max={5}
                    step={0.1}
                    value={[element.style.animationDelay || 0]}
                    onValueChange={(value) => updateStyle("animationDelay", value[0])}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={element.style.animationDelay || 0}
                    onChange={(e) => updateStyle("animationDelay", Number(e.target.value))}
                    className="w-16"
                    min={0}
                    max={5}
                    step={0.1}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="animationLoop">Зациклить анимацию</Label>
                <Switch
                  id="animationLoop"
                  checked={element.style.animationLoop || false}
                  onCheckedChange={(checked) => updateStyle("animationLoop", checked)}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}