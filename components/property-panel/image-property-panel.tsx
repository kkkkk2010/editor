"use client"

import type { Element } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import ImageUploadDialog from "@/components/image-upload-dialog"
import { Image as ImageIcon } from "lucide-react"

interface ImagePropertyPanelProps {
  element: Element
  onUpdateElement: (element: Element) => void
  onReplaceImage?: (imageUrl: string, file?: File) => void
}

export default function ImagePropertyPanel({ element, onUpdateElement, onReplaceImage }: ImagePropertyPanelProps) {
  const updateStyle = (property: string, value: any) => {
    onUpdateElement({
      ...element,
      style: {
        ...element.style,
        [property]: value,
      },
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Изображение</Label>
        <div className="mt-2">
          <ImageUploadDialog
            onImageSelect={(imageUrl, file) => {
              if (onReplaceImage) {
                onReplaceImage(imageUrl, file)
                return
              }
              onUpdateElement({
                ...element,
                content: imageUrl,
              })
            }}
            triggerLabel="Заменить изображение"
            triggerVariant="secondary"
            triggerSize="sm"
            triggerIcon={<ImageIcon className="h-4 w-4 mr-2" />}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="borderRadius">Скругление углов</Label>
        <div className="flex items-center mt-1 space-x-2">
          <Slider
            id="borderRadius"
            min={0}
            max={50}
            step={1}
            value={[element.style.borderRadius || 0]}
            onValueChange={(value) => updateStyle("borderRadius", value[0])}
            className="flex-1"
          />
          <Input
            type="number"
            value={element.style.borderRadius || 0}
            onChange={(e) => updateStyle("borderRadius", Number(e.target.value))}
            className="w-16"
            min={0}
            max={50}
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
            className="w-16"
            min={0}
            max={100}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="objectFit">Способ заполнения</Label>
        <Select value={element.style.objectFit || "cover"} onValueChange={(value) => updateStyle("objectFit", value)}>
          <SelectTrigger id="objectFit">
            <SelectValue placeholder="Выберите способ заполнения" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Обрезать (Cover)</SelectItem>
            <SelectItem value="contain">Вместить (Contain)</SelectItem>
            <SelectItem value="fill">Заполнить (Fill)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="filter">Эффекты фильтра</Label>
        <Select value={element.style.filter || "none"} onValueChange={(value) => updateStyle("filter", value)}>
          <SelectTrigger id="filter">
            <SelectValue placeholder="Выберите фильтр" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Нет</SelectItem>
            <SelectItem value="grayscale(100%)">Оттенки серого</SelectItem>
            <SelectItem value="sepia(100%)">Сепия</SelectItem>
            <SelectItem value="blur(2px)">Размытие</SelectItem>
            <SelectItem value="brightness(150%)">Яркость</SelectItem>
            <SelectItem value="contrast(200%)">Высокая контрастность</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
