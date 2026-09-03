export const MAX_PRESENTATION_TITLE_LENGTH = 200

export function clampPresentationTitle(value: string) {
  return String(value).slice(0, MAX_PRESENTATION_TITLE_LENGTH)
}

export function validatePresentationTitle(value: string) {
  const title = String(value).trim()
  if (!title) throw new Error("Presentation title is required")
  if (title.length > MAX_PRESENTATION_TITLE_LENGTH) {
    throw new Error(`Presentation title must not exceed ${MAX_PRESENTATION_TITLE_LENGTH} characters`)
  }
  return title
}
