export function normalizeFontFamily(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const firstFamily = trimmed.split(",")[0]?.trim()
  if (!firstFamily) return undefined

  return firstFamily.replace(/^["'](.+(?=["']$))["']$/, "$1")
}
