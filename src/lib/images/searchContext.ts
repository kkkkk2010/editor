import type { Element, Slide } from "@/lib/types"
import type { ImagePlan, ImagePlanSlot } from "@/src/lib/import/imagePlan"

export type SearchAspect = "portrait" | "landscape" | "square" | "any"
export type SearchKind = "hero" | "photo" | "icon" | "other"

export type ImageSearchContext = {
  query: string
  hint: string
  kind: SearchKind
  aspect: SearchAspect
  negative: string[]
  suggestedCount: number
  sourcePolicy: { mode: "user_confirmed"; requireSourceOpen: true }
  debug: { used: string[] }
}

type BuildImageSearchContextInput = {
  selectedElement: Element
  slideIndex: number
  elementIndex: number
  slide?: Slide
  projectMeta?: {
    topic?: string
    language?: string
  }
  imagePlan?: ImagePlan | null
}

const DEFAULT_NEGATIVE = ["watermark", "nsfw", "lowres", "logo", "text"]

function trimWords(input: string, maxWords: number) {
  return input
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join(" ")
}

function findSlot(input: BuildImageSearchContextInput): ImagePlanSlot | null {
  const slots = input.imagePlan?.slots
  if (!slots?.length) return null

  const byElementId = slots.find((slot) => slot.elementId && slot.elementId === input.selectedElement.id)
  if (byElementId) return byElementId

  return slots.find((slot) => slot.slide === input.slideIndex + 1 && slot.element === input.elementIndex) ?? null
}

function inferAspect(element: Element): SearchAspect {
  const width = element.size.width
  const height = element.size.height
  if (!width || !height) return "any"
  const ratio = width / height
  if (ratio > 1.2) return "landscape"
  if (ratio < 0.8) return "portrait"
  return "square"
}

function inferKind(element: Element): SearchKind {
  const area = Math.max(1, element.size.width * element.size.height)
  if (area >= 200_000) return "hero"
  if (area <= 25_000) return "icon"
  return "photo"
}

function getSlideContext(slide?: Slide) {
  if (!slide) return ""
  const largestText = slide.elements
    .filter((element) => element.type === "text")
    .map((element) => ({ element, area: element.size.width * element.size.height }))
    .sort((a, b) => b.area - a.area)[0]?.element

  return largestText ? trimWords(largestText.content.replace(/\s+/g, " "), 12) : ""
}

function normalizeText(value: string | null | undefined) {
  return (value || "").trim()
}

export function buildImageSearchContext(input: BuildImageSearchContextInput): ImageSearchContext {
  const used: string[] = []
  const slot = findSlot(input)
  const metaSearch = input.selectedElement.meta?.search

  const fallbackKind = inferKind(input.selectedElement)
  const fallbackAspect = inferAspect(input.selectedElement)
  const fallbackTopic = normalizeText(input.projectMeta?.topic) || normalizeText(input.imagePlan?.topic) || "Изображение"
  const slideContext = getSlideContext(input.slide)
  const slideNumber = input.slideIndex + 1

  const fallbackQuery = `${fallbackTopic}${slideContext ? ` — ${slideContext}` : ""} (слайд ${slideNumber})`
  const fallbackHint = `Подбор изображения для слайда ${slideNumber}`

  const query = normalizeText(metaSearch?.query) || normalizeText(slot?.query) || fallbackQuery
  if (normalizeText(metaSearch?.query)) used.push("element.meta.search.query")
  else if (normalizeText(slot?.query)) used.push("imagePlan.slot.query")
  else used.push("fallback.query")

  const hint = normalizeText(slot?.hint) || fallbackHint
  used.push(normalizeText(slot?.hint) ? "imagePlan.slot.hint" : "fallback.hint")

  const slotKind = normalizeText(slot?.kind)
  const kind =
    (normalizeText(metaSearch?.kind) as SearchKind) ||
    (slotKind === "hero" || slotKind === "photo" || slotKind === "icon" || slotKind === "other"
      ? (slotKind as SearchKind)
      : fallbackKind)

  const slotAspect = slot?.aspect
  const aspect =
    (normalizeText(metaSearch?.aspect) as SearchAspect) ||
    (slotAspect === "portrait" || slotAspect === "landscape" || slotAspect === "square" || slotAspect === "any"
      ? slotAspect
      : fallbackAspect)

  const negative =
    Array.isArray(metaSearch?.negative) && metaSearch.negative.length > 0
      ? metaSearch.negative
      : Array.isArray(slot?.negative) && slot.negative.length > 0
        ? slot.negative
        : DEFAULT_NEGATIVE

  if (Array.isArray(metaSearch?.negative) && metaSearch.negative.length > 0) used.push("element.meta.search.negative")
  else if (Array.isArray(slot?.negative) && slot.negative.length > 0) used.push("imagePlan.slot.negative")
  else used.push("fallback.negative")

  return {
    query,
    hint,
    kind,
    aspect,
    negative,
    suggestedCount: 8,
    sourcePolicy: { mode: "user_confirmed", requireSourceOpen: true },
    debug: { used },
  }
}
