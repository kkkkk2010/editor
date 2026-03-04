"use client"

import { Suspense, useCallback, useMemo, useRef, useState, useEffect } from "react"
import Sidebar from "@/components/sidebar"
import Toolbar from "@/components/toolbar"
import SlideEditor from "@/components/slide-editor"
import SlidePreview from "@/components/slide-preview"
import SettingsDialog from "@/components/settings-dialog"
import PropertyPanel from "@/components/property-panel/property-panel"
import EditorLayout from "@/components/layout/editor-layout"
import ImageUploadDialog from "@/components/image-upload-dialog"
import ExportDialog from "@/components/export-dialog"
import BackgroundSettingsDialog from "@/components/background-settings-dialog"
import AutoImportOutZip from "@/components/auto-import-outzip"
import { type Slide, type Element, defaultSlides, defaultSlideSize, type SlideSize, type Background } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Play, PanelRight } from "lucide-react"
import { Toaster } from "@/components/ui/toaster"
import { useIsMobile } from "@/components/ui/use-mobile"
import { useToast } from "@/hooks/use-toast"
import type { ImportResult } from "@/src/lib/import/importerDoc"
import { revokeImportObjectUrls } from "@/src/lib/import/zipImport"
import { AssetStore } from "@/src/lib/assets/assetStore"
import { mapEditorToImporter } from "@/src/lib/import/mapEditorToImporter"
import { mapImporterToEditor } from "@/src/lib/import/mapImporterToEditor"
import { exportProjectZip } from "@/src/lib/project/exportProjectZip"
import { buildWpSavePayload } from "@/src/lib/save/wpSavePayload"
import type { ImagePlan } from "@/src/lib/import/imagePlan"
import html2canvas from "html2canvas"

type EditorState = {
  slides: Slide[]
  currentSlideIndex: number
  selectedElementId: string | null
}

type HistoryState = {
  past: EditorState[]
  present: EditorState
  future: EditorState[]
}

type HistoryMeta = {
  type?: string
  reason?: string
}

type PlaceholderSlotRef = {
  slotId: string
  slide: number
  element: number
}

type ReplacedAsset = {
  bytesBase64: string
  contentType: string
  originalContent: string
  source: {
    pageUrl: string
    imageUrl: string
    licenseLabel?: string
    licenseUrl?: string
    source?: string
    confirmedAt: string
  }
  slot: PlaceholderSlotRef
  previewUrl: string
}

const MAX_HISTORY = 100

