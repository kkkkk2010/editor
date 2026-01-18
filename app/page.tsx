"use client"

import { useCallback, useMemo, useRef, useState, useEffect } from "react"
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
import { type Slide, type Element, defaultSlides, defaultSlideSize, type SlideSize, type Background } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Play, PanelRight } from "lucide-react"
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/hooks/use-toast"
import type { ImportResult } from "@/src/lib/import/importerDoc"
import { revokeImportObjectUrls } from "@/src/lib/import/zipImport"

type EditorState = {
  slides: Slide[]
  currentSlideIndex: number
  selectedElementId: string | null
}

type HistoryMeta = {
  type?: string
  reason?: string
}

const MAX_HISTORY = 100

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
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
  const [history, setHistory] = useState(() => ({
    past: [] as EditorState[],
    present: {
      slides: defaultSlides,
      currentSlideIndex: 0,
      selectedElementId: null,
    },
    future: [] as EditorState[],
  }))
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [slideSize, setSlideSize] = useState<SlideSize>(defaultSlideSize)
  const [showPropertyPanel, setShowPropertyPanel] = useState(false)
  const [presentationTitle, setPresentationTitle] = useState("Презентация") // Перевел: "flowmix多模态产品系列"
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [editorScale, setEditorScale] = useState(1)
  const importedAssetUrlsRef = useRef<string[]>([])
  const { toast } = useToast()
  const presentRef = useRef(history.present)
  const transformSnapshotRef = useRef<EditorState | null>(null)
  const transformDirtyRef = useRef(false)
  const textEditSnapshotRef = useRef<EditorState | null>(null)
  const textEditElementIdRef = useRef<string | null>(null)
  const textEditOriginalTextRef = useRef<string | null>(null)

  const present = history.present
  const slides = present.slides
  const currentSlideIndex = present.currentSlideIndex
  const selectedElementId = present.selectedElementId
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  useEffect(() => {
    presentRef.current = present
  }, [present])

  const currentSlide = slides[currentSlideIndex]
  const selectedElement = useMemo(() => {
    if (!selectedElementId) return null
    return currentSlide?.elements.find((el) => el.id === selectedElementId) ?? null
  }, [currentSlide, selectedElementId])

  useEffect(() => {
    if (selectedElementId && !selectedElement) {
      setPresent((state) => ({ ...state, selectedElementId: null }))
    }
  }, [selectedElementId, selectedElement])

  const setPresent = (updater: EditorState | ((state: EditorState) => EditorState)) => {
    setHistory((state) => {
      const next = typeof updater === "function" ? updater(state.present) : updater
      if (isSameState(state.present, next)) {
        return state
      }
      return { ...state, present: next }
    })
  }

  const commit = (next: EditorState, _meta?: HistoryMeta) => {
    setHistory((state) => {
      if (isSameState(state.present, next)) {
        return state
      }
      const past = [...state.past, state.present]
      const trimmedPast = past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past
      return { past: trimmedPast, present: next, future: [] }
    })
  }

  const commitFromSnapshot = (snapshot: EditorState, _meta?: HistoryMeta) => {
    setHistory((state) => {
      const next = state.present
      if (isSameState(snapshot, next)) {
        return state
      }
      const past = [...state.past, snapshot]
      const trimmedPast = past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past
      return { past: trimmedPast, present: next, future: [] }
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
      return { past, present: previous, future }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory((state) => {
      if (state.future.length === 0) return state
      const next = state.future[0]
      const future = state.future.slice(1)
      const past = [...state.past, state.present]
      return { past, present: next, future }
    })
  }, [])

  useEffect(() => {
    const handleHistoryShortcuts = (event: KeyboardEvent) => {
      const activeElement = document.activeElement
      const isInputElement =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.isContentEditable

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
        type: "gradient",
        value: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
      },
      elements: [
        {
          id: createId("text"),
          type: "text",
          content: "Новый слайд", // Перевел: "新幻灯片"
          position: { x: slideSize.width / 2 - 200, y: slideSize.height / 2 - 40 },
          size: { width: 400, height: 80 },
          style: {
            fontSize: 48,
            fontWeight: "bold",
            color: "#ffffff",
            textAlign: "center",
          },
        },
      ],
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

  const removeSlide = (index: number) => {
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
  }

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
      const isEditingText =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.isContentEditable

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
    updatedElements[elementIndex] = updatedElement

    const updatedSlides = [...slides]
    updatedSlides[currentSlideIndex] = {
      ...slide,
      elements: updatedElements,
    }

    commit(
      {
        slides: updatedSlides,
        currentSlideIndex,
        selectedElementId: updatedElement.id,
      },
      { type: "element", reason: "update" },
    )
  }

  const handleElementSelect = (element: Element | null) => {
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

  const handleAddImage = (imageUrl: string) => {
    const newElement: Element = {
      id: createId("image"),
      type: "image",
      content: imageUrl,
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
        fontSize: 24,
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
    setSlideSize(result.slideSize)
    commit(
      {
        slides: result.slides,
        currentSlideIndex: 0,
        selectedElementId: null,
      },
      { type: "document", reason: "import" },
    )
    setShowPropertyPanel(false)
  }

  const handleImportZip = (result: ImportResult, createdUrls: string[]) => {
    revokeImportObjectUrls(importedAssetUrlsRef.current)
    importedAssetUrlsRef.current = createdUrls
    handleImport(result)
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
      {isPreviewMode ? (
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
            onImportZip={handleImportZip}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
          />

          <div className="flex-1 overflow-hidden">
            <EditorLayout
              sidebar={
                <Sidebar
                  slides={slides}
                  currentSlideIndex={currentSlideIndex}
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
                  onUpdateElement={updateElement}
                  onClose={() => setShowPropertyPanel(false)}
                  currentSlide={currentSlide}
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
      <Toaster />
    </main>
  )
}
