export function normalizeFontFamily(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const families = trimmed
    .split(",")
    .map((family) => family.trim())
    .filter(Boolean)
    .map((family) => family.replace(/^["'](.+(?=["']$))["']$/, "$1"))
    .filter(Boolean)
  if (families.length === 0) return undefined

  const preferred = families.find((family) => family.toLowerCase() === "times new roman")
  return preferred ?? families[0]
}
