import type { ExperimentResult } from '../modelcore/experiment'
import type { MethodKeyName } from './expTypes'

// Pure helpers for the results of an experiment: dates, errors, tables, bins,
// axes. No React, so everything here is tested.

export type Done = Extract<ExperimentResult, { ok: true }>

const DAY_MS = 86_400_000

// ISO date of the day with this index (index 0 = the first day of the data).
export function isoOfDay(firstDay: string, index: number): string {
  const start = Date.parse(`${firstDay}T00:00:00Z`)
  return new Date(start + index * DAY_MS).toISOString().slice(0, 10)
}

export function germanDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

// Error = prediction minus measurement: above zero means too high.
export function errorsOf(predicted: ArrayLike<number>, actual: ArrayLike<number>): number[] {
  return Array.from({ length: actual.length }, (_, i) => predicted[i] - actual[i])
}

export type Histogram = { edges: number[]; counts: number[] }

// Equal-width bins on a range symmetric around zero, so the middle is visible.
export function histogram(values: number[], bins = 24): Histogram {
  const limit = Math.max(1e-9, ...values.map((v) => Math.abs(v)))
  const edges = Array.from({ length: bins + 1 }, (_, i) => -limit + (2 * limit * i) / bins)
  const counts = new Array<number>(bins).fill(0)
  for (const value of values) {
    const k = Math.min(bins - 1, Math.floor(((value + limit) / (2 * limit)) * bins))
    counts[k] += 1
  }
  return { edges, counts }
}

export type MethodKey = MethodKeyName

export type BelowZero = { count: number; total: number; lowest: number | null }

// Predictions below zero cannot be real NO2 values. They are counted and shown,
// never clipped: clipping would hide the problem and change the error figures.
export function belowZero(predicted: ArrayLike<number>): BelowZero {
  let count = 0
  let lowest: number | null = null
  for (let i = 0; i < predicted.length; i += 1) {
    if (predicted[i] < 0) {
      count += 1
      if (lowest === null || predicted[i] < lowest) lowest = predicted[i]
    }
  }
  return { count, total: predicted.length, lowest }
}
export type MethodRow = {
  key: MethodKey
  mae: number
  rmse: number
  bias: number
  // Mean absolute error compared with persistence, in percent (negative = better).
  versusPersistence: number | null
}

// The methods on exactly the same test days, model first.
export function methodRows(result: Done): MethodRow[] {
  const base = result.scores.persistence.mae
  const row = (key: MethodKey): MethodRow => {
    const s = result.scores[key]
    return { key, mae: s.mae, rmse: s.rmse, bias: s.bias, versusPersistence: base > 0 ? (s.mae / base - 1) * 100 : null }
  }
  return [row('model'), row('persistence'), row('naive'), row('mean')]
}

// Persistence and seasonal naive are the same method when the horizon is 7 days.
export function baselinesCoincide(result: Done): boolean {
  return result.persistenceLag === result.naiveLag
}

export type PeriodProblem = 'order' | 'overlap' | null

// Training must end before testing begins, each period must run forwards.
export function periodProblem(train: [string, string], test: [string, string]): PeriodProblem {
  if (train[0] > train[1] || test[0] > test[1]) return 'order'
  if (train[1] >= test[0]) return 'overlap'
  return null
}

export type Point = { x: number; y: number | null }

// Day indices and values as points; a gap of more than one day lifts the line.
export function pointsWithGaps(days: number[], values: ArrayLike<number>, x: (day: number) => number, y: (value: number) => number): Point[] {
  const points: Point[] = []
  days.forEach((day, i) => {
    if (i > 0 && day - days[i - 1] > 1) points.push({ x: x(day - 1), y: null })
    points.push({ x: x(day), y: y(values[i]) })
  })
  return points
}

export type TimeTick = { index: number; label: string }

// Axis ticks on the first of January (long spans) or of every third month.
export function timeTicks(firstDay: string, from: number, to: number): TimeTick[] {
  const ticks: TimeTick[] = []
  const years = (to - from) / 365.25
  const startIso = isoOfDay(firstDay, from)
  let year = Number(startIso.slice(0, 4))
  let month = Number(startIso.slice(5, 7))
  if (years > 2.5) {
    month = 1
    year += 1
  } else {
    month = Math.floor((month - 1) / 3) * 3 + 4
    if (month > 12) {
      month -= 12
      year += 1
    }
  }
  const stepMonths = years > 2.5 ? 12 : 3
  const first = Date.parse(`${firstDay}T00:00:00Z`)
  for (let guard = 0; guard < 200; guard += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-01`
    const index = Math.round((Date.parse(`${iso}T00:00:00Z`) - first) / DAY_MS)
    if (index > to) break
    if (index >= from) ticks.push({ index, label: years > 2.5 ? String(year) : `${String(month).padStart(2, '0')}/${year}` })
    month += stepMonths
    while (month > 12) {
      month -= 12
      year += 1
    }
  }
  // Thin out when there are too many labels for the width.
  const step = Math.ceil(ticks.length / 10)
  return step > 1 ? ticks.filter((_, i) => i % step === 0) : ticks
}

// Share of the span between two days (for the training and test bars).
export function spanShare(first: string, last: string, from: string, to: string): [number, number] {
  const start = Date.parse(`${first}T00:00:00Z`)
  const total = Date.parse(`${last}T00:00:00Z`) - start + DAY_MS
  const a = (Date.parse(`${from}T00:00:00Z`) - start) / total
  const b = (Date.parse(`${to}T00:00:00Z`) - start + DAY_MS) / total
  return [Math.max(0, Math.min(1, a)), Math.max(0, Math.min(1, b))]
}
