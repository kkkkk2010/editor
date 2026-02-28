"use client"

import { useEffect, useMemo, useState } from "react"
import type { Element, ObjectFitMode } from "@/lib/types"
import type { ImagePlan } from "@/src/lib/import/imagePlan"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import ImageUploadDialog from "@/components/image-upload-dialog"
import { Image as ImageIcon } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import type { Slide } from "@/lib/types"

interface ImagePropertyPanelProps {
  element: Element
  currentSlide?: Slide
  currentSlideIndex?: number
  selectedElementIndex?: number | null
  imagePlan?: ImagePlan | null
  onUpdateElement: (element: Element) => void
  onReplaceImage?: (imageUrl: string, file?: File) => void
  onInsertPlaceholderImage?: (payload: {
    srcPath: string
    currentContent: string
    slot: { slotId: string; slide: number; element: number }
    selection: {
      pageUrl: string
      imageUrl: string
      licenseLabel?: string
      licenseUrl?: string
      source?: string
    }
  }) => Promise<void>
  onResetPlaceholderImage?: (payload: { srcPath: string }) => void
  hasPlaceholderReplacement?: boolean
}

type SearchResult = {
  id: string
  thumbUrl: string
  pageUrl: string
  imageUrl: string
  width?: number
  height?: number
  source?: string
  licenseLabel?: string
  licenseUrl?: string
}

