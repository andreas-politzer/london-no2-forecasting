import type { Engine } from '../adapter'
import { LAG_DAYS, MODEL_FEATURES, WINDOW_DAYS } from './types'

// Turns the chosen ingredients into columns of numbers, one value per day
// (NaN = missing). Nothing here looks at the future of a row except where the
// feature is defined that way (a lag looks back, never forward).

export type Encoding = 'dummies' | 'ordinal'

export type Column = { feature: string; name: string; values: Float64Array }

export type Dataset = { columns: Column[]; target: Float64Array; days: number }

const nanOf = (value: number | null | undefined) =>
  value === null || value === undefined ? Number.NaN : value

// A window of the NO2 series ending `lagEnd` days before the day. The mean
// needs at least half of the days of the window.
function windowMean(series: Float64Array, t: number, lagEnd: number, width: number): number {
  const last = t - lagEnd
  const first = last - width + 1
  if (first < 0) return Number.NaN
  let sum = 0
  let count = 0
  for (let i = first; i <= last; i += 1) {
    const v = series[i]
    if (Number.isFinite(v)) {
      sum += v
      count += 1
    }
  }
  return count >= Math.ceil(width / 2) ? sum / count : Number.NaN
}

export function buildDataset(
  engine: Engine,
  station: string,
  features: readonly string[],
  encoding: Encoding,
  horizon: number,
): Dataset {
  const input = engine.input
  const n = input.days
  const raw = input.no2[station]
  if (!raw) throw new Error(`unknown station: ${station}`)
  const target = Float64Array.from(raw, nanOf)
  const columns: Column[] = []
  const add = (feature: string, name: string, make: (t: number) => number) => {
    const values = new Float64Array(n)
    for (let t = 0; t < n; t += 1) values[t] = make(t)
    columns.push({ feature, name, values })
  }
  const chosen = new Set(features)

  for (const feature of MODEL_FEATURES) {
    if (!chosen.has(feature)) continue
    switch (feature) {
      case 'weekday':
        if (encoding === 'ordinal') add(feature, 'weekday', (t) => input.weekday[t])
        else for (let k = 1; k <= 6; k += 1) add(feature, `weekday_${k}`, (t) => (input.weekday[t] === k ? 1 : 0))
        break
      case 'month':
        if (encoding === 'ordinal') add(feature, 'month', (t) => engine.axis.month[t])
        else for (let k = 2; k <= 12; k += 1) add(feature, `month_${k}`, (t) => (engine.axis.month[t] === k ? 1 : 0))
        break
      case 'bankHoliday':
        add(feature, 'bankHoliday', (t) => (input.holiday[t] === 1 ? 1 : 0))
        break
      case 'trend':
        add(feature, 'trend', (t) => t / 365.25)
        break
      case 'corona':
        if (encoding === 'ordinal') add(feature, 'corona', (t) => input.corona[t])
        else for (let k = 1; k <= 2; k += 1) add(feature, `corona_${k}`, (t) => (input.corona[t] === k ? 1 : 0))
        break
      case 'ulez':
        if (encoding === 'ordinal') add(feature, 'ulez', (t) => input.ulez[t])
        else for (let k = 1; k <= 3; k += 1) add(feature, `ulez_${k}`, (t) => (input.ulez[t] === k ? 1 : 0))
        break
      case 'lag1':
      case 'lag7':
      case 'lag14':
      case 'lag28': {
        const lag = LAG_DAYS[feature]
        add(feature, feature, (t) => (t - lag >= 0 ? target[t - lag] : Number.NaN))
        break
      }
      case 'mean7':
      case 'mean28': {
        const width = WINDOW_DAYS[feature]
        add(feature, feature, (t) => windowMean(target, t, horizon, width))
        break
      }
      case 'wind_direction_10m_dominant': {
        const series = input.weather[feature]
        const radians = (t: number) => ((nanOf(series[t]) * Math.PI) / 180)
        add(feature, 'wind_direction_sin', (t) => Math.sin(radians(t)))
        add(feature, 'wind_direction_cos', (t) => Math.cos(radians(t)))
        break
      }
      default: {
        const series = input.weather[feature]
        add(feature, feature, (t) => nanOf(series[t]))
      }
    }
  }
  return { columns, target, days: n }
}

// Days of [from, to] with a measured target and complete columns.
export function completeRows(dataset: Dataset, from: number, to: number): number[] {
  const rows: number[] = []
  const last = Math.min(to, dataset.days - 1)
  for (let t = Math.max(0, from); t <= last; t += 1) {
    if (!Number.isFinite(dataset.target[t])) continue
    if (dataset.columns.every((column) => Number.isFinite(column.values[t]))) rows.push(t)
  }
  return rows
}
