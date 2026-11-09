// Chart colours. Categorical slots follow the validated order of the data
// visualisation palette (adjacent slots stay apart for colour-blind readers).
// Colour follows the entity, never its rank: a station keeps its colour in every
// chart, whatever else is switched on or off.

export const SERIES_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#6250d6', // violet
  '#e34948', // red
] as const

export const MAX_SERIES = SERIES_COLORS.length

export function seriesColor(index: number): string {
  return SERIES_COLORS[((index % MAX_SERIES) + MAX_SERIES) % MAX_SERIES]
}

// One-hue ramp for magnitude (light = little, dark = a lot).
export const SEQUENTIAL = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
] as const

export const DIVERGING = {
  negative: '#2a78d6', // blue
  neutral: '#f0efec',
  positive: '#e34948', // red
} as const

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a)
  const [br, bg, bb] = channels(b)
  const part = (x: number, y: number) =>
    Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  return `#${part(ar, br)}${part(ag, bg)}${part(ab, bb)}`
}

// Sequential colour for t in 0..1 (clamped), interpolated along the ramp.
export function rampColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0))
  const position = clamped * (SEQUENTIAL.length - 1)
  const lower = Math.floor(position)
  const upper = Math.min(SEQUENTIAL.length - 1, lower + 1)
  return mixHex(SEQUENTIAL[lower], SEQUENTIAL[upper], position - lower)
}

// Diverging colour for v in -1..1: blue for negative, neutral at 0, red for positive.
export function divergingColor(v: number): string {
  const clamped = Math.min(1, Math.max(-1, Number.isFinite(v) ? v : 0))
  return clamped < 0
    ? mixHex(DIVERGING.neutral, DIVERGING.negative, -clamped)
    : mixHex(DIVERGING.neutral, DIVERGING.positive, clamped)
}

// Text colour with enough contrast on a given background.
export function textOn(background: string): string {
  const [r, g, b] = channels(background).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.35 ? '#0f172a' : '#ffffff'
}
