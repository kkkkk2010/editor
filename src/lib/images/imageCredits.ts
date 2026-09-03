export type ImageCreditItem = {
  src: string
  slot: {
    slotId: string
    slide: number
    element: number
  }
  pageUrl: string
  imageUrl: string
  licenseLabel?: string
  licenseUrl?: string
  source?: string
  confirmedAt: string
}

const MAX_CREDIT_ITEMS = 2_000

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function isSafeAssetPath(value: string) {
  return Boolean(value) && !/^(?:[a-z]+:|[\\/])/i.test(value) && !value.includes("..")
}

function parseCreditItem(value: unknown): ImageCreditItem | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  const slot = item.slot && typeof item.slot === "object" ? (item.slot as Record<string, unknown>) : null
  const src = optionalString(item.src)
  const pageUrl = optionalString(item.pageUrl)
  const imageUrl = optionalString(item.imageUrl)
  const confirmedAt = optionalString(item.confirmedAt)
  const slotId = optionalString(slot?.slotId)
  const slide = slot?.slide
  const element = slot?.element

  if (
    !src ||
    !isSafeAssetPath(src) ||
    !pageUrl ||
    !imageUrl ||
    !confirmedAt ||
    !slotId ||
    typeof slide !== "number" ||
    !Number.isInteger(slide) ||
    slide < 1 ||
    typeof element !== "number" ||
    !Number.isInteger(element) ||
    element < 0
  ) {
    return null
  }

  return {
    src,
    slot: {
      slotId,
      slide,
      element,
    },
    pageUrl,
    imageUrl,
    licenseLabel: optionalString(item.licenseLabel),
    licenseUrl: optionalString(item.licenseUrl),
    source: optionalString(item.source),
    confirmedAt,
  }
}

export function parseImageCredits(value: unknown): ImageCreditItem[] {
  if (!value || typeof value !== "object") return []
  const document = value as { version?: unknown; items?: unknown }
  if (document.version !== 1 || !Array.isArray(document.items)) return []

  return document.items
    .slice(0, MAX_CREDIT_ITEMS)
    .map(parseCreditItem)
    .filter((item): item is ImageCreditItem => item !== null)
}
