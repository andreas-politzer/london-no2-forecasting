import type { Engine } from '../adapter'
import type { Thresholds } from '../data'
import { assignGroups, dayIndex, selectDays } from '../engine'
import type { DaySelection, Grouping, NumericVariable, Range } from '../state'

// Highlighting versus filtering
//   The FILTER (DaySelection) decides which days are analysed. It is saved and
//   shared, and it is what every "n" in the charts refers to.
//   A HIGHLIGHT marks days inside the filter (a clicked group, a brushed time
//   span, a brushed area). It is transient, never changes any n and is not
//   saved. It only becomes a filter when the user says so explicitly
//   (highlightToSelection), and only if the days can be described exactly.

export type Highlight =
  | { kind: 'period'; from: string; to: string }
  | { kind: 'ranges'; ranges: Partial<Record<NumericVariable, Range>> }
  | { kind: 'groups'; grouping: Grouping; keys: string[] }

// Intersection of two ranges (null = open end). The result may be empty (lo > hi).
export function intersectRange(a: Range, b: Range): Range {
  const lo = a[0] === null ? b[0] : b[0] === null ? a[0] : Math.max(a[0], b[0])
  const hi = a[1] === null ? b[1] : b[1] === null ? a[1] : Math.min(a[1], b[1])
  return [lo, hi]
}

export function mergeRanges(
  current: DaySelection['ranges'],
  extra: DaySelection['ranges'],
): DaySelection['ranges'] {
  const out: DaySelection['ranges'] = { ...current }
  for (const [key, value] of Object.entries(extra)) {
    const variable = key as NumericVariable
    if (!value) continue
    const existing = out[variable]
    out[variable] = existing ? intersectRange(existing, value) : value
  }
  return out
}

// The days of the highlight, always inside the filter.
export function highlightMask(
  engine: Engine,
  selection: DaySelection,
  stations: string[],
  highlight: Highlight,
): boolean[] {
  const base = selectDays(engine.input, selection, stations, engine.axis)
  switch (highlight.kind) {
    case 'period': {
      const from = dayIndex(engine.input.firstDay, highlight.from)
      const to = dayIndex(engine.input.firstDay, highlight.to)
      return base.map((on, i) => on && i >= from && i <= to)
    }
    case 'ranges': {
      const merged = { ...selection, ranges: mergeRanges(selection.ranges, highlight.ranges) }
      return selectDays(engine.input, merged, stations, engine.axis)
    }
    case 'groups': {
      const { keys, of } = assignGroups(engine.input, engine.axis, highlight.grouping)
      const wanted = new Set<number>()
      keys.forEach((key, index) => {
        if (highlight.keys.includes(key)) wanted.add(index)
      })
      return base.map((on, i) => on && wanted.has(of[i]))
    }
  }
}

const SEASON_MONTHS: Record<string, number[]> = {
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
}

const numbersOf = (keys: string[]) =>
  keys.map(Number).filter((value) => Number.isInteger(value))

// Keeps only what the current list allows; null when nothing is left.
function narrow(current: number[] | null, wanted: number[]): number[] | null {
  const sorted = [...new Set(wanted)].sort((a, b) => a - b)
  const out = current === null ? sorted : current.filter((value) => sorted.includes(value))
  return out.length === 0 ? null : out
}

function withRange(
  selection: DaySelection,
  variable: NumericVariable,
  range: Range,
): DaySelection {
  const existing = selection.ranges[variable]
  return {
    ...selection,
    ranges: { ...selection.ranges, [variable]: existing ? intersectRange(existing, range) : range },
  }
}

