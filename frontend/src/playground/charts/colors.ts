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
