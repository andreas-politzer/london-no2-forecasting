import {
  assignGroups,
  groupStats,
  quantile,
  summarize,
  valuesOf,
  type Axis,
  type EngineInput,
  type GroupStat,
  type Series,
  type Summary,
} from './engine'
import type { Grouping, NumericVariable } from './state'

// Statistical building blocks for the whole chart catalogue. Pure functions, no
// React. Every definition below is fixed here once; the charts only draw what
// these functions return. All of them are cross-checked against an independent
// Python reference (tools/make_stats_reference.py).
//
// DEFINITIONS
//   Missing values   never filled in. A day outside the day selection counts as
//                    missing (see maskedSeries).
//   Rolling mean     centred window of `window` days: `floor(window/2)` days
//                    before, the rest after. Needs at least half of the window
//                    days (ceil(0.5 * window)) with a value, otherwise null.
//                    The first and last days without a full window are null.
//   Histogram        shared bin edges from all pooled values: Freedman-Diaconis
//                    bin width 2*IQR*n^(-1/3) (Sturges if IQR = 0), between 8
//                    and 60 equally wide bins from min to max, or a given
//                    number. Bins are [a, b); only the last one is closed.
//   Density (KDE)    Gaussian kernel, Silverman bandwidth
//                    0.9*min(sd, IQR/1.34)*n^(-1/5) from the pooled values, the
//                    same bandwidth and 128-point grid for every group (so
//                    groups are comparable). Groups with fewer than 2 values
//                    get no curve. If all values are >= 0 the grid starts at 0.
//   Box plot         quartiles by the inclusive method (as everywhere), Tukey
//                    whiskers: the most extreme values within 1.5 * IQR.
//   Correlation      Pearson and Spearman (Pearson on average ranks), on days
//                    where both values exist (pairwise), at least 3 pairs.
//                    Wind direction is circular: it is not a linear variable
//                    and is left out of scatter and correlation charts.
//   Hexagons         pointy-top hexagons, circumradius in pixels, cube
//                    rounding of the axial coordinates.
//   Wind rose        8 sectors of 45 degrees centred on north. Speed classes
//                    from the data thresholds (calm, normal, windy).
//   Cross table      two groupings against each other; small cells are marked
//                    with the same minimum as everywhere (min_days_per_group).
//   Month cells      mean per year and month; a cell with fewer than
//                    MIN_CELL_DAYS values is marked as small (it is still
//                    shown, the mark is a warning and not a quality seal).

export const MIN_CELL_DAYS = 10

// Wind direction is an angle: averages, correlations and a numeric axis make no
// sense for it. It has its own charts (wind rose, polar scatter, sectors).
export function isLinearVariable(variable: NumericVariable): boolean {
  return variable !== 'wind_direction_10m_dominant'
}

const DAY_MS = 86_400_000

function utc(iso: string): number {
  return Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  )
}

export function isoDay(firstDay: string, index: number): string {
  return new Date(utc(firstDay) + index * DAY_MS).toISOString().slice(0, 10)
}

// ------------------------------------------------------------- series

export function maskedSeries(values: Series, mask: boolean[]): Series {
  return values.map((value, i) => (mask[i] ? value : null))
}

export function rollingMean(
  values: Series,
  window: number,
  minShare = 0.5,
): Series {
  const n = values.length
  const sum = new Float64Array(n + 1)
  const count = new Int32Array(n + 1)
  for (let i = 0; i < n; i += 1) {
    const v = values[i]
    sum[i + 1] = sum[i] + (v ?? 0)
    count[i + 1] = count[i] + (v === null ? 0 : 1)
  }
  const before = Math.floor(window / 2)
  const after = window - before - 1
  const need = Math.ceil(minShare * window)
  const out: Series = new Array<number | null>(n).fill(null)
  for (let i = before; i < n - after; i += 1) {
    const lo = i - before
    const hi = i + after
    const valid = count[hi + 1] - count[lo]
    if (valid >= need) out[i] = (sum[hi + 1] - sum[lo]) / valid
  }
  return out
}

// ----------------------------------------------------------- histogram

export type HistBar = {
  from: number
  to: number
  count: number
  share: number // count / n of this group
  density: number // count / (n * bin width)
}

