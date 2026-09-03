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
  return slide.elements
    .filter((element) => element.type === "text")
    .map((element) => ({ element, area: element.size.width * element.size.height }))
    .sort((a, b) => b.area - a.area)
    .slice(0, 8)
    .map(({ element }) => element.content.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
}

function normalizeText(value: string | null | undefined) {
  return (value || "").trim()
}

function isRussianLanguage(value: string | null | undefined) {
  return normalizeText(value).toLowerCase().split(/[-_]/)[0] === "ru"
}

function isRussianQuery(value: string) {
  return /[А-Яа-яЁё]/.test(value) && !/[A-Za-z]/.test(value)
}

const GENERIC_TOPIC_PATTERN = /^(изображение|презентация|новая презентация|без названия|тема)$/i
const GENERIC_QUERY_WORDS = new Set([
  "изображение", "презентация", "слайд", "тема", "урок", "проверка", "знаний", "вопрос", "вопросы",
  "ответ", "ответы", "главное", "итог", "итоги", "вывод", "выводы", "информация", "фото",
  "и", "в", "на", "по", "для", "что", "это", "как", "при", "или", "из", "про", "его", "ее", "их",
])

function meaningfulRussianWords(value: string, limit: number) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const word of value
    .replace(/[^А-Яа-яЁё0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)) {
    const normalized = word.toLowerCase()
    if (word.length < 3 || GENERIC_QUERY_WORDS.has(normalized) || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(word)
    if (result.length >= limit) break
  }
  return result
}

function isLowQualityQuery(value: string) {
  return meaningfulRussianWords(value, 12).length < 3
}

function chooseTopic(projectTopic: string, imagePlanTopic: string, slideContext: string) {
  const candidates = [imagePlanTopic, projectTopic]
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate)
    if (normalized && !GENERIC_TOPIC_PATTERN.test(normalized)) return normalized
  }
  return meaningfulRussianWords(slideContext, 3).join(" ") || "учебный материал"
}

function buildLocalizedFallbackQuery(topic: string, slideContext: string, language?: string, semanticHint = "") {
  if (!isRussianLanguage(language)) {
    return trimWords(`${topic} ${slideContext}`, 12)
  }

  const topicWords = meaningfulRussianWords(topic, 4)
  const detailWords = meaningfulRussianWords(slideContext, 5)
    .filter((word) => !topicWords.some((topicWord) => topicWord.toLowerCase() === word.toLowerCase()))
  const roleText = `${slideContext} ${semanticHint}`.toLowerCase()
  const quiz = /проверка знаний|задани|тест|викторин|quiz|student|pupil|taking a test|taking a quiz/.test(roleText)
  const scientific = /клет|митохондр|дыхани|атф|днк|биолог|молекул|атом|фотосинтез|организм|энерги/.test(`${topic} ${slideContext}`.toLowerCase())
  const chronology = /хронолог|таймлайн|этап|период|год|век/.test(roleText)

  const parts = quiz
    ? [
        "ученик",
        "решает",
        "тест",
        ...topicWords,
        scientific
          ? "биология"
          : /истори|век|войн|импери/.test(`${topic} ${slideContext}`.toLowerCase())
            ? "история"
            : /литератур|поэт|писател|роман/.test(`${topic} ${slideContext}`.toLowerCase())
              ? "литература"
              : "школа",
        "класс",
      ]
    : scientific
      ? [...topicWords, ...detailWords.slice(0, 4), "научная", "иллюстрация"]
      : chronology
        ? [...topicWords, ...detailWords.slice(0, 4), "архивная", "фотография"]
        : [...topicWords, ...detailWords.slice(0, 4), "тематическая", "фотография"]

  return [...new Map(parts.filter(Boolean).map((word) => [word.toLowerCase(), word])).values()]
    .slice(0, 11)
    .join(" ")
}

export function buildImageSearchContext(input: BuildImageSearchContextInput): ImageSearchContext {
  const used: string[] = []
  const slot = findSlot(input)
  const metaSearch = input.selectedElement.meta?.search

  const fallbackKind = inferKind(input.selectedElement)
  const fallbackAspect = inferAspect(input.selectedElement)
  const slideContext = getSlideContext(input.slide)
  const slideNumber = input.slideIndex + 1
  const language = normalizeText(input.projectMeta?.language) || normalizeText(input.imagePlan?.language)
  const fallbackTopic = chooseTopic(normalizeText(input.projectMeta?.topic), normalizeText(input.imagePlan?.topic), slideContext)

  const fallbackQuery = buildLocalizedFallbackQuery(fallbackTopic, slideContext, language, `${slot?.hint || ""} ${slot?.query || ""}`)
  const fallbackHint = `Подбор изображения для слайда ${slideNumber}`

  const plannedQuery = normalizeText(metaSearch?.query) || normalizeText(slot?.query)
  const hasCompletedSearch = Boolean(metaSearch?.requestUsedAt)
  const queryLanguageMismatch = Boolean(plannedQuery) && isRussianLanguage(language) && !isRussianQuery(plannedQuery)
  const queryQualityMismatch = Boolean(plannedQuery) && isRussianLanguage(language) && !hasCompletedSearch && isLowQualityQuery(plannedQuery)
  const query = queryLanguageMismatch || queryQualityMismatch ? fallbackQuery : plannedQuery || fallbackQuery
  if (queryLanguageMismatch) used.push("fallback.query.language")
  else if (queryQualityMismatch) used.push("fallback.query.quality")
  else if (normalizeText(metaSearch?.query)) used.push("element.meta.search.query")
  else if (normalizeText(slot?.query)) used.push("imagePlan.slot.query")
  else used.push("fallback.query")

  const plannedHint = normalizeText(slot?.hint)
  const localizedHint = `Сюжет для поиска: ${query}`
  const hint = plannedHint && (!isRussianLanguage(language) || isRussianQuery(plannedHint)) ? plannedHint : localizedHint || fallbackHint
  used.push(hint === plannedHint ? "imagePlan.slot.hint" : "fallback.hint.language")

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
