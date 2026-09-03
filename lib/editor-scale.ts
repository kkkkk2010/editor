export type EditorScaleInput = {
  containerWidth: number
  containerHeight: number
  slideWidth: number
  slideHeight: number
  padding?: number
  minScale?: number
  maxScale?: number
}

export const calculateEditorScale = ({
  containerWidth,
  containerHeight,
  slideWidth,
  slideHeight,
  padding = 32,
  minScale = 0.05,
  maxScale = 1.2,
}: EditorScaleInput): number | null => {
  if (containerWidth <= 0 || containerHeight <= 0 || slideWidth <= 0 || slideHeight <= 0) {
    return null
  }

  const availableWidth = containerWidth - padding
  const availableHeight = containerHeight - padding
  if (availableWidth <= 0 || availableHeight <= 0) return null

  return Math.max(
    minScale,
    Math.min(availableWidth / slideWidth, availableHeight / slideHeight, maxScale),
  )
}