export function binEdges(pooled: number[], bins?: number): number[] {
  const n = pooled.length
  if (n === 0) return []
  let min = Infinity
  let max = -Infinity
  for (const v of pooled) {
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min === max) return [min - 0.5, max + 0.5]
  let k: number
  if (bins !== undefined) {
    k = Math.max(1, Math.round(bins))
  } else {
    const sorted = [...pooled].sort((a, b) => a - b)
    const iqr = n >= 2 ? quantile(sorted, 0.75) - quantile(sorted, 0.25) : 0
    const width = 2 * iqr * Math.pow(n, -1 / 3)
    k = width > 0 ? Math.ceil((max - min) / width) : Math.ceil(Math.log2(n) + 1)
    k = Math.min(60, Math.max(8, k))
  }
  const step = (max - min) / k
  return Array.from({ length: k + 1 }, (_, i) => (i === k ? max : min + i * step))
}

export function histogramBars(values: number[], edges: number[]): HistBar[] {
  const k = edges.length - 1
  if (k < 1) return []
  const lo = edges[0]
  const width = (edges[k] - lo) / k
  const counts = new Array<number>(k).fill(0)
  let n = 0
  for (const v of values) {
    if (v < lo || v > edges[k]) continue
    counts[Math.min(k - 1, Math.floor((v - lo) / width))] += 1
    n += 1
  }
  return counts.map((count, i) => {
    const binWidth = edges[i + 1] - edges[i]
    return {
      from: edges[i],
      to: edges[i + 1],
      count,
      share: n > 0 ? count / n : 0,
      density: n > 0 ? count / (n * binWidth) : 0,
    }
  })
}

// ------------------------------------------------------------- density

export function kdeBandwidth(pooled: number[]): number | null {
  const n = pooled.length
  if (n < 2) return null
  const sorted = [...pooled].sort((a, b) => a - b)
  let mean = 0
  for (const v of sorted) mean += v
  mean /= n
  let ss = 0
  for (const v of sorted) ss += (v - mean) * (v - mean)
  const sd = Math.sqrt(ss / (n - 1))
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25)
  const spread = iqr > 0 ? Math.min(sd, iqr / 1.34) : sd
  if (!(spread > 0)) return null
  return 0.9 * spread * Math.pow(n, -1 / 5)
}

export type KdeProfiles = {
  grid: number[]
  bandwidth: number
  curves: (number[] | null)[] // one per group, null when the group has < 2 values
}

export function kdeProfiles(
  groups: number[][],
  options: { points?: number; factor?: number } = {},
): KdeProfiles | null {
  const points = options.points ?? 128
  const pooled = groups.flat()
  const base = kdeBandwidth(pooled)
  if (base === null) return null
  const bandwidth = base * (options.factor ?? 1)
  let min = Infinity
  let max = -Infinity
  for (const v of pooled) {
    if (v < min) min = v
    if (v > max) max = v
  }
  let lo = min - 3 * bandwidth
  const hi = max + 3 * bandwidth
  if (min >= 0) lo = Math.max(0, lo)
  const grid = Array.from(
    { length: points },
    (_, i) => lo + (i * (hi - lo)) / (points - 1),
  )
  const norm = 1 / Math.sqrt(2 * Math.PI)
  const curves = groups.map((values) => {
    if (values.length < 2) return null
    const scale = norm / (values.length * bandwidth)
    return grid.map((g) => {
      let total = 0
      for (const v of values) {
        const z = (g - v) / bandwidth
        total += Math.exp(-0.5 * z * z)
      }
      return total * scale
    })
  })
  return { grid, bandwidth, curves }
}

// ------------------------------------------------------------- box plot

export type BoxStats = {
  n: number
  mean: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
  whiskerLow: number
  whiskerHigh: number
  outliers: number[]
}

export function boxStats(values: number[]): BoxStats | null {
  const n = values.length
  if (n < 2) return null
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const median = quantile(sorted, 0.5)
  const q3 = quantile(sorted, 0.75)
  const fenceLow = q1 - 1.5 * (q3 - q1)
  const fenceHigh = q3 + 1.5 * (q3 - q1)
  let whiskerLow = Infinity
  let whiskerHigh = -Infinity
  let sum = 0
  const outliers: number[] = []
  for (const v of sorted) {
    sum += v
    if (v < fenceLow || v > fenceHigh) {
      outliers.push(v)
      continue
    }
    if (v < whiskerLow) whiskerLow = v
    if (v > whiskerHigh) whiskerHigh = v
  }
  return {
    n,
    mean: sum / n,
    min: sorted[0],
    q1,
    median,
    q3,
    max: sorted[n - 1],
    whiskerLow,
    whiskerHigh,
    outliers,
  }
}

// ---------------------------------------------------------- correlation

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i += 1) {
    mx += xs[i]
    my += ys[i]
  }
  mx /= n
  my /= n
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  if (sxx === 0 || syy === 0) return null
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)))
}

