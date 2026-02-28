export type ImagePlanSlot = {
  slotId: string
  slide: number
  element: number
  kind: string
  query: string
  hint: string | null
}

export type ImagePlan = {
  version: number
  slots: ImagePlanSlot[]
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
      kind: slot.kind,
      query: slot.query,
      hint: typeof slot.hint === "string" ? slot.hint : null,
    })
  }

  return {
    version: 1,
    slots,
  }
}

