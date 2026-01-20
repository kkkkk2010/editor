import { z } from "zod"

const textStyleSchema = z
  .object({
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    color: z.string().optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    align: z.enum(["left", "center", "right", "justify"]).optional(),
    lineHeight: z.number().optional(),
    letterSpacing: z.number().optional(),
  })
  .passthrough()

const baseElementSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().optional(),
})

const textElementSchema = baseElementSchema.extend({
  type: z.literal("text"),
  text: z.string(),
  style: textStyleSchema.optional(),
})

const imageElementSchema = baseElementSchema.extend({
  type: z.literal("image"),
  src: z.string(),
  objectFit: z.string().optional(),
})

const shapeStyleSchema = z
  .object({
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    opacity: z.number().optional(),
    cornerRadius: z.number().optional(),
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
      width: z.number().positive(),
      height: z.number().positive(),
      unit: z.string(),
    })
    .optional(),
  slides: z.array(slideSchema),
})

export type ImporterDoc = z.infer<typeof importerDocSchema>

export type ImporterValidationResult =
  | { ok: true; data: ImporterDoc }
  | { ok: false; error: string }

export function validateImporterDoc(payload: unknown): ImporterValidationResult {
  const result = importerDocSchema.safeParse(payload)
  if (result.success) {
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
