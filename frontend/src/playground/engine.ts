import type { Thresholds, WeatherKey } from './data'
import type {
  DaySelection,
  Grouping,
  NumericVariable,
  Range as Bounds,
} from './state'

// Pure calculation core of the playground: no React, no fetching.
// Thresholds come only from the data (input.thresholds, i.e. meta.definitions).
// Everything here is cross-checked against an independent Python reference.

export type Series = (number | null)[]

export type EngineInput = {
  firstDay: string
  days: number
  weekday: number[] // 0 = Monday
  holiday: number[] // 1 = bank holiday
  corona: number[] // 0, 1, 2
  ulez: number[] // 0..3
  weather: Record<WeatherKey, Series>
  no2: Record<string, Series> // per station code
  thresholds: Thresholds
}

export type Axis = { days: number; year: number[]; month: number[] }

const DAY_MS = 86_400_000

function utc(iso: string): number {
  return Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  )
}

export function dayIndex(firstDay: string, iso: string): number {
  return Math.round((utc(iso) - utc(firstDay)) / DAY_MS)
}

export function buildAxis(input: EngineInput): Axis {
  const start = utc(input.firstDay)
  const year: number[] = []
  const month: number[] = []
  for (let i = 0; i < input.days; i += 1) {
    const date = new Date(start + i * DAY_MS)
    year.push(date.getUTCFullYear())
    month.push(date.getUTCMonth() + 1)
  }
  return { days: input.days, year, month }
}

const ge = (v: number | null, t: number) => v !== null && v >= t
const gt = (v: number | null, t: number) => v !== null && v > t
const le = (v: number | null, t: number) => v !== null && v <= t
const lt = (v: number | null, t: number) => v !== null && v < t

// 8 sectors of 45 degrees, centred on north (sector 0 = 337.5 to 22.5).
export function sectorOf(degrees: number | null): number | null {
  if (degrees === null) return null
  return Math.floor(((degrees + 22.5) % 360) / 45)
}

const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const

// Meteorological seasons: DJF, MAM, JJA, SON.
function seasonIndex(month: number): number {
  if (month === 12 || month <= 2) return 0
  if (month <= 5) return 1
  if (month <= 8) return 2
  return 3
}

// One boolean mask per single class. The names are the same as in the Python
// reference (tools/make_engine_reference.py). The three combined classes of
// the reference (combo_*) are deliberately not here: they are tested through
// selectDays, which is a separate code path.
export function buildFlags(
  input: EngineInput,
  axis: Axis,
): Record<string, boolean[]> {
  const th = input.thresholds
  const w = input.weather
  const n = input.days
  const make = (test: (i: number) => boolean): boolean[] =>
    Array.from({ length: n }, (_, i) => test(i))

  const wind = w.wind_speed_10m_mean
  const rain = w.precipitation_sum
  const snow = w.snowfall_sum
  const tmin = w.temperature_2m_min
  const tmax = w.temperature_2m_max
  const direction = w.wind_direction_10m_dominant

  const flags: Record<string, boolean[]> = {
    all: make(() => true),
    wind_calm: make((i) => le(wind[i], th.wind_calm_max_kmh)),
    wind_windy: make((i) => ge(wind[i], th.wind_windy_min_kmh)),
    rain_dry: make((i) => lt(rain[i], th.rain_wet_min_mm)),
    rain_wet: make((i) => ge(rain[i], th.rain_wet_min_mm)),
    rain_very_wet: make((i) => ge(rain[i], th.rain_very_wet_min_mm)),
    snow_day: make((i) => ge(snow[i], th.snow_day_min_cm)),
    frost_day: make((i) => lt(tmin[i], th.frost_day_tmin_below)),
    summer_day: make((i) => gt(tmax[i], th.summer_day_tmax_above)),
    bank_holiday: make((i) => input.holiday[i] === 1),
    weekend: make((i) => input.holiday[i] === 0 && input.weekday[i] >= 5),
    workday: make((i) => input.holiday[i] === 0 && input.weekday[i] < 5),
  }
  for (let k = 0; k < 3; k += 1) {
    flags[`corona_${k}`] = make((i) => input.corona[i] === k)
  }
  for (let k = 0; k < 4; k += 1) {
    flags[`ulez_${k}`] = make((i) => input.ulez[i] === k)
  }
  for (let k = 0; k < 7; k += 1) {
    flags[`weekday_${k}`] = make((i) => input.weekday[i] === k)
  }
  SEASONS.forEach((name, k) => {
    flags[`season_${name}`] = make((i) => seasonIndex(axis.month[i]) === k)
  })
  for (let m = 1; m <= 12; m += 1) {
    flags[`month_${m}`] = make((i) => axis.month[i] === m)
  }
  for (const y of [...new Set(axis.year)].sort((a, b) => a - b)) {
    flags[`year_${y}`] = make((i) => axis.year[i] === y)
  }
  for (let s = 0; s < 8; s += 1) {
    flags[`sector_${s}`] = make((i) => sectorOf(direction[i]) === s)
  }
  return flags
}

