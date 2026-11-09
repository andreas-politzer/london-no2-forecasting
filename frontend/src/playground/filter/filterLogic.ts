import type { DaySelection, NumericVariable, Range } from '../state'

// Pure logic behind the filter panel (so the panel itself stays thin).

// A list filter where null means "all". Click on a chip while everything is
// active keeps only that one; further clicks add or remove; an empty list or a
// list with everything in it goes back to null.
export function toggleInList(
  list: number[] | null,
  value: number,
  universe: number[],
): number[] | null {
  if (list === null) return [value]
  const next = list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value].sort((a, b) => a - b)
  if (next.length === 0 || next.length === universe.length) return null
  return next
}

// "" -> null (open end), a number -> the number, anything else -> undefined
// (invalid). Accepts a decimal comma.
export function parseBound(text: string): number | null | undefined {
  const cleaned = text.trim().replace(',', '.')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : undefined
}

export function addRange(selection: DaySelection, variable: NumericVariable): DaySelection {
  if (selection.ranges[variable]) return selection
  return { ...selection, ranges: { ...selection.ranges, [variable]: [null, null] } }
}

export function removeRange(selection: DaySelection, variable: NumericVariable): DaySelection {
  const ranges = { ...selection.ranges }
  delete ranges[variable]
  return { ...selection, ranges }
}

// side 0 = lower bound, 1 = upper bound. An invalid text changes nothing.
export function setRangeBound(
  selection: DaySelection,
  variable: NumericVariable,
  side: 0 | 1,
  text: string,
): DaySelection {
  const bound = parseBound(text)
  if (bound === undefined) return selection
  const current: Range = selection.ranges[variable] ?? [null, null]
  const next: Range = side === 0 ? [bound, current[1]] : [current[0], bound]
  return { ...selection, ranges: { ...selection.ranges, [variable]: next } }
}

function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// side 0 = first day, 1 = last day. Invalid dates, dates outside the data and
// a first day after the last day change nothing.
export function setPeriodBound(
  selection: DaySelection,
  side: 0 | 1,
  value: string,
  limits: { first: string; last: string },
): DaySelection {
  if (!isDay(value) || value < limits.first || value > limits.last) return selection
  const period: [string, string] = side === 0 ? [value, selection.period[1]] : [selection.period[0], value]
  if (period[0] > period[1]) return selection
  return { ...selection, period }
}

export function countSelected(mask: boolean[]): number {
  return mask.reduce((sum, on) => sum + (on ? 1 : 0), 0)
}