const initialPresent: EditorState = {
  slides: defaultSlides,
  currentSlideIndex: 0,
  selectedElementId: null,
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getExtensionFromFile(file: File) {
  const nameParts = file.name.split(".")
  if (nameParts.length > 1) {
    return nameParts[nameParts.length - 1].toLowerCase()
  }
  const mimeParts = file.type.split("/")
  return mimeParts.length > 1 ? mimeParts[1].toLowerCase() : "png"
}

function getExtensionFromUrl(url: string) {
  const cleaned = url.split("?")[0]
  const parts = cleaned.split(".")
  if (parts.length > 1) {
    return parts[parts.length - 1].toLowerCase()
  }
  return "png"
}

function decodeDataUrl(dataUrl: string): Uint8Array | null {
  if (!dataUrl.startsWith("data:")) {
    return null
  }
  const [, base64] = dataUrl.split(",")
  if (!base64) return null
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function normalizeBackgroundValue(background: Background) {
  if (background.type !== "image") return background.value
  if (background.value.startsWith("url(")) {
    return background.value
  }
  return `url(${background.value})`
}

function extractBackgroundUrl(background: Background): string | null {
  if (background.type !== "image") return null
  const value = background.value.trim()
  const urlMatch = value.match(/^url\\((.*)\\)$/i)
  if (urlMatch) {
    const rawUrl = urlMatch[1].trim().replace(/^['"]|['"]$/g, "")
    return rawUrl
  }
  return value
}

function syncTextStyle(style: Element["style"]): Element["style"] {
  const next = { ...style }

  if (typeof style.fontWeight === "string") {
    next.bold = style.fontWeight === "bold"
  } else if (typeof style.bold === "boolean") {
    next.fontWeight = style.bold ? "bold" : "normal"
  }

  if (typeof style.fontStyle === "string") {
    next.italic = style.fontStyle === "italic"
  } else if (typeof style.italic === "boolean") {
    next.fontStyle = style.italic ? "italic" : "normal"
  }

  if (typeof style.textDecoration === "string") {
    next.underline = style.textDecoration === "underline"
  } else if (typeof style.underline === "boolean") {
    next.textDecoration = style.underline ? "underline" : "none"
  }

  if (typeof style.textAlign === "string") {
    next.align = style.textAlign as "left" | "center" | "right" | "justify"
  } else if (typeof style.align === "string") {
    next.textAlign = style.align
  }

  return next
}

function cloneState(state: EditorState): EditorState {
  if (typeof structuredClone === "function") {
    return structuredClone(state) as EditorState
  }
  return JSON.parse(JSON.stringify(state)) as EditorState
}

function isSameState(a: EditorState, b: EditorState) {
  return (
    a.slides === b.slides &&
    a.currentSlideIndex === b.currentSlideIndex &&
    a.selectedElementId === b.selectedElementId
  )
}

export default function Home() {
  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: initialPresent,
    future: [],
  }))
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [slideSize, setSlideSize] = useState<SlideSize>(defaultSlideSize)
  const [showPropertyPanel, setShowPropertyPanel] = useState(false)
  const [presentationTitle, setPresentationTitle] = useState("Презентация") // Перевел: "flowmix多模态产品系列"
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [editorScale, setEditorScale] = useState(1)
  const importedAssetUrlsRef = useRef<string[]>([])
  const assetStoreRef = useRef(new AssetStore())
  const { toast } = useToast()
  const presentRef = useRef(history.present)
  const transformSnapshotRef = useRef<EditorState | null>(null)
  const transformDirtyRef = useRef(false)
  const textEditSnapshotRef = useRef<EditorState | null>(null)
  const textEditElementIdRef = useRef<string | null>(null)
  const textEditOriginalTextRef = useRef<string | null>(null)
  const [isBridgeImporting, setIsBridgeImporting] = useState(false)
  const [isSavingProject, setIsSavingProject] = useState(false)
  const [importRev, setImportRev] = useState(0)
  const isImportFlowRef = useRef(false)
  const currentPresentationIdRef = useRef<string | null>(null)
  const [currentPresentationId, setCurrentPresentationId] = useState<string | null>(null)
  const [importOverlayError, setImportOverlayError] = useState<string | null>(null)
  const [isManualImportEnabled, setIsManualImportEnabled] = useState(false)
  const [imagePlan, setImagePlan] = useState<ImagePlan | null>(null)
  const [selectedElementIndex, setSelectedElementIndex] = useState<number | null>(null)
  const [replacedAssets, setReplacedAssets] = useState<Record<string, ReplacedAsset>>({})
  const [hasPendingAutoImport, setHasPendingAutoImport] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return new URLSearchParams(window.location.search).has("importOutZip")
  })

  const present = history.present
  const isMobile = useIsMobile()
  const slides = present.slides
  const currentSlideIndex = present.currentSlideIndex
  const selectedElementId = present.selectedElementId
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  useEffect(() => {
    presentRef.current = present
  }, [present])

  useEffect(() => {
    if (currentPresentationIdRef.current !== null) {
      return
    }
    const params = new URLSearchParams(window.location.search)
    const presentationIdFromUrl = params.get("presentationId")
    currentPresentationIdRef.current = presentationIdFromUrl
    setCurrentPresentationId(presentationIdFromUrl)
    console.log("[wp] currentPresentationIdRef=", presentationIdFromUrl)
  }, [])

  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const response = await fetch("/api/admin/import-status", { cache: "no-store", credentials: "same-origin" })
        if (!response.ok) return
        const payload = (await response.json()) as { enabled?: boolean }
        if (active) {
          setIsManualImportEnabled(Boolean(payload?.enabled))
        }
      } catch {
        // keep manual import actions hidden by default
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [])

  const currentSlide = slides[currentSlideIndex]
  const selectedElement = useMemo(() => {
    if (!selectedElementId) return null
    const element = currentSlide?.elements.find((el) => el.id === selectedElementId) ?? null
    if (!element || element.type !== "image" || !element.assetPath) {
      return element
    }
    const replacement = replacedAssets[element.assetPath]
    if (!replacement) {
      return element
    }
    return {
      ...element,
      content: replacement.previewUrl,
    }
  }, [currentSlide, replacedAssets, selectedElementId])

  useEffect(() => {
    if (selectedElementId && !selectedElement) {
      setPresent((state) => ({ ...state, selectedElementId: null }))
    }
  }, [selectedElementId, selectedElement])

  const showImportOverlay = hasPendingAutoImport || isBridgeImporting
  const showSaveOverlay = isSavingProject
  const showBlockingOverlay = showImportOverlay || showSaveOverlay

  useEffect(() => {
    if (!showBlockingOverlay) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [showBlockingOverlay])

  useEffect(() => {
    console.log("[ui] render slides=", slides.length, "first slide=", slides[0])
  }, [slides])

  const setPresent = (updater: EditorState | ((state: EditorState) => EditorState)) => {
    setHistory((state) => {
      const next = typeof updater === "function" ? updater(state.present) : updater
      if (isSameState(state.present, next)) {
        return state
      }
      presentRef.current = next
      return { ...state, present: next }
    })
  }

  const commit = (next: EditorState, meta?: HistoryMeta) => {
    void meta
    setHistory((state) => {
      if (isSameState(state.present, next)) {
        return state
      }
      presentRef.current = next
      const past = [...state.past, state.present]
      const trimmedPast = past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past
      return { past: trimmedPast, present: next, future: [] }
    })
    setHasUnsavedChanges(true)
  }

  const commitFromSnapshot = (snapshot: EditorState, meta?: HistoryMeta) => {
    void meta
    setHistory((state) => {
      const next = state.present
      if (isSameState(snapshot, next)) {
        return state
      }
      const past = [...state.past, snapshot]
      const trimmedPast = past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past
      return { past: trimmedPast, present: next, future: [] }
    })
    setHasUnsavedChanges(true)
  }

  const resetHistory = (next: EditorState) => {
    presentRef.current = next
    setHistory({
      past: [],
      present: next,
      future: [],
    })
  }

  const findElementById = (stateSlides: Slide[], elementId: string) => {
    for (let slideIndex = 0; slideIndex < stateSlides.length; slideIndex += 1) {
      const elementIndex = stateSlides[slideIndex].elements.findIndex((element) => element.id === elementId)
      if (elementIndex !== -1) {
        return { slideIndex, elementIndex }
      }
    }
    return null
  }

  const updateTextElement = (stateSlides: Slide[], elementId: string, text: string) => {
    const location = findElementById(stateSlides, elementId)
    if (!location) {
      return stateSlides
    }
    const { slideIndex, elementIndex } = location
    const slide = stateSlides[slideIndex]
    const updatedElements = [...slide.elements]
    const updatedElement = {
      ...updatedElements[elementIndex],
      content: text,
    }
    updatedElements[elementIndex] = updatedElement
    const updatedSlides = [...stateSlides]
    updatedSlides[slideIndex] = { ...slide, elements: updatedElements }
    return updatedSlides
  }

  const undo = useCallback(() => {
    setHistory((state) => {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      const past = state.past.slice(0, -1)
      const future = [state.present, ...state.future]
      presentRef.current = previous
      return { past, present: previous, future }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory((state) => {
      if (state.future.length === 0) return state
      const next = state.future[0]
      const future = state.future.slice(1)
      const past = [...state.past, state.present]
      presentRef.current = next
      return { past, present: next, future }
    })
  }, [])

  useEffect(() => {
    const handleHistoryShortcuts = (event: KeyboardEvent) => {
      const activeElement = document.activeElement
      const activeHtmlElement = activeElement instanceof HTMLElement ? activeElement : null
      const isInputElement =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        !!activeHtmlElement?.isContentEditable

      if (isInputElement) {
        return
      }

      const isModifier = event.ctrlKey || event.metaKey
      if (!isModifier) return

      if (event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      }

      if (event.key.toLowerCase() === "y") {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener("keydown", handleHistoryShortcuts)

    return () => {
      window.removeEventListener("keydown", handleHistoryShortcuts)
    }
  }, [redo, undo])

  // 确保slideSize变化时立即更新
  useEffect(() => {
    document.documentElement.style.setProperty("--slide-width", `${slideSize.width}px`)
    document.documentElement.style.setProperty("--slide-height", `${slideSize.height}px`)
  }, [slideSize])

  // 监听属性面板变化，调整画布缩放
  useEffect(() => {
    const updateEditorScale = () => {
      if (!editorContainerRef.current) return

      const containerWidth = editorContainerRef.current.clientWidth
      const containerHeight = editorContainerRef.current.clientHeight

      // 计算水平和垂直方向的缩放比例
      const scaleX = (containerWidth - 80) / slideSize.width
      const scaleY = (containerHeight - 80) / slideSize.height

      // 取较小的缩放比例，确保幻灯片完全可见
      const scale = Math.min(scaleX, scaleY, 1) // 最大缩放为1

      setEditorScale(scale)
    }

    updateEditorScale()

    // 监听窗口大小变化
    window.addEventListener("resize", updateEditorScale)

    // 监听属性面板变化
    const observer = new MutationObserver(updateEditorScale)
    if (editorContainerRef.current) {
      observer.observe(editorContainerRef.current.parentElement as Node, {
        attributes: true,
        childList: true,
        subtree: true,
      })
    }

    return () => {
      window.removeEventListener("resize", updateEditorScale)
      observer.disconnect()
    }
  }, [slideSize, showPropertyPanel, editorContainerRef])

  useEffect(() => {
    return () => {
      revokeImportObjectUrls(importedAssetUrlsRef.current)
    }
  }, [])

  const addSlide = () => {
    const newSlide: Slide = {
      id: createId("slide"),
      background: {
        type: "color",
        value: "#ffffff",
      },
      elements: [],
    }
    const nextSlides = [...slides, newSlide]
    commit({
      slides: nextSlides,
      currentSlideIndex: slides.length,
      selectedElementId: null,
    }, { type: "slide", reason: "add" })
  }

  const updateSlideLive = (updatedSlide: Slide) => {
    setPresent((state) => {
      const newSlides = [...state.slides]
      newSlides[state.currentSlideIndex] = updatedSlide
      return { ...state, slides: newSlides }
    })
    if (transformSnapshotRef.current) {
      transformDirtyRef.current = true
    }
  }

  const removeSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= slides.length) {
        return
      }

      if (slides.length === 1) {
        toast({
          title: "Нельзя удалить единственный слайд",
        })
        return
      }

      const confirmed = window.confirm("Удалить слайд? Это действие нельзя отменить")
      if (!confirmed) {
        return
      }

      const nextSlides = slides.filter((_, slideIndex) => slideIndex !== index)
      const nextIndex = index >= nextSlides.length ? Math.max(0, nextSlides.length - 1) : index

      commit(
        {
          slides: nextSlides,
          currentSlideIndex: nextIndex,
          selectedElementId: null,
        },
        { type: "slide", reason: "remove" },
      )
      setIsPreviewMode(false)
    },
    [slides, toast, commit],
  )

  const duplicateSlide = (index: number) => {
    if (index < 0 || index >= slides.length) return

    const sourceSlide = slides[index]
    const duplicatedSlide: Slide = {
      ...sourceSlide,
      id: createId("slide"),
      elements: sourceSlide.elements.map((element) => ({
        ...element,
        id: createId(element.type),
      })),
    }

    const nextSlides = [...slides]
    nextSlides.splice(index + 1, 0, duplicatedSlide)

    commit(
      {
        slides: nextSlides,
        currentSlideIndex: index + 1,
        selectedElementId: null,
      },
      { type: "slide", reason: "duplicate" },
    )
  }

  const moveSlide = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= slides.length) return

    const nextSlides = [...slides]
    const [movedSlide] = nextSlides.splice(index, 1)
    nextSlides.splice(targetIndex, 0, movedSlide)

    let nextCurrentIndex = currentSlideIndex
    if (currentSlideIndex === index) {
      nextCurrentIndex = targetIndex
    } else if (currentSlideIndex === targetIndex) {
      nextCurrentIndex = index
    }

    commit(
      {
        slides: nextSlides,
        currentSlideIndex: nextCurrentIndex,
        selectedElementId: null,
      },
      { type: "slide", reason: "reorder" },
    )
  }

  useEffect(() => {
    const handleSlideDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return

      const activeElement = document.activeElement
      const activeHtmlElement = activeElement instanceof HTMLElement ? activeElement : null
      const isEditingText =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        !!activeHtmlElement?.isContentEditable

      if (isEditingText) {
        return
      }

      event.preventDefault()
      removeSlide(currentSlideIndex)
    }

    window.addEventListener("keydown", handleSlideDeleteKey)

    return () => {
      window.removeEventListener("keydown", handleSlideDeleteKey)
    }
  }, [currentSlideIndex, removeSlide])

  const updateElement = (updatedElement: Element) => {
    const slide = slides[currentSlideIndex]
    if (!slide) return

    const elementIndex = slide.elements.findIndex((el) => el.id === updatedElement.id)

    if (elementIndex === -1) return

    const updatedElements = [...slide.elements]
    const normalizedElement =
      updatedElement.type === "text"
        ? {
            ...updatedElement,
            style: syncTextStyle(updatedElement.style),
          }
        : updatedElement
    updatedElements[elementIndex] = normalizedElement

    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = {
      ...slide,
      elements: updatedElements,
    }

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId: normalizedElement.id,
      },
      { type: "element", reason: "update" },
    )
  }

  const handleElementSelect = (element: Element | null) => {
    const nextIndex = element ? currentSlide.elements.findIndex((item) => item === element) : -1
    setSelectedElementIndex(nextIndex >= 0 ? nextIndex : null)
    setPresent((state) => ({
      ...state,
      selectedElementId: element?.id ?? null,
    }))
    if (element && !showPropertyPanel) {
      setShowPropertyPanel(true)
    }
  }

  const handleSizeChange = (width: number, height: number) => {
    setSlideSize({ width, height })
    setHasUnsavedChanges(true)
  }

  const handleAddShape = (shapeType: string) => {
    const newElement: Element = {
      id: createId("shape"),
      type: "shape",
      content: shapeType,
      position: { x: slideSize.width / 2 - 75, y: slideSize.height / 2 - 75 },
      size: { width: 150, height: 150 },
      style: {
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 2,
        opacity: 1,
      },
    }

    const updatedSlide = {
      ...currentSlide,
      elements: [...currentSlide.elements, newElement],
    }
    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = updatedSlide

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId: newElement.id,
      },
      { type: "element", reason: "add" },
    )
    setShowPropertyPanel(true)
  }

  const storeAssetFromFile = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const extension = getExtensionFromFile(file)
    const assetPath = `assets/images/${createId("image")}.${extension}`
    assetStoreRef.current.setAsset(assetPath, bytes, file.type || "application/octet-stream")
    return assetPath
  }

  const storeAssetFromUrl = async (url: string, fallbackName: string) => {
    const dataBytes = decodeDataUrl(url)
    if (dataBytes) {
      const extension = getExtensionFromUrl(url)
      const assetPath = `assets/images/${fallbackName}.${extension}`
      assetStoreRef.current.setAsset(assetPath, dataBytes, "application/octet-stream")
      return assetPath
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Не удалось загрузить ассет: ${url}`)
    }
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const contentType = response.headers.get("Content-Type") || "application/octet-stream"
    const extension = getExtensionFromUrl(url)
    const assetPath = `assets/images/${fallbackName}.${extension}`
    assetStoreRef.current.setAsset(assetPath, bytes, contentType)
    return assetPath
  }

  const storeAssetFromUrlAtPath = async (url: string, assetPath: string) => {
    const dataBytes = decodeDataUrl(url)
    if (dataBytes) {
      assetStoreRef.current.setAsset(assetPath, dataBytes, "application/octet-stream")
      return
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Не удалось загрузить ассет: ${url}`)
    }
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const contentType = response.headers.get("Content-Type") || "application/octet-stream"
    assetStoreRef.current.setAsset(assetPath, bytes, contentType)
  }

  const handleAddImage = async (imageUrl: string, file?: File) => {
    const assetPath = file ? await storeAssetFromFile(file) : undefined
    const newElement: Element = {
      id: createId("image"),
      type: "image",
      content: imageUrl,
      assetPath,
      position: { x: slideSize.width / 2 - 150, y: slideSize.height / 2 - 100 },
      size: { width: 300, height: 200 },
      style: {
        borderRadius: 0,
        opacity: 1,
        objectFit: "cover",
      },
    }

    const updatedSlide = {
      ...currentSlide,
      elements: [...currentSlide.elements, newElement],
    }
    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = updatedSlide

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId: newElement.id,
      },
      { type: "element", reason: "add" },
    )
    setShowPropertyPanel(true)
  }

  const handleReplaceImage = async (imageUrl: string, file?: File) => {
    if (!selectedElement || selectedElement.type !== "image") {
      return
    }
    let assetPath = selectedElement.assetPath
    if (file) {
      assetPath = await storeAssetFromFile(file)
    } else if (!assetPath) {
      assetPath = await storeAssetFromUrl(imageUrl, createId("image"))
    }
    updateElement({
      ...selectedElement,
      content: imageUrl,
      assetPath,
    })
  }

  const hasPlaceholderReplacement = useCallback(
    (srcPath: string) => Boolean(replacedAssets[srcPath]),
    [replacedAssets],
  )

  const handleResetPlaceholderImage = useCallback(({ srcPath }: { srcPath: string }) => {
    const originalContent = replacedAssets[srcPath]?.originalContent
    setReplacedAssets((previous) => {
      const existing = previous[srcPath]
      if (!existing) return previous
      URL.revokeObjectURL(existing.previewUrl)
      const next = { ...previous }
      delete next[srcPath]
      return next
    })

    setPresent((state) => {
      const slide = state.slides[state.currentSlideIndex]
      if (!slide) return state
      const index = slide.elements.findIndex((el) => el.id === state.selectedElementId)
      if (index < 0) return state
      const element = slide.elements[index]
      if (element.type !== "image" || element.assetPath !== srcPath) return state
      const updatedElements = [...slide.elements]
      updatedElements[index] = {
        ...element,
        content: originalContent || element.assetPath || element.content,
      }
      const updatedSlides = [...state.slides]
      updatedSlides[state.currentSlideIndex] = { ...slide, elements: updatedElements }
      return { ...state, slides: updatedSlides }
    })
  }, [replacedAssets])

  const replaceImageForElement = useCallback(
    async (payload: {
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
    }) => {
      const response = await fetch("/api/images/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: payload.selection.imageUrl }),
      })
      const body = (await response.json()) as { ok?: boolean; bytesBase64?: string; contentType?: string; message?: string }
      if (!response.ok || !body.ok || !body.bytesBase64 || !body.contentType) {
        throw new Error(body?.message || "Не удалось получить изображение")
      }
      const bytesBase64 = body.bytesBase64
      const contentType = body.contentType

      const bytes = Uint8Array.from(atob(bytesBase64), (ch) => ch.charCodeAt(0))
      const blob = new Blob([toArrayBuffer(bytes)], { type: contentType })
      const previewUrl = URL.createObjectURL(blob)

      const location = findElementById(presentRef.current.slides, payload.elementId)
      const targetSlideIndex = location?.slideIndex ?? currentSlideIndex
      const targetElementIndex = location?.elementIndex ?? selectedElementIndex ?? 0
      const targetSlide = presentRef.current.slides[targetSlideIndex]
      const targetElement = targetSlide?.elements[targetElementIndex]
      const resolvedSrcPath =
        payload.srcPath ||
        targetElement?.assetPath ||
        `assets/images/${payload.elementId}.${getExtensionFromUrl(payload.selection.imageUrl)}`

      setReplacedAssets((previous) => {
        const existing = previous[resolvedSrcPath]
        if (existing) {
          URL.revokeObjectURL(existing.previewUrl)
        }
        return {
            ...previous,
            [resolvedSrcPath]: {
            bytesBase64,
            contentType,
            originalContent: payload.currentContent,
            previewUrl,
            slot: {
              slotId: `manual-${payload.elementId}`,
              slide: targetSlideIndex + 1,
              element: targetElementIndex,
            },
            source: {
              pageUrl: payload.selection.pageUrl,
              imageUrl: payload.selection.imageUrl,
              licenseLabel: payload.selection.licenseLabel,
              licenseUrl: payload.selection.licenseUrl,
              source: payload.selection.source,
              confirmedAt: new Date().toISOString(),
            },
          },
        }
      })

      assetStoreRef.current.setAsset(resolvedSrcPath, bytes, contentType)

      setPresent((state) => {
        const found = findElementById(state.slides, payload.elementId)
        if (!found) return state
        const slide = state.slides[found.slideIndex]
        const index = found.elementIndex
        const element = slide.elements[index]
        if (element.type !== "image") return state
        const updatedElements = [...slide.elements]
        updatedElements[index] = {
          ...element,
          content: previewUrl,
          assetPath: resolvedSrcPath,
          meta: {
            ...element.meta,
            search: {
              ...(element.meta?.search ?? {}),
              query: payload.searchMeta.query,
              negative: payload.searchMeta.negative,
              kind: payload.searchMeta.kind,
              aspect: payload.searchMeta.aspect,
              updatedAt: new Date().toISOString(),
            },
          },
        }
        const updatedSlides = [...state.slides]
        updatedSlides[found.slideIndex] = { ...slide, elements: updatedElements }
        return { ...state, slides: updatedSlides }
      })
    },
    [currentSlideIndex, selectedElementIndex],
  )

  // 右键菜单功能
  const handleCopyElement = (element: Element) => {
    const newElement: Element = {
      ...element,
      id: createId(element.type),
      position: {
        x: element.position.x + 20,
        y: element.position.y + 20,
      },
    }

    const updatedSlide = {
      ...currentSlide,
      elements: [...currentSlide.elements, newElement],
    }
    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = updatedSlide

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId: newElement.id,
      },
      { type: "element", reason: "copy" },
    )
  }

  const handleDeleteElement = (element: Element) => {
    const updatedElements = currentSlide.elements.filter((el) => el.id !== element.id)

    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = {
      ...currentSlide,
      elements: updatedElements,
    }

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId: null,
      },
      { type: "element", reason: "delete" },
    )
  }

  const handleMoveElementForward = (element: Element) => {
    const elementIndex = currentSlide.elements.findIndex((el) => el.id === element.id)
    if (elementIndex === currentSlide.elements.length - 1) return

    const updatedElements = [...currentSlide.elements]
    const temp = updatedElements[elementIndex]
    updatedElements[elementIndex] = updatedElements[elementIndex + 1]
    updatedElements[elementIndex + 1] = temp

    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = {
      ...currentSlide,
      elements: updatedElements,
    }

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId: element.id,
      },
      { type: "element", reason: "move-forward" },
    )
  }

  const handleMoveElementBackward = (element: Element) => {
    const elementIndex = currentSlide.elements.findIndex((el) => el.id === element.id)
    if (elementIndex === 0) return

    const updatedElements = [...currentSlide.elements]
    const temp = updatedElements[elementIndex]
    updatedElements[elementIndex] = updatedElements[elementIndex - 1]
    updatedElements[elementIndex - 1] = temp

    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = {
      ...currentSlide,
      elements: updatedElements,
    }

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId: element.id,
      },
      { type: "element", reason: "move-backward" },
    )
  }

  const handleLockToggle = (element: Element) => {
    const updatedElement = {
      ...element,
      style: {
        ...element.style,
        locked: !element.style.locked,
      },
    }

    updateElement(updatedElement)
  }

  const handleAddText = () => {
    const newElement: Element = {
      id: createId("text"),
      type: "text",
      content: "Дважды щелкните для редактирования", // Перевел: "双击编辑文本"
      position: { x: slideSize.width / 2 - 100, y: slideSize.height / 2 - 20 },
      size: { width: 200, height: 40 },
      style: {
        fontSizePt: 24,
        fontWeight: "normal",
        color: "#000000",
        textAlign: "center",
      },
    }

    const updatedSlide = {
      ...currentSlide,
      elements: [...currentSlide.elements, newElement],
    }
    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = updatedSlide

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId: newElement.id,
      },
      { type: "element", reason: "add" },
    )
    setShowPropertyPanel(true)
  }

  const handleBackgroundChange = (background: Background) => {
    // 确保图片背景正确应用
    const updatedBackground = { ...background }

    // 如果是图片类型但值不是以url(开头，则添加url()
    if (background.type === "image" && !background.value.startsWith("url(")) {
      updatedBackground.value = `url(${background.value})`
    }

    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = {
      ...currentSlide,
      background: updatedBackground,
    }

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId,
      },
      { type: "slide", reason: "background" },
    )
  }

  const handleMoveElementToFront = (element: Element) => {
    const elementIndex = currentSlide.elements.findIndex((el) => el.id === element.id)
    if (elementIndex === currentSlide.elements.length - 1) return

    const updatedElements = [...currentSlide.elements]
    const elementToMove = updatedElements.splice(elementIndex, 1)[0]
    updatedElements.push(elementToMove)

    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = {
      ...currentSlide,
      elements: updatedElements,
    }

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId: element.id,
      },
      { type: "element", reason: "move-front" },
    )
  }

  const handleMoveElementToBack = (element: Element) => {
    const elementIndex = currentSlide.elements.findIndex((el) => el.id === element.id)
    if (elementIndex === 0) return

    const updatedElements = [...currentSlide.elements]
    const elementToMove = updatedElements.splice(elementIndex, 1)[0]
    updatedElements.unshift(elementToMove)

    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = {
      ...currentSlide,
      elements: updatedElements,
    }

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId: element.id,
      },
      { type: "element", reason: "move-back" },
    )
  }

  const handleImport = (result: ImportResult) => {
    const importedSlides = result.slides.map((slide) => ({
      ...slide,
      background: { ...slide.background },
      elements: slide.elements.map((element) => ({
        ...element,
        position: { ...element.position },
        size: { ...element.size },
        style: { ...element.style },
      })),
    }))

    setSlideSize(result.slideSize)
    resetHistory({
      slides: importedSlides,
      currentSlideIndex: 0,
      selectedElementId: null,
    })
    setReplacedAssets((previous) => {
      Object.values(previous).forEach((item) => URL.revokeObjectURL(item.previewUrl))
      return {}
    })
    setSelectedElementIndex(null)
    setImportRev((value) => value + 1)
    console.log("[auto-import] after import slides=", importedSlides.length)
    console.log("[auto-import] after import first slide=", importedSlides[0])
    if (isImportFlowRef.current) {
      try {
        const presentationId = currentPresentationIdRef.current ?? "unknown"
        localStorage.setItem(
          `presentonika:imported:${presentationId}`,
          JSON.stringify({
            presentationId,
            importedAt: Date.now(),
            slideCount: importedSlides.length,
            firstSlideId: importedSlides[0]?.id ?? null,
          }),
        )
        console.log("[auto-import] cache persisted", { presentationId, slideCount: importedSlides.length })
      } catch (error) {
        console.error("[auto-import] failed to persist cache", error)
      }
    }
    setShowPropertyPanel(false)
    setHasUnsavedChanges(false)
  }

  const handleImportZip = (result: ImportResult, createdUrls: string[]) => {
    revokeImportObjectUrls(importedAssetUrlsRef.current)
    importedAssetUrlsRef.current = createdUrls
    handleImport(result)
  }

  const importOutZipFromArrayBuffer = useCallback(
    async (outZip: ArrayBuffer) => {
      assetStoreRef.current.clear()
      const { importZipFile } = await import("@/src/lib/import/zipImport")
      const { doc, createdUrls, sourceSlideSize, imagePlan } = await importZipFile(outZip, assetStoreRef.current)
      setImagePlan(imagePlan)
      const mapped = mapImporterToEditor(doc, { sourceSlideSize, allowResize: true })
      handleImportZip(mapped, createdUrls)
    },
    [handleImportZip],
  )

  const handleAutoImportStart = useCallback(() => {
    isImportFlowRef.current = true
    setHasPendingAutoImport(true)
    setImportOverlayError(null)
    assetStoreRef.current.clear()
    setReplacedAssets((previous) => {
      Object.values(previous).forEach((item) => URL.revokeObjectURL(item.previewUrl))
      return {}
    })
    revokeImportObjectUrls(importedAssetUrlsRef.current)
    importedAssetUrlsRef.current = []
    resetHistory({
      slides: defaultSlides,
      currentSlideIndex: 0,
      selectedElementId: null,
    })
    setHasUnsavedChanges(false)
    console.log("[auto-import] hard reset done before import")
  }, [])

  const handleAutoImportComplete = useCallback((success: boolean) => {
    console.log("[auto-import] complete", { success, importRev: success ? importRev + 1 : importRev })
    isImportFlowRef.current = false
    if (success) {
      setHasPendingAutoImport(false)
      setImportOverlayError(null)
    }
  }, [importRev])

  const renderBackgroundBytes = async (background: Background) => {
    const container = document.createElement("div")
    container.style.width = `${slideSize.width}px`
    container.style.height = `${slideSize.height}px`
    container.style.position = "fixed"
    container.style.left = "-10000px"
    container.style.top = "0"
    container.style.background = normalizeBackgroundValue(background)
    container.style.backgroundSize = "100% 100%"
    container.style.backgroundRepeat = "no-repeat"
    container.style.backgroundPosition = "center"
    document.body.appendChild(container)

    try {
      const canvas = await html2canvas(container, {
        backgroundColor: null,
        scale: 1,
        width: slideSize.width,
        height: slideSize.height,
        useCORS: true,
      })
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result)
          } else {
            reject(new Error("Не удалось создать изображение фона"))
          }
        }, "image/png")
      })
      const buffer = await blob.arrayBuffer()
      return new Uint8Array(buffer)
    } finally {
      document.body.removeChild(container)
    }
  }

  type WpSaveCtx = { saveEndpoint: string; saveToken: string; presentationId: string; outZipUrl?: string; ts?: number }


  const maskSensitiveUrl = (rawUrl: string | null | undefined) => {
    if (!rawUrl) return null
    try {
      const parsed = new URL(rawUrl, window.location.origin)
      ;["saveToken", "t"].forEach((key) => {
        if (parsed.searchParams.has(key)) {
          parsed.searchParams.set(key, "***")
        }
      })
      return `${parsed.origin}${parsed.pathname}${parsed.search}`
    } catch {
      return "invalid-url"
    }
  }

  const getWpSaveCtx = (currentPresentationIdValue: string | null): WpSaveCtx | null => {
    const savedCtxRaw = sessionStorage.getItem("wpSaveCtx")
    if (savedCtxRaw) {
      try {
        const parsed = JSON.parse(savedCtxRaw) as WpSaveCtx
        if (parsed.saveEndpoint && parsed.saveToken && parsed.presentationId) {
          if (typeof parsed.ts === "number" && Date.now() - parsed.ts > 30 * 60 * 1000) {
            sessionStorage.removeItem("wpSaveCtx")
            toast({
              title: "Save unavailable",
              description: "Token expired, reopen from cabinet",
              variant: "destructive",
            })
            return null
          }
          return parsed
        }
      } catch {
        sessionStorage.removeItem("wpSaveCtx")
      }
    }

    const params = new URLSearchParams(window.location.search)
    const saveEndpoint = params.get("saveEndpoint")
    const saveToken = params.get("saveToken")
    const importOutZip = params.get("importOutZip")
    const bridgeToken = params.get("t") ?? ""
    let outZipUrl: string | undefined
    if (importOutZip) {
      const sourceUrl = new URL(importOutZip, window.location.origin)
      sourceUrl.searchParams.set("t", bridgeToken)
      outZipUrl = sourceUrl.toString()
    }
    if (saveEndpoint && saveToken && currentPresentationIdValue) {
      return { saveEndpoint, saveToken, presentationId: currentPresentationIdValue, outZipUrl }
    }
    return null
  }

  const buildOutZipBytesFromSnapshot = async () => {
    const presentSnapshot = cloneState(presentRef.current)
    console.log("[wp-save] snapshot slides=", presentSnapshot.slides.length, "first=", presentSnapshot.slides[0]?.id)
    const slidesSnapshot = presentSnapshot.slides
    const assetStore = assetStoreRef.current
    const slidesForExport = await Promise.all(
      slidesSnapshot.map(async (slide) => {
        const existingBackgroundPath = slide.background.type === "image" ? slide.background.assetPath : undefined
        const backgroundAssetPath = existingBackgroundPath || `backgrounds/bg-${slide.id}.png`
        if (!assetStore.hasAsset(backgroundAssetPath)) {
          if (existingBackgroundPath) {
            const backgroundUrl = extractBackgroundUrl(slide.background)
            if (backgroundUrl) {
              await storeAssetFromUrlAtPath(backgroundUrl, backgroundAssetPath)
            }
          } else {
            const backgroundBytes = await renderBackgroundBytes(slide.background)
            assetStore.setAsset(backgroundAssetPath, backgroundBytes, "image/png")
          }
        }

        const elements = await Promise.all(
          slide.elements.map(async (element) => {
            if (element.type !== "image") {
              return element
            }

            const existingPath = element.assetPath
            const extension = existingPath ? getExtensionFromUrl(existingPath) : getExtensionFromUrl(element.content)
            const assetPath = existingPath || `assets/images/${element.id}.${extension}`

            if (!assetStore.hasAsset(assetPath)) {
              await storeAssetFromUrlAtPath(element.content, assetPath)
            }

            return {
              ...element,
              assetPath,
            }
          }),
        )

        return {
          ...slide,
          background: {
            ...slide.background,
            type: "image" as const,
            value: normalizeBackgroundValue(slide.background),
            assetPath: backgroundAssetPath,
          },
          elements,
        }
      }),
    )

    const importerDoc = mapEditorToImporter(slidesForExport, slideSize)
    const imageCredits = Object.entries(replacedAssets).map(([src, item]) => ({
      src,
      slot: item.slot,
      pageUrl: item.source.pageUrl,
      imageUrl: item.source.imageUrl,
      licenseLabel: item.source.licenseLabel,
      licenseUrl: item.source.licenseUrl,
      confirmedAt: item.source.confirmedAt,
    }))
    const zipBytes = exportProjectZip(importerDoc, assetStore, {
      imageCredits: imageCredits.length > 0 ? imageCredits : undefined,
    })
    const src = zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes as ArrayBufferLike)
    const bytes = new Uint8Array(src.byteLength)
    bytes.set(src)
    const blob = new Blob([toArrayBuffer(bytes)], { type: "application/zip" })
    console.log("[wp-save] generated zip bytes", blob.size)
    return { bytes, blob }
  }

  const stageOutZip = async (params: {
    bytes: Uint8Array
    blobSize: number
    requestId: string
    presentationId: string
    saveToken: string
  }) => {
    const stageBody = toArrayBuffer(params.bytes)
    const stageResponse = await fetch("/api/bridge/stage-outzip", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-request-id": params.requestId,
        "x-presentation-id": params.presentationId,
        "x-save-token": params.saveToken,
      },
      credentials: "same-origin",
      body: stageBody,
    })
    const stageText = await stageResponse.text()
    if (!stageResponse.ok) {
      throw new Error(`Staging failed: HTTP ${stageResponse.status}: ${stageText.slice(0, 200)}`)
    }
    let stageJson: { outZipUrl?: string } | null = null
    try {
      stageJson = JSON.parse(stageText) as { outZipUrl?: string }
    } catch {
      stageJson = null
    }
    if (!stageJson?.outZipUrl) {
      throw new Error("Staging failed: missing outZipUrl")
    }
    const stagedOutZipUrl = new URL(stageJson.outZipUrl, window.location.origin).toString()
    console.log("[wp-save] staged outZipUrl=", stagedOutZipUrl, "size=", params.blobSize, "requestId=", params.requestId)
    return stagedOutZipUrl
  }

  const saveOutZipUrlToWp = async (params: {
    saveEndpoint: string
    saveToken: string
    presentationId: string
    stagedOutZipUrl: string
    requestId: string
  }) => {
    const payload = buildWpSavePayload({
      stagedOutZipUrl: params.stagedOutZipUrl,
      presentationId: params.presentationId,
      saveToken: params.saveToken,
      requestId: params.requestId,
    })
    console.log("[wp-save] payload", {
      presentationId: payload.presentationId,
      outZipUrl: payload.outZipUrl,
      requestId: payload.requestId,
    })

    const response = await fetch(params.saveEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": params.requestId,
      },
      mode: "cors",
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()
    if (!response.ok) {
      console.error("[wp-save] from-url failed", response.status, responseText)
      throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 200)}`)
    }
    return responseText
  }

  const handleSaveProject = async () => {
    if (isSavingProject) {
      return
    }

    setIsSavingProject(true)
    console.info("SAVE_HANDLER_VERSION-2026-02-12-json-url")
    toast({
      title: "Saving to WP…",
      description: "Подождите, выполняется удаленное сохранение.",
    })

    try {
      await Promise.resolve()
      // WP save ctx persisted because router clean removes query params
      const currentPresentationIdValue = currentPresentationIdRef.current
      const ctx = getWpSaveCtx(currentPresentationIdValue)

      console.info({ presentationId: ctx?.presentationId ?? null, hasSaveToken: Boolean(ctx?.saveToken), saveEndpoint: maskSensitiveUrl(ctx?.saveEndpoint ?? null) })

      if (!ctx) {
        toast({
          title: "Save unavailable",
          description: "Save unavailable: open from cabinet",
          variant: "destructive",
        })
        return
      }

      if (!currentPresentationIdValue) {
        toast({
          title: "Не удалось сохранить проект",
          description: "Ошибка сохранения: не найден presentationId в URL. Обнови страницу и попробуй снова.",
          variant: "destructive",
        })
        return
      }

      const { saveEndpoint, saveToken, presentationId } = ctx
      const requestId = `save-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
      const { bytes, blob } = await buildOutZipBytesFromSnapshot()
      const stagedOutZipUrl = await stageOutZip({
        bytes,
        blobSize: blob.size,
        requestId,
        presentationId,
        saveToken,
      })

      console.log("[wp-save] mode from-url")
      console.log("[wp-save] endpoint", maskSensitiveUrl(saveEndpoint))
      let endpointPresentationId: string | null = null
      try {
        const endpointUrl = new URL(saveEndpoint, window.location.origin)
        endpointPresentationId = endpointUrl.searchParams.get("presentationId")
      } catch (error) {
        console.error("[wp-save] invalid saveEndpoint", maskSensitiveUrl(saveEndpoint), error)
      }
      console.log("[wp-save] guard", {
        currentPresentationId: currentPresentationIdValue,
        wpSaveCtxPresentationId: presentationId,
        saveEndpoint: maskSensitiveUrl(saveEndpoint),
        endpointPresentationId,
      })

      if (presentationId !== currentPresentationIdValue || (endpointPresentationId && endpointPresentationId !== currentPresentationIdValue)) {
        const mismatchMessage = `Ошибка сохранения: несовпадение presentationId (ctx=${presentationId}, url=${currentPresentationIdValue}). Обнови страницу и попробуй снова.`
        console.error("[wp-save] presentationId mismatch", {
          currentPresentationId: currentPresentationIdValue,
          wpSaveCtx: {
            presentationId: ctx.presentationId,
            saveEndpoint: maskSensitiveUrl(ctx.saveEndpoint),
            hasSaveToken: Boolean(ctx.saveToken),
          },
          endpointPresentationId,
          href: window.location.href,
        })
        toast({
          title: "Не удалось сохранить проект",
          description: mismatchMessage,
          variant: "destructive",
        })
        return
      }

      const responseText = await saveOutZipUrlToWp({
        saveEndpoint,
        saveToken,
        presentationId,
        stagedOutZipUrl,
        requestId,
      })

      let responseJson: { ok?: boolean; message?: string; url?: string } | null = null
      try {
        responseJson = JSON.parse(responseText) as { ok?: boolean; message?: string; url?: string }
      } catch {
        responseJson = null
      }

      if (!responseJson?.ok) {
        throw new Error(responseJson?.message || "Save failed")
      }

      console.log("[wp-save] from-url success", responseJson.url ?? null)

      toast({
        title: "Saved",
        description: "Проект сохранен в WordPress.",
      })

      setHasUnsavedChanges(false)
    } catch (error) {
      console.error("Save project failed:", error)
      toast({
        title: "Не удалось сохранить проект",
        description: error instanceof Error ? error.message : "Попробуйте снова.",
        variant: "destructive",
      })
    } finally {
      setIsSavingProject(false)
    }
  }

  const handleTransformStart = () => {
    if (transformSnapshotRef.current) {
      return
    }
    transformSnapshotRef.current = cloneState(presentRef.current)
    transformDirtyRef.current = false
  }

  const handleTransformEnd = () => {
    const snapshot = transformSnapshotRef.current
    if (!snapshot) return

    transformSnapshotRef.current = null

    if (!transformDirtyRef.current) {
      transformDirtyRef.current = false
      return
    }

    transformDirtyRef.current = false
    commitFromSnapshot(snapshot, { type: "transform", reason: "end" })
  }

  const beginTextEdit = (elementId: string) => {
    if (textEditSnapshotRef.current) {
      return
    }
    textEditSnapshotRef.current = cloneState(presentRef.current)
    textEditElementIdRef.current = elementId
    const location = findElementById(presentRef.current.slides, elementId)
    textEditOriginalTextRef.current = location
      ? presentRef.current.slides[location.slideIndex].elements[location.elementIndex].content
      : null
  }

  const updateTextDraft = (elementId: string, text: string) => {
    setPresent((state) => {
      const updatedSlides = updateTextElement(state.slides, elementId, text)
      return { ...state, slides: updatedSlides, selectedElementId: elementId }
    })
  }

  const endTextEdit = (elementId: string) => {
    if (!textEditSnapshotRef.current || textEditElementIdRef.current !== elementId) {
      return
    }
    const location = findElementById(presentRef.current.slides, elementId)
    const currentText = location
      ? presentRef.current.slides[location.slideIndex].elements[location.elementIndex].content
      : null
    const originalText = textEditOriginalTextRef.current

    if (currentText !== originalText) {
      commitFromSnapshot(textEditSnapshotRef.current, { type: "element", reason: "edit-text" })
    }

    textEditSnapshotRef.current = null
    textEditElementIdRef.current = null
    textEditOriginalTextRef.current = null
  }

  const cancelTextEdit = (elementId: string) => {
    if (!textEditSnapshotRef.current || textEditElementIdRef.current !== elementId) {
      return
    }
    setPresent(textEditSnapshotRef.current)
    textEditSnapshotRef.current = null
    textEditElementIdRef.current = null
    textEditOriginalTextRef.current = null
  }

  return (
    <main className="flex flex-col h-screen bg-background">
      <Suspense fallback={null}>
        <AutoImportOutZip
          importOutZipFromArrayBuffer={importOutZipFromArrayBuffer}
          currentPresentationId={currentPresentationId}
          onImportStateChange={setIsBridgeImporting}
          onImportStart={handleAutoImportStart}
          onImportComplete={handleAutoImportComplete}
          onImportError={setImportOverlayError}
        />
      </Suspense>
      {isMobile ? (
        <SlidePreview
          slides={slides}
          initialSlide={currentSlideIndex}
          onExit={() => {
            // На мобильных используем режим просмотра как основной.
          }}
          slideSize={slideSize}
        />
      ) : isPreviewMode ? (
        <SlidePreview
          slides={slides}
          initialSlide={currentSlideIndex}
          onExit={() => setIsPreviewMode(false)}
          slideSize={slideSize}
        />
      ) : (
        <>
          <Toolbar
            selectedElement={selectedElement}
            onUpdateElement={updateElement}
            onAddShape={handleAddShape}
            onAddText={handleAddText}
            title={presentationTitle}
            onTitleChange={setPresentationTitle}
            importOutZipFromArrayBuffer={importOutZipFromArrayBuffer}
            showAdminImportTools={isManualImportEnabled}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onSaveProject={handleSaveProject}
            hasUnsavedChanges={hasUnsavedChanges}
            isSavingProject={isSavingProject}
          />

          <div className="flex-1 overflow-hidden">
            <EditorLayout
              key={`import-${importRev}`}
              sidebar={
                  <Sidebar
                    slides={slides}
                    currentSlideIndex={currentSlideIndex}
                    slideSize={slideSize}
                    onSlideSelect={(index) =>
                      setPresent((state) => ({
                        ...state,
                      currentSlideIndex: index,
                      selectedElementId: null,
                    }))
                  }
                  onAddSlide={addSlide}
                  onRemoveSlide={removeSlide}
                  onDuplicateSlide={duplicateSlide}
                  onMoveSlideUp={(index) => moveSlide(index, "up")}
                  onMoveSlideDown={(index) => moveSlide(index, "down")}
                  onReorderSlides={(fromIndex, toIndex) => {
                    if (fromIndex === toIndex) return
                    if (fromIndex < 0 || fromIndex >= slides.length) return
                    if (toIndex < 0 || toIndex >= slides.length) return

                    const nextSlides = [...slides]
                    const [movedSlide] = nextSlides.splice(fromIndex, 1)
                    nextSlides.splice(toIndex, 0, movedSlide)

                    const activeSlideId = slides[currentSlideIndex]?.id
                    const nextCurrentIndex = Math.max(
                      0,
                      nextSlides.findIndex((slide) => slide.id === activeSlideId),
                    )

                    commit(
                      {
                        slides: nextSlides,
                        currentSlideIndex: nextCurrentIndex,
                        selectedElementId: null,
                      },
                      { type: "slide", reason: "reorder" },
                    )
                  }}
                />
              }
              editor={
                <div
                  ref={editorContainerRef}
                  className="flex flex-col items-center justify-center min-h-full p-8 bg-muted/30"
                >
                  <div
                    style={{
                      transform: `scale(${editorScale})`,
                      transformOrigin: "center",
                      transition: "transform 0.2s ease",
                    }}
                  >
                    <SlideEditor
                      slide={currentSlide}
                      onUpdateSlide={updateSlideLive}
                      onBeginTextEdit={beginTextEdit}
                      onTextEditChange={updateTextDraft}
                      onEndTextEdit={endTextEdit}
                      onCancelTextEdit={cancelTextEdit}
                      selectedElement={selectedElement}
                      onElementSelect={handleElementSelect}
                      slideSize={slideSize}
                      onCopyElement={handleCopyElement}
                      onDeleteElement={handleDeleteElement}
                      onMoveElementForward={handleMoveElementForward}
                      onMoveElementBackward={handleMoveElementBackward}
                      onLockToggle={handleLockToggle}
                      onTransformStart={handleTransformStart}
                      onTransformEnd={handleTransformEnd}
                    />
                  </div>
                </div>
              }
              propertyPanel={
              <PropertyPanel
                  selectedElement={selectedElement}
                  selectedElementIndex={selectedElementIndex}
                  onUpdateElement={updateElement}
                  onReplaceImage={handleReplaceImage}
                  onClose={() => setShowPropertyPanel(false)}
                  currentSlide={currentSlide}
                  currentSlideIndex={currentSlideIndex}
                  imagePlan={imagePlan}
                  projectTopic={presentationTitle}
                  language="ru"
                  hasPlaceholderReplacement={hasPlaceholderReplacement}
                  onInsertImageFromSearch={replaceImageForElement}
                  onResetPlaceholderImage={handleResetPlaceholderImage}
                  onMoveElementForward={handleMoveElementForward}
                  onMoveElementBackward={handleMoveElementBackward}
                  onMoveElementToFront={handleMoveElementToFront}
                  onMoveElementToBack={handleMoveElementToBack}
                />
              }
              showPropertyPanel={showPropertyPanel}
            />
          </div>

          <div className="flex justify-between items-center p-2 border-t">
            <div className="flex items-center space-x-2">
              <div className="text-sm text-muted-foreground">
                Слайд {currentSlideIndex + 1} / {slides.length} {/* Перевел: "幻灯片" */}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPropertyPanel(!showPropertyPanel)}
                className={showPropertyPanel ? "bg-muted" : ""}
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center space-x-2">
              <SettingsDialog width={slideSize.width} height={slideSize.height} onSizeChange={handleSizeChange} />

              <BackgroundSettingsDialog
                background={currentSlide.background}
                onBackgroundChange={handleBackgroundChange}
              />

              <ImageUploadDialog onImageSelect={handleAddImage} />

              <ExportDialog
                slides={slides}
                slideSize={slideSize}
                title={presentationTitle}
                onTitleChange={setPresentationTitle}
              />

              <Button size="sm" onClick={() => setIsPreviewMode(true)}>
                <Play className="h-4 w-4 mr-2" />
                Презентация {/* Перевел: "演示" */}
              </Button>
            </div>
          </div>
        </>
      )}
      {showImportOverlay ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-xl">
            {importOverlayError ? (
              <>
                <h2 className="text-lg font-semibold">Не удалось импортировать проект</h2>
                <p className="mt-2 text-sm text-muted-foreground">{importOverlayError}</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button onClick={() => window.location.reload()}>Перезагрузить</Button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <h2 className="mt-4 text-lg font-semibold">Импортируем проект…</h2>
                <p className="mt-1 text-sm text-muted-foreground">Пожалуйста, подождите. Это может занять до минуты.</p>
              </>
            )}
          </div>
        </div>
      ) : null}
      {showSaveOverlay ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-xl">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <h2 className="mt-4 text-lg font-semibold">Сохраняем проект…</h2>
            <p className="mt-1 text-sm text-muted-foreground">Пожалуйста, подождите. Это может занять до минуты.</p>
          </div>
        </div>
      ) : null}
      <Toaster />
    </main>
  )
}
