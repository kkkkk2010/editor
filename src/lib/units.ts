const PX_PER_PT = 96 / 72

export function ptToPx(value: number): number {
  return value * PX_PER_PT
}

export function pxToPt(value: number): number {
  return value / PX_PER_PT
}