export function valuesOf(
  input: EngineInput,
  variable: NumericVariable,
  station: string,
): Series {
  if (variable !== 'no2') return input.weather[variable]
  const series = input.no2[station]
  if (!series) throw new Error(`unknown station: ${station}`)
  return series
}

// Value used for a range filter. Weather: the daily value. NO2: the mean of
// the selected stations that measured that day (null if none did).
function rangeValue(
  input: EngineInput,
  variable: NumericVariable,
  i: number,
  stations: string[],
): number | null {
  if (variable !== 'no2') return input.weather[variable][i]
  let sum = 0
  let count = 0
  for (const code of stations) {
    const v = input.no2[code]?.[i]
    if (v !== null && v !== undefined) {
      sum += v
      count += 1
    }
  }
  return count === 0 ? null : sum / count
}

// The FILTER: which days are analysed. All conditions are combined with AND.
// A day with a missing value in a filtered variable is excluded.
export function selectDays(
  input: EngineInput,
  sel: DaySelection,
  stations: string[],
  axis: Axis,
): boolean[] {
  const from = Math.max(0, dayIndex(input.firstDay, sel.period[0]))
  const to = Math.min(input.days - 1, dayIndex(input.firstDay, sel.period[1]))
  const ranges = Object.entries(sel.ranges) as [
    NumericVariable,
    Bounds | undefined,
  ][]
  const direction = input.weather.wind_direction_10m_dominant
  const mask: boolean[] = new Array<boolean>(input.days).fill(false)

  for (let i = from; i <= to; i += 1) {
    if (sel.months && !sel.months.includes(axis.month[i])) continue
    if (sel.weekdays && !sel.weekdays.includes(input.weekday[i])) continue
    if (sel.holiday === 'only' && input.holiday[i] !== 1) continue
    if (sel.holiday === 'exclude' && input.holiday[i] === 1) continue
    if (sel.corona && !sel.corona.includes(input.corona[i])) continue
    if (sel.ulez && !sel.ulez.includes(input.ulez[i])) continue
    if (sel.windSectors) {
      const sector = sectorOf(direction[i])
      if (sector === null || !sel.windSectors.includes(sector)) continue
    }
    let inside = true
    for (const [variable, bounds] of ranges) {
      if (!bounds) continue
      const value = rangeValue(input, variable, i, stations)
      if (
        value === null ||
        (bounds[0] !== null && value < bounds[0]) ||
        (bounds[1] !== null && value > bounds[1])
      ) {
        inside = false
        break
      }
    }
    if (inside) mask[i] = true
  }
  return mask
}

export type GroupAssignment = { keys: string[]; of: Int16Array }

function numberKeys(from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, k) => String(from + k))
}

