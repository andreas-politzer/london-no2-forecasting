import type { Engine } from '../adapter'
import { assignGroups, valuesOf, type Series } from '../engine'
import { PGU, groupLabel } from '../labels'
import type { Grouping, NumericVariable } from '../state'
import { binEdges, histogramBars, kdeProfiles, type HistBar } from '../stats'
import { MAX_SERIES, seriesColor } from './colors'

// The numbers behind the distribution chart (no React, so they can be tested).

export const NEUTRAL = '#1d2a4a'

export type DistSeries = {
  key: string
  label: string
  color: string
  values: number[]
  low: boolean // fewer values than the "few days" threshold: a warning
}

export type DistBuild = {
  series: DistSeries[]
  tooMany: boolean // more groups than colours: nothing is drawn, the chart says why
  station: string | null // the one station used when groups are shown (NO2 only)
}

function collect(values: Series, mask: boolean[]): number[] {
  const out: number[] = []
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]
    if (mask[i] && value !== null) out.push(value)
  }
  return out
}

// Without grouping: one series per station (NO2) or one for all days (weather).
// With grouping: one series per group, for the first station only, because
// stations times groups would not be readable.
export function distributionSeries(
  engine: Engine,
  mask: boolean[],
  variable: NumericVariable,
  grouping: Grouping,
  stations: string[],
  allStations: string[],
): DistBuild {
  const { input, axis } = engine
  const minDays = input.thresholds.min_days_per_group
  const make = (key: string, label: string, color: string, values: number[]): DistSeries => ({
    key,
    label,
    color,
    values,
    low: values.length < minDays,
  })

  if (grouping === 'none') {
    if (variable === 'no2') {
      return {
        series: stations.map((code) =>
          make(code, code, seriesColor(allStations.indexOf(code)), collect(valuesOf(input, variable, code), mask)),
        ),
        tooMany: false,
        station: null,
      }
    }
    return {
      series: [make('all', PGU.distAllDays, NEUTRAL, collect(valuesOf(input, variable, stations[0]), mask))],
      tooMany: false,
      station: null,
    }
  }

  const code = stations[0]
  const { keys, of } = assignGroups(input, axis, grouping)
  const values = valuesOf(input, variable, code)
  const buckets: number[][] = keys.map(() => [])
  for (let i = 0; i < input.days; i += 1) {
    const value = values[i]
    if (mask[i] && of[i] >= 0 && value !== null) buckets[of[i]].push(value)
  }
  if (keys.length > MAX_SERIES) return { series: [], tooMany: true, station: variable === 'no2' ? code : null }
  return {
    series: keys.map((key, g) => make(key, groupLabel(grouping, key), seriesColor(g), buckets[g])),
    tooMany: false,
    station: variable === 'no2' ? code : null,
  }
}

export type DistMode = 'histogram' | 'density'

export type DistShape =
  | { kind: 'histogram'; edges: number[]; bars: HistBar[][] }
  | { kind: 'density'; grid: number[]; bandwidth: number; curves: (number[] | null)[] }

// One shared set of bins (or one shared grid and bandwidth), so that the series
// can be compared. null when there is nothing to draw.
export function distributionShape(
  groups: number[][],
  mode: DistMode,
  bins: number | undefined,
  bandwidthFactor: number,
): DistShape | null {
  const pooled = groups.flat()
  if (pooled.length === 0) return null
  if (mode === 'histogram') {
    const edges = binEdges(pooled, bins)
    return { kind: 'histogram', edges, bars: groups.map((values) => histogramBars(values, edges)) }
  }
  const kde = kdeProfiles(groups, { factor: bandwidthFactor })
  return kde ? { kind: 'density', grid: kde.grid, bandwidth: kde.bandwidth, curves: kde.curves } : null
}

// Gaussian density of one group on a given grid and bandwidth (same formula as
// kdeProfiles), used to draw the marked days on the shape of the main series.
export function kdeCurve(values: number[], grid: number[], bandwidth: number): number[] | null {
  if (values.length < 2) return null
  const scale = 1 / Math.sqrt(2 * Math.PI) / (values.length * bandwidth)
  return grid.map((g) => {
    let total = 0
    for (const v of values) {
      const z = (g - v) / bandwidth
      total += Math.exp(-0.5 * z * z)
    }
    return total * scale
  })
}

// The marked days drawn on the shape of the main series.
export function overlayOnShape(shape: DistShape, groups: number[][]): DistShape {
  if (shape.kind === 'histogram') {
    return { ...shape, bars: groups.map((values) => histogramBars(values, shape.edges)) }
  }
  return { ...shape, curves: groups.map((values) => kdeCurve(values, shape.grid, shape.bandwidth)) }
}

// Three significant digits: a brushed range that reads like a typed one.
export function roundBound(value: number): number {
  return Number(value.toPrecision(3))
}