// Average ranks (1-based); equal values share the mean of their positions.
export function ranks(values: number[]): number[] {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b])
  const out = new Array<number>(values.length).fill(0)
  let start = 0
  while (start < order.length) {
    let end = start
    while (
      end + 1 < order.length &&
      values[order[end + 1]] === values[order[start]]
    ) {
      end += 1
    }
    const rank = (start + end) / 2 + 1
    for (let k = start; k <= end; k += 1) out[order[k]] = rank
    start = end + 1
  }
  return out
}

export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length < 3) return null
  return pearson(ranks(xs), ranks(ys))
}

export type Pairs = { x: number[]; y: number[]; index: number[] }

// Days in the selection where both series have a value.
export function pairComplete(a: Series, b: Series, mask: boolean[]): Pairs {
  const out: Pairs = { x: [], y: [], index: [] }
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]
    const y = b[i]
    if (!mask[i] || x === null || y === null) continue
    out.x.push(x)
    out.y.push(y)
    out.index.push(i)
  }
  return out
}

export type CorrelationColumn = { key: string; values: Series }
export type CorrelationMatrix = {
  keys: string[]
  r: (number | null)[][]
  n: number[][]
}

export function correlationMatrix(
  columns: CorrelationColumn[],
  mask: boolean[],
  method: 'pearson' | 'spearman',
): CorrelationMatrix {
  const k = columns.length
  const r: (number | null)[][] = Array.from({ length: k }, () =>
    new Array<number | null>(k).fill(null),
  )
  const n: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0))
  const measure = method === 'pearson' ? pearson : spearman
  for (let i = 0; i < k; i += 1) {
    for (let j = i; j < k; j += 1) {
      const pairs = pairComplete(columns[i].values, columns[j].values, mask)
      const value = measure(pairs.x, pairs.y)
      r[i][j] = value
      r[j][i] = value
      n[i][j] = pairs.x.length
      n[j][i] = pairs.x.length
    }
  }
  return { keys: columns.map((c) => c.key), r, n }
}

export type LinearFit = {
  slope: number
  intercept: number
  r2: number | null
  n: number
}

export function linearFit(xs: number[], ys: number[]): LinearFit | null {
  const n = xs.length
  if (n < 3) return null
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i += 1) {
    mx += xs[i]
    my += ys[i]
  }
  mx /= n
  my /= n
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  return {
    slope,
    intercept: my - slope * mx,
    r2: syy === 0 ? null : (sxy * sxy) / (sxx * syy),
    n,
  }
}

// -------------------------------------------------------------- scatter

export function scatterPairs(
  input: EngineInput,
  mask: boolean[],
  xVariable: NumericVariable,
  yVariable: NumericVariable,
  station: string,
): Pairs {
  return pairComplete(
    valuesOf(input, xVariable, station),
    valuesOf(input, yVariable, station),
    mask,
  )
}

// -------------------------------------------------------------- hexbin

export type HexBin = { q: number; r: number; cx: number; cy: number; count: number }

const noNegativeZero = (value: number) => (value === 0 ? 0 : value)

// Points are in pixel coordinates; radius is the hexagon's circumradius.
export function hexbin(points: [number, number][], radius: number): HexBin[] {
  const bins = new Map<string, HexBin>()
  const sqrt3 = Math.sqrt(3)
  for (const [x, y] of points) {
    const fq = ((sqrt3 / 3) * x - (1 / 3) * y) / radius
    const fr = ((2 / 3) * y) / radius
    const fs = -fq - fr
    let q = Math.round(fq)
    let r = Math.round(fr)
    const s = Math.round(fs)
    const dq = Math.abs(q - fq)
    const dr = Math.abs(r - fr)
    const ds = Math.abs(s - fs)
    if (dq > dr && dq > ds) q = -r - s
    else if (dr > ds) r = -q - s
    q = noNegativeZero(q)
    r = noNegativeZero(r)
    const key = `${q},${r}`
    const bin = bins.get(key)
    if (bin) {
      bin.count += 1
    } else {
      bins.set(key, {
        q,
        r,
        cx: radius * sqrt3 * (q + r / 2),
        cy: radius * 1.5 * r,
        count: 1,
      })
    }
  }
  return [...bins.values()]
}

// ------------------------------------------------------------ wind rose

export const SECTOR_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

export type RoseSector = {
  sector: number
  name: string
  days: number // selected days with direction and speed
  speedDays: [number, number, number] // calm, normal, windy
  no2: GroupStat // NO2 on the selected days of this sector
}