function groupsToSelection(
  selection: DaySelection,
  grouping: Grouping,
  keys: string[],
  th: Thresholds,
): DaySelection | null {
  if (keys.length === 0) return null
  switch (grouping) {
    case 'season': {
      const months = narrow(selection.months, keys.flatMap((k) => SEASON_MONTHS[k] ?? []))
      return months ? { ...selection, months } : null
    }
    case 'month': {
      const months = narrow(selection.months, numbersOf(keys).filter((m) => m >= 1 && m <= 12))
      return months ? { ...selection, months } : null
    }
    case 'weekday': {
      const weekdays = narrow(selection.weekdays, numbersOf(keys).filter((d) => d >= 0 && d <= 6))
      return weekdays ? { ...selection, weekdays } : null
    }
    case 'corona': {
      const corona = narrow(selection.corona, numbersOf(keys).filter((k) => k >= 0 && k <= 2))
      return corona ? { ...selection, corona } : null
    }
    case 'ulez': {
      const ulez = narrow(selection.ulez, numbersOf(keys).filter((k) => k >= 0 && k <= 3))
      return ulez ? { ...selection, ulez } : null
    }
    case 'windSector': {
      const sectors = narrow(selection.windSectors, numbersOf(keys).filter((k) => k >= 0 && k <= 7))
      return sectors ? { ...selection, windSectors: sectors } : null
    }
    case 'windClass':
      if (keys.length !== 1) return null
      if (keys[0] === 'calm') {
        return withRange(selection, 'wind_speed_10m_mean', [null, th.wind_calm_max_kmh])
      }
      if (keys[0] === 'windy') {
        return withRange(selection, 'wind_speed_10m_mean', [th.wind_windy_min_kmh, null])
      }
      return null
    case 'rainClass':
      return keys.length === 1 && keys[0] === 'veryWet'
        ? withRange(selection, 'precipitation_sum', [th.rain_very_wet_min_mm, null])
        : null
    case 'snowDay':
      return keys.length === 1 && keys[0] === 'snow'
        ? withRange(selection, 'snowfall_sum', [th.snow_day_min_cm, null])
        : null
    case 'dayType': {
      const workday = keys.includes('workday')
      const weekend = keys.includes('weekend')
      const bank = keys.includes('bankHoliday')
      if (bank) {
        if (workday || weekend || selection.holiday === 'exclude') return null
        return { ...selection, holiday: 'only' }
      }
      if (selection.holiday === 'only') return null
      if (workday && weekend) return { ...selection, holiday: 'exclude' }
      if (workday || weekend) {
        const weekdays = narrow(selection.weekdays, workday ? [0, 1, 2, 3, 4] : [5, 6])
        return weekdays ? { ...selection, weekdays, holiday: 'exclude' } : null
      }
      return null
    }
    case 'year': {
      const years = numbersOf(keys).sort((a, b) => a - b)
      if (years.length === 0) return null
      for (let i = 1; i < years.length; i += 1) {
        if (years[i] !== years[i - 1] + 1) return null // not one block of years
      }
      return withPeriod(selection, `${years[0]}-01-01`, `${years[years.length - 1]}-12-31`)
    }
    case 'temperatureClass': // the classes use "below"/"above" (strict): not exact as a range
    case 'none':
      return null
  }
}

function withPeriod(selection: DaySelection, from: string, to: string): DaySelection | null {
  const start = from > selection.period[0] ? from : selection.period[0]
  const end = to < selection.period[1] ? to : selection.period[1]
  return start > end ? null : { ...selection, period: [start, end] }
}

// The highlight as a filter, or null when the days cannot be described exactly
// (or nothing would be left). Whenever a selection is returned, selecting with
// it gives exactly the highlighted days (tested).
export function highlightToSelection(
  selection: DaySelection,
  highlight: Highlight,
  thresholds: Thresholds,
): DaySelection | null {
  switch (highlight.kind) {
    case 'period':
      return withPeriod(selection, highlight.from, highlight.to)
    case 'ranges':
      return { ...selection, ranges: mergeRanges(selection.ranges, highlight.ranges) }
    case 'groups':
      return groupsToSelection(selection, highlight.grouping, highlight.keys, thresholds)
  }
}

// A click on a group: replaces the marked groups, or (additive, e.g. with the
// shift key) adds or removes one. Clicking the only marked group clears it.
export function toggleGroupHighlight(
  current: Highlight | null,
  grouping: Grouping,
  key: string,
  additive: boolean,
): Highlight | null {
  if (grouping === 'none') return current
  const marked =
    current?.kind === 'groups' && current.grouping === grouping ? current.keys : []
  let next: string[]
  if (additive) {
    next = marked.includes(key) ? marked.filter((k) => k !== key) : [...marked, key]
  } else {
    next = marked.length === 1 && marked[0] === key ? [] : [key]
  }
  return next.length === 0 ? null : { kind: 'groups', grouping, keys: next }
}
