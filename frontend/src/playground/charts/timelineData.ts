import type { Engine } from '../adapter'
import { valuesOf, type Series } from '../engine'
import type { NumericVariable } from '../state'
import { maskedSeries, rollingMean } from '../stats'

// The numbers behind the timeline chart (no React, so they can be tested).

export const SMOOTH_WINDOWS = [1, 7, 30, 365] as const
export type SmoothWindow = (typeof SMOOTH_WINDOWS)[number]
export const DEFAULT_WINDOW: SmoothWindow = 30

export function toWindow(option: unknown): SmoothWindow {
  return SMOOTH_WINDOWS.find((w) => w === option) ?? DEFAULT_WINDOW
}

export type TimelineSeries = {
  code: string
  raw: Series // daily values, null outside the filter or without a measurement
  smooth: Series // rolling mean of raw (equal to raw for window 1)
}

// One series per station for NO2. Weather is the same at every station, so it
// gets a single series.
export function timelineSeries(
  engine: Engine,
  variable: NumericVariable,
  window: number,
  mask: boolean[],
  stations: string[],
): TimelineSeries[] {
  const list = variable === 'no2' ? stations : stations.slice(0, 1)
  return list.map((code) => {
    const raw = maskedSeries(valuesOf(engine.input, variable, code), mask)
    return { code, raw, smooth: window <= 1 ? raw : rollingMean(raw, window) }
  })
}

export type YearMean = { year: number; mean: number | null; n: number }

// Mean of the daily values per calendar year (for the screen-reader table).
export function yearlyMeans(years: number[], raw: Series): YearMean[] {
  const sums = new Map<number, { sum: number; n: number }>()
  for (let i = 0; i < years.length; i += 1) {
    const cell = sums.get(years[i]) ?? { sum: 0, n: 0 }
    const value = raw[i]
    if (value !== null) {
      cell.sum += value
      cell.n += 1
    }
    sums.set(years[i], cell)
  }
  return [...sums.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, { sum, n }]) => ({ year, mean: n > 0 ? sum / n : null, n }))
}

// Runs of consecutive true days as [first, last] index pairs.
export function markedRuns(mask: boolean[]): [number, number][] {
  const runs: [number, number][] = []
  let start = -1
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] && start < 0) start = i
    if (!mask[i] && start >= 0) {
      runs.push([start, i - 1])
      start = -1
    }
  }
  if (start >= 0) runs.push([start, mask.length - 1])
  return runs
}