export function windRose(
  input: EngineInput,
  axis: Axis,
  mask: boolean[],
  station: string,
): { sectors: RoseSector[]; total: number } {
  const th = input.thresholds
  const direction = input.weather.wind_direction_10m_dominant
  const speed = input.weather.wind_speed_10m_mean
  const sectorOf = assignGroups(input, axis, 'windSector').of
  const speedDays: [number, number, number][] = Array.from({ length: 8 }, () => [0, 0, 0])
  const days = new Array<number>(8).fill(0)
  let total = 0
  for (let i = 0; i < input.days; i += 1) {
    const s = sectorOf[i]
    const v = speed[i]
    if (!mask[i] || s < 0 || direction[i] === null || v === null) continue
    const cls = v <= th.wind_calm_max_kmh ? 0 : v >= th.wind_windy_min_kmh ? 2 : 1
    speedDays[s][cls] += 1
    days[s] += 1
    total += 1
  }
  const no2 = groupStats(input, axis, mask, 'windSector', 'no2', station)
  const sectors = SECTOR_NAMES.map((name, s) => ({
    sector: s,
    name,
    days: days[s],
    speedDays: speedDays[s],
    no2: no2[s],
  }))
  return { sectors, total }
}

// --------------------------------------------------------- cross tables

export type CrossCell = Summary & { days: number; low: boolean }
export type CrossStats = {
  rowKeys: string[]
  colKeys: string[]
  cells: CrossCell[][]
}

export function crossStats(
  input: EngineInput,
  axis: Axis,
  mask: boolean[],
  rowGrouping: Grouping,
  colGrouping: Grouping,
  variable: NumericVariable,
  station: string,
): CrossStats {
  const rows = assignGroups(input, axis, rowGrouping)
  const cols = assignGroups(input, axis, colGrouping)
  const values = valuesOf(input, variable, station)
  const buckets: number[][][] = rows.keys.map(() => cols.keys.map(() => []))
  const days: number[][] = rows.keys.map(() => cols.keys.map(() => 0))
  for (let i = 0; i < input.days; i += 1) {
    if (!mask[i]) continue
    const r = rows.of[i]
    const c = cols.of[i]
    if (r < 0 || c < 0) continue
    days[r][c] += 1
    const v = values[i]
    if (v !== null) buckets[r][c].push(v)
  }
  const cells = rows.keys.map((_, r) =>
    cols.keys.map((_, c) => ({
      days: days[r][c],
      low: buckets[r][c].length < input.thresholds.min_days_per_group,
      ...summarize(buckets[r][c]),
    })),
  )
  return { rowKeys: rows.keys, colKeys: cols.keys, cells }
}

// --------------------------------------------------------- month cells

export type MonthCell = Summary & { year: number; month: number; low: boolean }

export function monthlyByYear(
  input: EngineInput,
  axis: Axis,
  mask: boolean[],
  variable: NumericVariable,
  station: string,
): { years: number[]; cells: MonthCell[][] } {
  const years = [...new Set(axis.year)].sort((a, b) => a - b)
  const position = new Map(years.map((y, k) => [y, k]))
  const values = valuesOf(input, variable, station)
  const buckets: number[][][] = years.map(() =>
    Array.from({ length: 12 }, () => []),
  )
  for (let i = 0; i < input.days; i += 1) {
    const v = values[i]
    if (!mask[i] || v === null) continue
    buckets[position.get(axis.year[i]) ?? 0][axis.month[i] - 1].push(v)
  }
  const cells = years.map((year, yi) =>
    buckets[yi].map((bucket, mi) => ({
      year,
      month: mi + 1,
      low: bucket.length < MIN_CELL_DAYS,
      ...summarize(bucket),
    })),
  )
  return { years, cells }
}

// ------------------------------------------------------ calendar heatmap

export type CalendarCell = {
  index: number
  date: string
  month: number
  day: number
  weekday: number // 0 = Monday (row)
  col: number // week column, the week of 1 January is column 0
  selected: boolean
  value: number | null // only for selected days
}

export function calendarCells(
  input: EngineInput,
  axis: Axis,
  mask: boolean[],
  variable: NumericVariable,
  station: string,
  year: number,
): CalendarCell[] {
  const values = valuesOf(input, variable, station)
  const jan1 = Date.UTC(year, 0, 1)
  const jan1Weekday = (new Date(jan1).getUTCDay() + 6) % 7
  const out: CalendarCell[] = []
  for (let i = 0; i < input.days; i += 1) {
    if (axis.year[i] !== year) continue
    const date = isoDay(input.firstDay, i)
    const dayOfYear = Math.round((utc(date) - jan1) / DAY_MS)
    out.push({
      index: i,
      date,
      month: axis.month[i],
      day: Number(date.slice(8, 10)),
      weekday: input.weekday[i],
      col: Math.floor((dayOfYear + jan1Weekday) / 7),
      selected: mask[i],
      value: mask[i] ? values[i] : null,
    })
  }
  return out
}