export default function ImagePropertyPanel({
  element,
  currentSlide,
  currentSlideIndex,
  selectedElementIndex,
  imagePlan,
  onUpdateElement,
  onReplaceImage,
  onInsertPlaceholderImage,
  onResetPlaceholderImage,
  hasPlaceholderReplacement,
}: ImagePropertyPanelProps) {
  const FITS = ["cover", "contain", "fill", "none", "scale-down"] as const
  type Fit = (typeof FITS)[number]
  const isFit = (value: string): value is Fit =>
    (FITS as readonly string[]).includes(value)

  const [activeTab, setActiveTab] = useState<"edit" | "search">("edit")
  const [searchQuery, setSearchQuery] = useState("")
  const [rightsChecked, setRightsChecked] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isInserting, setIsInserting] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [insertStatus, setInsertStatus] = useState<"idle" | "done">("idle")

  const slot = useMemo(() => {
    if (!imagePlan || typeof currentSlideIndex !== "number") return null
    let elementIndex = selectedElementIndex ?? null
    if (elementIndex === null || elementIndex < 0) {
      elementIndex = currentSlide?.elements.findIndex((item) => item === element) ?? -1
    }
    if (elementIndex < 0) return null
    return imagePlan.slots.find((s) => s.slide === currentSlideIndex + 1 && s.element === elementIndex) ?? null
  }, [imagePlan, currentSlideIndex, selectedElementIndex, currentSlide, element])

  useEffect(() => {
    if (!slot) {
      setActiveTab("edit")
      setSearchQuery("")
      setResults([])
      setSelectedResultId(null)
      setInsertStatus("idle")
      setRightsChecked(false)
      return
    }
    setSearchQuery(slot.query)
    setResults([])
    setSelectedResultId(null)
    setInsertStatus(hasPlaceholderReplacement ? "done" : "idle")
    setRightsChecked(false)
    setActiveTab("search")
  }, [slot?.slotId, hasPlaceholderReplacement])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }
    setIsSearching(true)
    try {
      const response = await fetch("/api/images/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim(), count: 6 }),
      })
      if (!response.ok) {
        setResults([])
        return
      }
      const payload = (await response.json()) as { results?: SearchResult[] }
      setResults(Array.isArray(payload.results) ? payload.results : [])
      setSelectedResultId(null)
    } finally {
      setIsSearching(false)
    }
  }

  const selectedResult = results.find((result) => result.id === selectedResultId) ?? null
  const srcPath = element.assetPath

  const handleInsert = async () => {
    if (!slot || !selectedResult || !rightsChecked || !srcPath || !onInsertPlaceholderImage) {
      return
    }
    setIsInserting(true)
    try {
      await onInsertPlaceholderImage({
        srcPath,
        currentContent: element.content,
        slot: { slotId: slot.slotId, slide: slot.slide, element: slot.element },
        selection: {
          pageUrl: selectedResult.pageUrl,
          imageUrl: selectedResult.imageUrl,
          licenseLabel: selectedResult.licenseLabel,
          licenseUrl: selectedResult.licenseUrl,
          source: selectedResult.source,
        },
      })
      setInsertStatus("done")
    } finally {
      setIsInserting(false)
    }
  }

  const updateStyle = <K extends keyof Element["style"]>(property: K, value: Element["style"][K]) => {
    onUpdateElement({
      ...element,
      style: {
        ...element.style,
        [property]: value,
      },
    })
  }

  const renderEditPanel = () => (
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
        <Select
          value={(element.style.objectFit ?? "cover") as Fit}
          onValueChange={(value) => {
            const next: ObjectFitMode = isFit(value) ? value : "cover"
            updateStyle("objectFit", next)
          }}
        >
          <SelectTrigger id="objectFit">
            <SelectValue placeholder="Выберите способ заполнения" />
          </SelectTrigger>
          <SelectContent>
            {FITS.map((fit) => (
              <SelectItem key={fit} value={fit}>
                {fit === "cover" && "Обрезать (Cover)"}
                {fit === "contain" && "Вместить (Contain)"}
                {fit === "fill" && "Заполнить (Fill)"}
                {fit === "none" && "Без масштабирования (None)"}
                {fit === "scale-down" && "Уменьшить (Scale-down)"}
              </SelectItem>
            ))}
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

  if (!slot) {
    return renderEditPanel()
  }

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value === "search" ? "search" : "edit")}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="edit">Свойства</TabsTrigger>
        <TabsTrigger value="search">Подобрать</TabsTrigger>
      </TabsList>

      <TabsContent value="edit" className="mt-4">
        {renderEditPanel()}
      </TabsContent>

      <TabsContent value="search" className="mt-4 space-y-4">
        <div>
          <h4 className="text-sm font-medium">Изображение для: {slot.slotId}</h4>
          {slot.hint ? <p className="text-xs text-muted-foreground mt-1">{slot.hint}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="placeholder-query">Поисковый запрос</Label>
          <Input
            id="placeholder-query"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Введите запрос"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="rights-check"
            checked={rightsChecked}
            onCheckedChange={(value) => setRightsChecked(value === true)}
          />
          <Label htmlFor="rights-check" className="text-sm font-normal">
            Я проверил права
          </Label>
        </div>

        <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
          {isSearching ? "Поиск..." : "Искать"}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedResultId(item.id)}
              className={`rounded border p-1 text-left ${selectedResultId === item.id ? "ring-2 ring-primary" : ""}`}
            >
              <img src={item.thumbUrl} alt={item.id} className="h-24 w-full object-cover rounded" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={!selectedResult} onClick={() => {
            if (!selectedResult) return
            window.open(selectedResult.pageUrl, "_blank", "noopener,noreferrer")
          }}>
            Открыть источник
          </Button>
          <Button onClick={handleInsert} disabled={!selectedResult || !rightsChecked || !srcPath || isInserting}>
            {isInserting ? "Вставка..." : "Вставить"}
          </Button>
          <Button
            variant="ghost"
            disabled={!srcPath || !hasPlaceholderReplacement}
            onClick={() => {
              if (!srcPath) return
              onResetPlaceholderImage?.({ srcPath })
              setInsertStatus("idle")
            }}
          >
            Сбросить
          </Button>
        </div>

        {insertStatus === "done" ? <p className="text-xs text-emerald-600">Вставлено</p> : null}

        <p className="text-xs text-muted-foreground">Сервис показывает варианты, вставка позже</p>
      </TabsContent>
    </Tabs>
  )
}
