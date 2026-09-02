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
import { buildImageSearchContext } from "@/src/lib/images/searchContext"

interface ImagePropertyPanelProps {
  element: Element
  currentSlide?: Slide
  currentSlideIndex?: number
  selectedElementIndex?: number | null
  imagePlan?: ImagePlan | null
  onUpdateElement: (element: Element) => void
  onReplaceImage?: (imageUrl: string, file?: File) => void
  onInsertImageFromSearch?: (payload: {
    elementId: string
    currentContent: string
    srcPath?: string
    searchMeta: {
      query: string
      negative: string[]
      kind: string
      aspect: string
    }
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
  projectMeta?: {
    topic?: string
    language?: string
  }
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
  onInsertImageFromSearch,
  onResetPlaceholderImage,
  hasPlaceholderReplacement,
  projectMeta,
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

  const elementIndex = useMemo(() => {
    if (typeof selectedElementIndex === "number" && selectedElementIndex >= 0) {
      return selectedElementIndex
    }
    return currentSlide?.elements.findIndex((item) => item.id === element.id) ?? -1
  }, [selectedElementIndex, currentSlide, element.id])

  const searchContext = useMemo(
    () =>
      buildImageSearchContext({
        selectedElement: element,
        slideIndex: typeof currentSlideIndex === "number" ? currentSlideIndex : 0,
        elementIndex,
        slide: currentSlide,
        projectMeta,
        imagePlan,
      }),
    [element, currentSlideIndex, elementIndex, currentSlide, projectMeta, imagePlan],
  )

  const slot = useMemo(() => {
    if (!imagePlan || typeof currentSlideIndex !== "number" || elementIndex < 0) return null
    return (
      imagePlan.slots.find((s) => s.elementId && s.elementId === element.id) ??
      imagePlan.slots.find((s) => s.slide === currentSlideIndex + 1 && s.element === elementIndex) ??
      null
    )
  }, [imagePlan, currentSlideIndex, elementIndex, element.id])

  useEffect(() => {
    setActiveTab("search")
    setSearchQuery(searchContext.query)
    setResults([])
    setSelectedResultId(null)
    setInsertStatus(hasPlaceholderReplacement ? "done" : "idle")
    setRightsChecked(false)
  }, [element.id, searchContext.query, hasPlaceholderReplacement])

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    onUpdateElement({
      ...element,
      meta: {
        ...element.meta,
        search: {
          ...(element.meta?.search ?? {}),
          query: searchQuery.trim(),
          negative: searchContext.negative,
          kind: searchContext.kind,
          aspect: searchContext.aspect,
          updatedAt: new Date().toISOString(),
        },
      },
    })

    setIsSearching(true)
    try {
      const response = await fetch("/api/images/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery.trim(),
          count: searchContext.suggestedCount,
          aspect: searchContext.aspect === "any" ? undefined : searchContext.aspect,
        }),
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
    if (!selectedResult || !rightsChecked || !onInsertImageFromSearch) {
      return
    }
    setIsInserting(true)
    try {
      await onInsertImageFromSearch({
        elementId: element.id,
        currentContent: element.content,
        srcPath,
        searchMeta: {
          query: searchQuery.trim(),
          negative: searchContext.negative,
          kind: searchContext.kind,
          aspect: searchContext.aspect,
        },
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
    <div className="space-y-3 text-xs [&_input]:h-8 [&_input]:text-xs [&_label]:text-xs [&_label]:font-semibold [&_[role=combobox]]:h-8 [&_[role=combobox]]:text-xs">
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
            triggerIcon={<ImageIcon className="h-4 w-4" />}
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
            className="w-14"
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
            className="w-14"
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

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value === "search" ? "search" : "edit")}
      className="w-full min-w-0"
    >
      <TabsList className="grid h-8 w-full grid-cols-2">
        <TabsTrigger value="edit" className="h-7 w-full min-w-0 px-2 text-xs">Свойства</TabsTrigger>
        <TabsTrigger value="search" className="h-7 w-full min-w-0 px-2 text-xs">Подобрать</TabsTrigger>
      </TabsList>

      <TabsContent value="edit" className="mt-3">
        {renderEditPanel()}
      </TabsContent>

      <TabsContent value="search" className="mt-3 w-full min-w-0 space-y-3 text-xs [&_input]:h-8 [&_input]:text-xs [&_label]:text-xs">
        <div>
          <h4 className="break-all text-xs font-semibold">
            Подбор для изображения {slot?.slotId ? `(${slot.slotId})` : ""}
          </h4>
          <p className="mt-1 break-words text-xs text-muted-foreground">{searchContext.hint}</p>
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
          <Label htmlFor="rights-check" className="text-xs font-normal">
            Я проверил права
          </Label>
        </div>

        <Button size="sm" className="h-8 text-xs" onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
          {isSearching ? "Поиск..." : "Искать"}
        </Button>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedResultId(item.id)}
              className={`rounded border p-1 text-left ${selectedResultId === item.id ? "ring-2 ring-primary" : ""}`}
            >
              <img src={item.thumbUrl} alt={item.id} className="h-20 w-full rounded object-cover" />
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-8 text-xs" variant="outline" disabled={!selectedResult} onClick={() => {
            if (!selectedResult) return
            window.open(selectedResult.pageUrl, "_blank", "noopener,noreferrer")
          }}>
            Открыть источник
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleInsert} disabled={!selectedResult || !rightsChecked || isInserting}>
            {isInserting ? "Вставка..." : "Вставить"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
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
