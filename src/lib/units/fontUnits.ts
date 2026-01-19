const PX_PER_PT = 96 / 72

export function ptToPx(value: number): number {
  return value * PX_PER_PT
}

export function pxToPt(value: number): number {
  return value / PX_PER_PT
}

export function importerFontSizeToEditor(value: number, unit?: string): number {
  if (unit === "pt") {
    return ptToPx(value)
  }
  return value
}

export function editorFontSizeToImporter(value: number, unit?: string): number {
  if (unit === "pt") {
    return pxToPt(value)
  }
  return value
}
