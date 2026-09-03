"use client"

import { useEffect, useMemo, useState } from "react"
import type { Element, ObjectFitMode } from "@/lib/types"
import type { ImagePlan } from "@/src/lib/import/imagePlan"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import ImageUploadDialog from "@/components/image-upload-dialog"
import { Check, Image as ImageIcon, ShieldCheck } from "lucide-react"
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
      fallbackImageUrl?: string
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
  presentationId?: string | null
  saveToken?: string
  onPreviewImageFromSearch?: (payload: { elementId: string; previewUrl: string; fallbackUrl?: string }) => void
}

type SearchResult = {
  id: string
  thumbUrl: string
  pageUrl: string
  imageUrl: string
  width?: number
  height?: number
  sourceHost?: string
  sourceTitle?: string
  licenseLabel?: string
  licenseUrl?: string
}

type SearchUsage = {
  allowed: boolean
  requiresConfirmation: boolean
  charged: boolean
  cost: number
  quota: number
  used: number
  remaining: number
  pointsBalance: number
  plan: "basic" | "premium" | "internal"
  message?: string
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
  presentationId,
  saveToken,
  onPreviewImageFromSearch,
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
  const [searchError, setSearchError] = useState("")
  const [insertError, setInsertError] = useState("")
  const [searchUsage, setSearchUsage] = useState<SearchUsage | null>(
    (element.meta?.imageSearchUsage as SearchUsage | undefined) ?? null,
  )
  const [paidSearchPendingForQuery, setPaidSearchPendingForQuery] = useState<string | null>(null)

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
    setResults(Array.isArray(element.meta?.search?.results) ? element.meta.search.results : [])
    setSearchUsage((element.meta?.imageSearchUsage as SearchUsage | undefined) ?? null)
    setSelectedResultId(null)
    setRightsChecked(false)
    setSearchError("")
    setInsertError("")
    setPaidSearchPendingForQuery(null)
  }, [element.id, searchContext.query, element.meta?.search?.requestUsedAt, element.meta?.search?.results])

  useEffect(() => {
    setInsertStatus(hasPlaceholderReplacement ? "done" : "idle")
  }, [element.id, hasPlaceholderReplacement])

  const handleSearch = async () => {
    if (isSearching) return
    if (!presentationId || !saveToken) {
      setSearchError("Поиск доступен только в презентации, открытой из личного кабинета.")
      return
    }
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    setIsSearching(true)
    setSearchError("")
    try {
      const response = await fetch("/api/images/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-presentation-id": presentationId,
          "x-save-token": saveToken,
        },
        body: JSON.stringify({
          query: searchQuery.trim(),
          count: 8,
          placeholderKey: slot?.slotId || element.id,
          aspect: searchContext.aspect === "any" ? undefined : searchContext.aspect,
          negative: searchContext.negative,
          confirmTokenCharge: paidSearchPendingForQuery === searchQuery.trim(),
        }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string
          scope?: string
          usage?: SearchUsage
        } | null
        if (payload?.usage) setSearchUsage(payload.usage)
        if (response.status === 402 && payload?.usage?.requiresConfirmation) {
          setPaidSearchPendingForQuery(searchQuery.trim())
          setSearchError(`Бесплатный лимит исчерпан. Повторите поиск, чтобы списать ${payload.usage.cost || 1} балл.`)
          return
        }
        setPaidSearchPendingForQuery(null)
        setSearchError(
          payload?.message?.includes("Daily image search budget")
            ? "Дневной лимит поиска изображений исчерпан. Новые платные запросы заблокированы."
            : payload?.message?.includes("Presentation image search budget")
              ? "Лимит поиска изображений для этой презентации исчерпан."
              : response.status === 402
                ? payload?.usage?.pointsBalance === 0
                  ? "Бесплатный лимит исчерпан, а на балансе нет баллов для дополнительного поиска."
                  : payload?.message || "Не удалось подтвердить платный поиск."
                : response.status === 401
                  ? "Сессия поиска истекла. Откройте презентацию заново из личного кабинета."
                  : response.status === 429
                    ? "Слишком много запросов. Подождите минуту и повторите поиск."
            : payload?.message?.includes("credentials")
              ? "Поиск изображений пока не настроен."
              : "Не удалось получить изображения. Попробуйте ещё раз.",
        )
        return
      }
      const payload = (await response.json()) as { results?: SearchResult[]; usage?: SearchUsage }
      const nextResults = Array.isArray(payload.results) ? payload.results.slice(0, 8) : []
      const requestUsedAt = new Date().toISOString()
      setResults(nextResults)
      setSearchUsage(payload.usage ?? null)
      setPaidSearchPendingForQuery(null)
      setSelectedResultId(null)
      setRightsChecked(false)
      onUpdateElement({
        ...element,
        meta: {
          ...element.meta,
          imageSearchUsage: payload.usage,
          search: {
            ...(element.meta?.search ?? {}),
            query: searchQuery.trim(),
            negative: searchContext.negative,
            kind: searchContext.kind,
            aspect: searchContext.aspect,
            updatedAt: requestUsedAt,
            requestUsedAt,
            results: nextResults,
          },
        },
      })
      if (!nextResults.length) {
        setSearchError("По этому запросу ничего не найдено. Измените формулировку и попробуйте ещё раз.")
      }
    } catch {
      setResults([])
      setSearchError("Не удалось выполнить поиск. Проверьте соединение и повторите попытку.")
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
    setInsertError("")
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
          fallbackImageUrl: selectedResult.thumbUrl,
          licenseLabel: selectedResult.licenseLabel,
          licenseUrl: selectedResult.licenseUrl,
          source: selectedResult.sourceTitle || selectedResult.sourceHost,
        },
      })
      setInsertStatus("done")
    } catch (error) {
      setInsertError(error instanceof Error ? error.message : "Не удалось вставить изображение")
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
          <SelectTrigger id="objectFit" className="bg-card text-foreground data-[state=open]:border-primary/60 data-[state=open]:ring-2 data-[state=open]:ring-primary/20 [&>span]:text-foreground">
            <SelectValue placeholder="Выберите способ заполнения" />
          </SelectTrigger>
          <SelectContent>
            {FITS.map((fit) => (
              <SelectItem key={fit} value={fit} className="data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground">
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
          <SelectTrigger id="filter" className="bg-card text-foreground data-[state=open]:border-primary/60 data-[state=open]:ring-2 data-[state=open]:ring-primary/20 [&>span]:text-foreground">
            <SelectValue placeholder="Выберите фильтр" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground">Нет</SelectItem>
            <SelectItem value="grayscale(100%)" className="data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground">Оттенки серого</SelectItem>
            <SelectItem value="sepia(100%)" className="data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground">Сепия</SelectItem>
            <SelectItem value="blur(2px)" className="data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground">Размытие</SelectItem>
            <SelectItem value="brightness(150%)" className="data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground">Яркость</SelectItem>
            <SelectItem value="contrast(200%)" className="data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground">Высокая контрастность</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value === "search" ? "search" : "edit")}
      className="w-full min-w-0 max-w-full overflow-hidden"
    >
      <TabsList className="grid h-8 w-full min-w-0 grid-cols-2 overflow-hidden">
        <TabsTrigger value="edit" className="h-7 w-full min-w-0 overflow-hidden px-2 text-xs"><span className="truncate">Свойства</span></TabsTrigger>
        <TabsTrigger value="search" className="h-7 w-full min-w-0 overflow-hidden px-2 text-xs"><span className="truncate">Подобрать</span></TabsTrigger>
      </TabsList>

      <TabsContent value="edit" className="mt-3">
        {renderEditPanel()}
      </TabsContent>

      <TabsContent value="search" className="mt-3 w-full min-w-0 max-w-full space-y-3 overflow-x-hidden text-xs [&_input]:h-8 [&_input]:text-xs [&_label]:text-xs">
        <div className="w-full min-w-0 max-w-full overflow-hidden">
          <h4 className="max-w-full text-xs font-semibold leading-4">Подбор для изображения</h4>
          {slot?.slotId ? (
            <p className="max-w-full whitespace-normal break-words font-mono text-[10px] leading-4 text-muted-foreground [overflow-wrap:anywhere]" title={slot.slotId}>
              ({slot.slotId})
            </p>
          ) : null}
          <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Что должно быть на изображении</p>
          <p className="mt-1 max-w-full whitespace-normal break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">{searchContext.hint}</p>
        </div>

        <div className="min-w-0 max-w-full space-y-2">
          <Label htmlFor="placeholder-query">Поисковый запрос</Label>
          <Textarea
            id="placeholder-query"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setPaidSearchPendingForQuery(null)
              setSearchError("")
            }}
            placeholder="Введите запрос"
            className="min-h-[76px] w-full min-w-0 max-w-full resize-y text-xs leading-4"
          />
        </div>

        <Button size="sm" className="h-8 w-full max-w-full text-xs" onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
          {isSearching
            ? "Поиск..."
            : paidSearchPendingForQuery === searchQuery.trim()
              ? `Искать за ${searchUsage?.cost || 1} балл`
              : "Искать"}
        </Button>

        <p className="max-w-full whitespace-normal break-words rounded-md bg-muted/50 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">
          {searchUsage
            ? `${searchUsage.plan === "premium" ? "Премиум" : "Базовый"}: использовано ${searchUsage.used} из ${searchUsage.quota} поисков. После лимита — ${searchUsage.cost || 1} балл за поиск.${searchUsage.charged ? ` Списан ${searchUsage.cost || 1} балл.` : ""}`
            : "Для каждого изображения доступно 8 поисков, для премиум-тарифа — 12. Каждый поиск показывает до 8 вариантов; дальше — за дополнительные баллы."}
        </p>

        {results.length ? (
          <p className="rounded-md bg-muted/50 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground">
            Нажимайте на варианты — выбранное изображение сразу появится на слайде как предпросмотр. Окончательно оно сохранится только после подтверждения ниже.
          </p>
        ) : null}

        <div className="grid w-full min-w-0 max-w-full grid-cols-2 gap-2 overflow-hidden pr-1">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSelectedResultId(item.id)
                setRightsChecked(true)
                setInsertStatus("idle")
                setInsertError("")
                onPreviewImageFromSearch?.({
                  elementId: element.id,
                  previewUrl: item.imageUrl || item.thumbUrl,
                  fallbackUrl: item.thumbUrl,
                })
              }}
              aria-label={`Выбрать изображение${item.sourceHost ? ` с сайта ${item.sourceHost}` : ""}`}
              aria-pressed={selectedResultId === item.id}
              className={`relative w-full min-w-0 max-w-full overflow-hidden rounded-md border p-1 text-left transition hover:border-primary/60 hover:bg-accent/40 ${selectedResultId === item.id ? "border-primary bg-accent/50 ring-2 ring-primary/30" : ""}`}
            >
              <img src={item.thumbUrl} alt={item.id} className="block h-20 w-full min-w-0 max-w-full rounded object-cover" />
              {selectedResultId === item.id ? (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow" aria-hidden="true">
                  <Check className="h-3 w-3" />
                </span>
              ) : null}
              {item.sourceHost ? (
                <span className="mt-1 block w-full min-w-0 max-w-full truncate px-1 text-[11px] text-muted-foreground">{item.sourceHost}</span>
              ) : null}
            </button>
          ))}
        </div>

        {searchError ? <p className="text-xs text-destructive">{searchError}</p> : null}

        {selectedResult ? (
          <div className="w-full min-w-0 max-w-full space-y-3 overflow-hidden rounded-md border bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold">Завершить вставку</p>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  Предпросмотр уже на слайде. Подтвердите источник и вставьте изображение в проект.
                </p>
              </div>
            </div>

            <div className="rounded-md border bg-background p-2.5">
              <div className="flex items-start gap-2">
                <Checkbox
                  id={`rights-check-${selectedResult.id}`}
                  checked={rightsChecked}
                  onCheckedChange={(value) => setRightsChecked(value === true)}
                  className="mt-0.5"
                />
                <Label htmlFor={`rights-check-${selectedResult.id}`} className="min-w-0 cursor-pointer break-words text-xs font-medium leading-4">
                  Источник и права на использование в учебных целях проверены.{" "}
                  <a
                    href={selectedResult.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Источник
                  </a>
                </Label>
              </div>
            </div>

            <Button size="sm" className="h-9 w-full text-xs" onClick={handleInsert} disabled={!rightsChecked || isInserting}>
              {isInserting ? "Вставка..." : "Подтвердить и вставить"}
            </Button>
          </div>
        ) : results.length ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Выберите изображение из результатов, чтобы продолжить.
          </p>
        ) : null}

        {insertStatus === "done" ? (
          <div className="flex items-center justify-between gap-2 rounded-md bg-emerald-50 px-3 py-2 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            <span className="flex items-center gap-1.5 text-xs font-medium"><Check className="h-3.5 w-3.5" />Изображение вставлено</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-current hover:text-current"
              disabled={!srcPath || !hasPlaceholderReplacement}
              onClick={() => {
                if (!srcPath) return
                onResetPlaceholderImage?.({ srcPath })
                setInsertStatus("idle")
              }}
            >
              Вернуть исходное
            </Button>
          </div>
        ) : null}
        {insertError ? <p className="text-xs text-destructive">{insertError}</p> : null}
      </TabsContent>
    </Tabs>
  )
}
