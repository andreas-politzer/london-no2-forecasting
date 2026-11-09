// Small helpers for hand-made SVG charts: scales, ticks, number format, paths.
// No React here, so everything is testable.

export type Scale = (value: number) => number

export function linearScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const span = d1 - d0
  return (value) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0))
}

// 1, 2, 5 times a power of ten, the usual "nice" step.
function niceStep(raw: number): number {
  const base = 10 ** Math.floor(Math.log10(raw))
  const f = raw / base
  const nice = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10
  return nice * base
}

function decimalsOf(step: number): number {
  return Math.min(10, Math.max(0, -Math.floor(Math.log10(step))))
}

export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!(max > min)) return [min]
  const step = niceStep((max - min) / target)
  const first = Math.ceil(min / step - 1e-9)
  const last = Math.floor(max / step + 1e-9)
  const decimals = decimalsOf(step)
  const ticks: number[] = []
  for (let k = first; k <= last; k += 1) ticks.push(Number((k * step).toFixed(decimals)))
  return ticks
}

// A domain that starts and ends on a tick.
export function niceDomain(min: number, max: number, target = 5): [number, number] {
  if (!(max > min)) return [min - 1, max + 1]
  const step = niceStep((max - min) / target)
  const decimals = decimalsOf(step)
  return [
    Number((Math.floor(min / step + 1e-9) * step).toFixed(decimals)),
    Number((Math.ceil(max / step - 1e-9) * step).toFixed(decimals)),
  ]
}

export type Band = { start: (index: number) => number; width: number; step: number }

// Equal slots for categories. width = the drawn part of a slot.
export function bandScale(count: number, r0: number, r1: number, padding = 0.2): Band {
  const step = count > 0 ? (r1 - r0) / count : 0
  const width = step * (1 - padding)
  return { start: (index) => r0 + index * step + (step - width) / 2, width, step }
}

const formatters = new Map<number, Intl.NumberFormat>()

// German number format: decimal comma, dot as thousands separator.
export function formatNumber(value: number, maxFractionDigits = 1): string {
  let formatter = formatters.get(maxFractionDigits)
  if (!formatter) {
    formatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: maxFractionDigits })
    formatters.set(maxFractionDigits, formatter)
  }
  return formatter.format(value)
}

// Fewer decimals for larger numbers.
export function formatValue(value: number): string {
  const size = Math.abs(value)
  return formatNumber(value, size >= 100 ? 0 : size >= 10 ? 1 : 2)
}

const round2 = (value: number) => Math.round(value * 100) / 100

// A line that is lifted at gaps (null values): no interpolation across a gap.
export function linePath(points: { x: number; y: number | null }[]): string {
  let path = ''
  let drawing = false
  for (const point of points) {
    if (point.y === null || !Number.isFinite(point.y)) {
      drawing = false
      continue
    }
    path += `${drawing ? 'L' : 'M'}${round2(point.x)} ${round2(point.y)}`
    drawing = true
  }
  return path
}

// A bar with rounded top corners, anchored at the baseline (y + height).
export function roundedTopBar(x: number, y: number, width: number, height: number, radius = 4): string {
  if (!(width > 0) || !(height > 0)) return ''
  const r = Math.min(radius, width / 2, height)
  const right = x + width
  const bottom = y + height
  return (
    `M${round2(x)} ${round2(bottom)}` +
    `V${round2(y + r)}` +
    `Q${round2(x)} ${round2(y)} ${round2(x + r)} ${round2(y)}` +
    `H${round2(right - r)}` +
    `Q${round2(right)} ${round2(y)} ${round2(right)} ${round2(y + r)}` +
    `V${round2(bottom)}Z`
  )
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
