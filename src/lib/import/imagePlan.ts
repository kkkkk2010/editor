export type ImagePlanSlot = {
  slotId: string
  slide: number
  element: number
  elementId?: string
  kind: string
  query: string
  hint: string | null
  aspect?: "portrait" | "landscape" | "square" | "any"
  negative?: string[]
  styleHint?: string
}

export type ImagePlanProjectMeta = {
  topic?: string
  language?: string
}

export type ImagePlan = {
  version: number
  slots: ImagePlanSlot[]
  topic?: string
  language?: string
}

export function parseImagePlan(raw: unknown): ImagePlan | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const candidate = raw as { version?: unknown; slots?: unknown }
  if (candidate.version !== 1 || !Array.isArray(candidate.slots)) {
    return null
  }

  const slots: ImagePlanSlot[] = []
  for (const item of candidate.slots) {
    if (!item || typeof item !== "object") continue
    const slot = item as Record<string, unknown>
    if (
      typeof slot.slotId !== "string" ||
      typeof slot.slide !== "number" ||
      typeof slot.element !== "number" ||
      typeof slot.kind !== "string" ||
      typeof slot.query !== "string"
    ) {
      continue
    }

    slots.push({
      slotId: slot.slotId,
      slide: slot.slide,
      element: slot.element,
      elementId: typeof slot.elementId === "string" ? slot.elementId : undefined,
      kind: slot.kind,
      query: slot.query,
      hint: typeof slot.hint === "string" ? slot.hint : null,
      aspect:
        slot.aspect === "portrait" || slot.aspect === "landscape" || slot.aspect === "square" || slot.aspect === "any"
          ? slot.aspect
          : undefined,
      negative: Array.isArray(slot.negative)
        ? slot.negative.filter((item): item is string => typeof item === "string")
        : undefined,
      styleHint: typeof slot.styleHint === "string" ? slot.styleHint : undefined,
    })
  }

  return {
    version: 1,
    slots,
    topic: typeof (candidate as { topic?: unknown }).topic === "string" ? (candidate as { topic?: string }).topic : undefined,
    language:
      typeof (candidate as { language?: unknown }).language === "string"
        ? (candidate as { language?: string }).language
        : undefined,
  }
}
