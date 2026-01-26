import { z } from "zod"

const finiteNumber = z.number().finite()

const textStyleSchema = z
  .object({
    fontFamily: z.string().optional(),
    fontSizePt: finiteNumber.min(6).max(200).optional(),
    fontSize: finiteNumber.min(1).max(400).optional(),
    color: z.string().optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    align: z.enum(["left", "center", "right", "justify"]).optional(),
    lineHeight: finiteNumber.optional(),
    letterSpacing: finiteNumber.optional(),
  })
  .passthrough()

const baseElementSchema = z.object({
  id: z.string(),
  x: finiteNumber,
  y: finiteNumber,
  width: finiteNumber.positive(),
  height: finiteNumber.positive(),
  rotation: finiteNumber.optional(),
})

const textElementSchema = baseElementSchema.extend({
  type: z.literal("text"),
  text: z.string(),
  style: textStyleSchema.optional(),
})

const imageElementSchema = baseElementSchema.extend({
  type: z.literal("image"),
  src: z.string(),
  objectFit: z.enum(["cover", "contain", "fill", "none", "scale-down"]).optional(),
})

const shapeStyleSchema = z
  .object({
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: finiteNumber.optional(),
    opacity: finiteNumber.optional(),
    cornerRadius: finiteNumber.optional(),
  })
  .passthrough()

const shapeElementSchema = baseElementSchema.extend({
  type: z.literal("shape"),
  shapeType: z.enum([
    "rect",
    "ellipse",
    "roundRect",
    "line",
    "arrow",
    "triangle",
    "star",
    "hexagon",
    "pentagon",
    "cloud",
  ]),
  style: shapeStyleSchema.optional(),
})

const backgroundSchema = z
  .object({
    type: z.literal("image"),
    src: z.string(),
  })
  .passthrough()

const slideSchema = z.object({
  id: z.string(),
  background: backgroundSchema.optional(),
  elements: z.array(z.union([textElementSchema, imageElementSchema, shapeElementSchema])),
})

const importerDocSchema = z.object({
  schemaVersion: z.literal(1),
  slideSize: z
    .object({
      width: finiteNumber.positive(),
      height: finiteNumber.positive(),
      unit: z.string(),
    })
    .optional(),
  slides: z.array(slideSchema),
})

const INVALID_ASSET_PREFIX = /^(blob:|data:|https?:|file:)/i
const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:[\\/]+/
const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "svg"])

function getExtension(path: string): string {
  const parts = path.split(".")
  if (parts.length < 2) return ""
  return parts[parts.length - 1].toLowerCase()
}

function isSafeAssetPath(path: string): boolean {
  if (!path) return false
  if (INVALID_ASSET_PREFIX.test(path)) return false
  if (path.startsWith("/") || path.startsWith("\\")) return false
  if (WINDOWS_DRIVE_PREFIX.test(path)) return false
  if (path.split(/[\\/]+/).some((segment) => segment === "..")) return false
  return true
}

export type ImporterDoc = z.infer<typeof importerDocSchema>

export type ImporterValidationResult =
  | { ok: true; data: ImporterDoc }
  | { ok: false; error: string }

export function validateImporterDoc(payload: unknown): ImporterValidationResult {
  const result = importerDocSchema.safeParse(payload)
  if (result.success) {
    for (const [slideIndex, slide] of result.data.slides.entries()) {
      if (slide.background?.type === "image") {
        const extension = getExtension(slide.background.src)
        if (!isSafeAssetPath(slide.background.src)) {
          return { ok: false, error: `slides.${slideIndex}.background.src: Небезопасный путь` }
        }
        if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
          return { ok: false, error: `slides.${slideIndex}.background.src: Недопустимое расширение` }
        }
      }

      for (const [elementIndex, element] of slide.elements.entries()) {
        if (element.type === "image") {
          const extension = getExtension(element.src)
          if (!isSafeAssetPath(element.src)) {
            return { ok: false, error: `slides.${slideIndex}.elements.${elementIndex}.src: Небезопасный путь` }
          }
          if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
            return {
              ok: false,
              error: `slides.${slideIndex}.elements.${elementIndex}.src: Недопустимое расширение`,
            }
          }
        }
      }
    }

    return { ok: true, data: result.data }
  }

  const errorMessage = result.error.errors
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "document"
      return `${path}: ${issue.message}`
    })
    .join("; ")

  return {
    ok: false,
    error: errorMessage || "Неверный формат JSON для импорта",
  }
}
