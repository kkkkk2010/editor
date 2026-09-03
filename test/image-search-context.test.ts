import { describe, expect, it } from "vitest"
import { buildImageSearchContext } from "@/src/lib/images/searchContext"
import type { Element, Slide } from "@/lib/types"
import type { ImagePlan } from "@/src/lib/import/imagePlan"

const baseImageElement: Element = {
  id: "img-1",
  type: "image",
  content: "https://example.com/image.jpg",
  position: { x: 10, y: 10 },
  size: { width: 400, height: 200 },
  style: {},
}

const baseSlide: Slide = {
  id: "slide-1",
  background: { type: "color", value: "#fff" },
  elements: [
    {
      id: "txt-1",
      type: "text",
      content: "Очень важный заголовок про биологию и эволюцию для школьного урока",
      position: { x: 0, y: 0 },
      size: { width: 800, height: 120 },
      style: {},
    },
    baseImageElement,
  ],
}

describe("buildImageSearchContext", () => {
  it("prefers element.meta.search.query over slot.query", () => {
    const imagePlan: ImagePlan = {
      version: 1,
      slots: [
        {
          slotId: "s1",
          slide: 1,
          element: 1,
          kind: "photo",
          query: "query from slot",
          hint: "slot hint",
        },
      ],
    }

    const context = buildImageSearchContext({
      selectedElement: {
        ...baseImageElement,
        meta: { search: { query: "query from meta" } },
      },
      slideIndex: 0,
      elementIndex: 1,
      slide: baseSlide,
      imagePlan,
    })

    expect(context.query).toBe("query from meta")
  })

  it("uses slot.query when meta.search.query is absent", () => {
    const imagePlan: ImagePlan = {
      version: 1,
      slots: [
        {
          slotId: "s1",
          slide: 1,
          element: 1,
          kind: "photo",
          query: "slot query wins",
          hint: "slot hint",
          aspect: "portrait",
        },
      ],
    }

    const context = buildImageSearchContext({
      selectedElement: baseImageElement,
      slideIndex: 0,
      elementIndex: 1,
      slide: baseSlide,
      imagePlan,
    })

    expect(context.query).toBe("slot query wins")
    expect(context.aspect).toBe("portrait")
  })

  it("replaces an English generated query with Russian slide context for a Russian presentation", () => {
    const imagePlan: ImagePlan = {
      version: 1,
      language: "ru",
      topic: "Клеточное дыхание",
      slots: [
        {
          slotId: "s1",
          slide: 1,
          element: 1,
          kind: "photo",
          query: "cellular respiration mitochondria diagram",
          hint: "A student taking a quiz, with mitochondria and respiration symbols",
        },
      ],
    }

    const context = buildImageSearchContext({
      selectedElement: baseImageElement,
      slideIndex: 0,
      elementIndex: 1,
      slide: baseSlide,
      projectMeta: { topic: "Презентация", language: "ru" },
      imagePlan,
    })

    expect(context.query).toMatch(/[А-Яа-яЁё]/)
    expect(context.query).not.toMatch(/[A-Za-z]/)
    expect(context.query).toContain("ученик решает тест")
    expect(context.query).toContain("Клеточное дыхание")
    expect(context.query).toContain("биология класс")
    expect(context.query).not.toContain("Презентация")
    expect(context.hint).toBe(`Сюжет для поиска: ${context.query}`)
    expect(context.debug.used).toContain("fallback.query.language")
  })

  it("keeps a Russian generated query for a Russian presentation", () => {
    const imagePlan: ImagePlan = {
      version: 1,
      language: "ru",
      slots: [
        {
          slotId: "s1",
          slide: 1,
          element: 1,
          kind: "photo",
          query: "митохондрия клеточное дыхание схема",
          hint: "slot hint",
        },
      ],
    }

    const context = buildImageSearchContext({
      selectedElement: baseImageElement,
      slideIndex: 0,
      elementIndex: 1,
      slide: baseSlide,
      projectMeta: { language: "ru" },
      imagePlan,
    })

    expect(context.query).toBe("митохондрия клеточное дыхание схема")
    expect(context.debug.used).toContain("imagePlan.slot.query")
  })

  it("replaces a generic Russian query before it can be sent to search", () => {
    const imagePlan: ImagePlan = {
      version: 1,
      language: "ru",
      topic: "Клеточное дыхание",
      slots: [
        {
          slotId: "s1",
          slide: 1,
          element: 1,
          kind: "photo",
          query: "Презентация Проверка знаний фото",
          hint: "Ученик выполняет тест по биологии",
        },
      ],
    }

    const context = buildImageSearchContext({
      selectedElement: baseImageElement,
      slideIndex: 0,
      elementIndex: 1,
      slide: baseSlide,
      projectMeta: { topic: "Презентация", language: "ru" },
      imagePlan,
    })

    expect(context.query).not.toContain("Презентация")
    expect(context.query).not.toContain("Проверка знаний")
    expect(context.query).toContain("Клеточное дыхание")
    expect(context.debug.used).toContain("fallback.query.quality")
  })

  it("falls back to topic + concrete slide context without search-noise words", () => {
    const context = buildImageSearchContext({
      selectedElement: baseImageElement,
      slideIndex: 2,
      elementIndex: 1,
      slide: baseSlide,
      projectMeta: { topic: "Космос" },
      imagePlan: { version: 1, slots: [] },
    })

    expect(context.query).toContain("Космос")
    expect(context.query).toContain("биологию")
    expect(context.query).not.toContain("слайд")
    expect(context.query).not.toContain("презентация")
    expect(context.aspect).toBe("landscape")
  })
})