function definition(
  grouping: Grouping,
  input: EngineInput,
  axis: Axis,
): { keys: string[]; pick: (i: number) => number } {
  const th = input.thresholds
  const w = input.weather
  switch (grouping) {
    case 'none':
      return { keys: ['all'], pick: () => 0 }
    case 'windClass':
      return {
        keys: ['calm', 'normal', 'windy'],
        pick: (i) => {
          const v = w.wind_speed_10m_mean[i]
          if (v === null) return -1
          if (v <= th.wind_calm_max_kmh) return 0
          return v >= th.wind_windy_min_kmh ? 2 : 1
        },
      }
    case 'rainClass':
      return {
        keys: ['dry', 'wet', 'veryWet'],
        pick: (i) => {
          const v = w.precipitation_sum[i]
          if (v === null) return -1
          if (v < th.rain_wet_min_mm) return 0
          return v >= th.rain_very_wet_min_mm ? 2 : 1
        },
      }
    case 'snowDay':
      return {
        keys: ['snow', 'noSnow'],
        pick: (i) => {
          const v = w.snowfall_sum[i]
          if (v === null) return -1
          return v >= th.snow_day_min_cm ? 0 : 1
        },
      }
    case 'temperatureClass':
      return {
        keys: ['frost', 'mild', 'summer'],
        pick: (i) => {
          const low = w.temperature_2m_min[i]
          const high = w.temperature_2m_max[i]
          if (low === null || high === null) return -1
          if (low < th.frost_day_tmin_below) return 0
          return high > th.summer_day_tmax_above ? 2 : 1
        },
      }
    case 'season':
      return {
        keys: [...SEASONS],
        pick: (i) => seasonIndex(axis.month[i]),
      }
    case 'dayType':
      return {
        keys: ['workday', 'weekend', 'bankHoliday'],
        pick: (i) => {
          if (input.holiday[i] === 1) return 2
          return input.weekday[i] >= 5 ? 1 : 0
        },
      }
    case 'weekday':
      return { keys: numberKeys(0, 6), pick: (i) => input.weekday[i] }
    case 'month':
      return { keys: numberKeys(1, 12), pick: (i) => axis.month[i] - 1 }
    case 'year': {
      const years = [...new Set(axis.year)].sort((a, b) => a - b)
      const position = new Map(years.map((y, k) => [y, k]))
      return {
        keys: years.map(String),
        pick: (i) => position.get(axis.year[i]) ?? -1,
      }
    }
    case 'corona':
      return { keys: numberKeys(0, 2), pick: (i) => input.corona[i] }
    case 'ulez':
      return { keys: numberKeys(0, 3), pick: (i) => input.ulez[i] }
    case 'windSector':
      return {
        keys: numberKeys(0, 7),
        pick: (i) => sectorOf(w.wind_direction_10m_dominant[i]) ?? -1,
      }
  }
}

// Every day gets the index of its group, or -1 when it belongs to none
// (missing weather value or code outside the known range).
export function assignGroups(
  input: EngineInput,
  axis: Axis,
  grouping: Grouping,
): GroupAssignment {
  const { keys, pick } = definition(grouping, input, axis)
  const of = new Int16Array(input.days).fill(-1)
  for (let i = 0; i < input.days; i += 1) {
    const index = pick(i)
    of[i] = index >= 0 && index < keys.length ? index : -1
  }
  return { keys, of }
}

export type Summary = {
  n: number
  mean: number | null
  median: number | null
  q1: number | null
  q3: number | null
  min: number | null
  max: number | null
}

// Linear interpolation between order statistics; for p = 0.25 / 0.5 / 0.75
// this equals Python statistics.quantiles(method="inclusive").
export function quantile(sorted: number[], p: number): number {
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

// Quartiles need at least two values; with fewer they are null.
export function summarize(values: number[]): Summary {
  const n = values.length
  if (n === 0) {
    return { n, mean: null, median: null, q1: null, q3: null, min: null, max: null }
  }
  const sorted = [...values].sort((a, b) => a - b)
  let sum = 0
  for (const v of sorted) sum += v
  return {
    n,
    mean: sum / n,
    median: quantile(sorted, 0.5),
    q1: n >= 2 ? quantile(sorted, 0.25) : null,
    q3: n >= 2 ? quantile(sorted, 0.75) : null,
    min: sorted[0],
    max: sorted[n - 1],
  }
}

// days = selected days in the group (including days without a measurement),
// n = days with a value. low = fewer than min_days_per_group values: only a
// warning that the group is small, never a quality seal for larger groups.
export type GroupStat = Summary & { key: string; days: number; low: boolean }

export function groupStats(
  input: EngineInput,
  axis: Axis,
  mask: boolean[],
  grouping: Grouping,
  variable: NumericVariable,
  station: string,
): GroupStat[] {
  const { keys, of } = assignGroups(input, axis, grouping)
  const values = valuesOf(input, variable, station)
  const buckets: number[][] = keys.map(() => [])
  const days: number[] = keys.map(() => 0)
  for (let i = 0; i < input.days; i += 1) {
    if (!mask[i]) continue
    const g = of[i]
    if (g < 0) continue
    days[g] += 1
    const v = values[i]
    if (v !== null) buckets[g].push(v)
  }
  return keys.map((key, g) => ({
    key,
    days: days[g],
    low: buckets[g].length < input.thresholds.min_days_per_group,
    ...summarize(buckets[g]),
  }))
}