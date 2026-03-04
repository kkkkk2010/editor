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

  it("falls back to topic + slide number + inferred aspect when no meta and no slot", () => {
    const context = buildImageSearchContext({
      selectedElement: baseImageElement,
      slideIndex: 2,
      elementIndex: 1,
      slide: baseSlide,
      projectMeta: { topic: "Космос" },
      imagePlan: { version: 1, slots: [] },
    })

    expect(context.query).toContain("Космос")
    expect(context.query).toContain("слайд 3")
    expect(context.aspect).toBe("landscape")
  })
})
