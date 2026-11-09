import type { Engine } from '../adapter'
import { highlightToSelection } from '../charts/highlight'
import type { Thresholds } from '../data'
import { assignGroups, summarize, valuesOf, type Summary } from '../engine'
import { formatNumber } from '../charts/svg'
import { GROUPING_LABELS, PGC, groupLabel } from '../labels'
import {
  CONDITION_GROUPINGS,
  CONDITION_KEYS,
  normalizeCondition,
  type CompareConfig,
  type Condition,
  type ConditionGrouping,
  type DaySelection,
} from '../state'
import { MIN_CELL_DAYS, boxStats, type BoxStats } from '../stats'

// Combine: two groups of days, built from class switches, inside the day
// filter. Pure functions, no React. The classes are the ones of the engine
// (assignGroups), so thresholds exist in exactly one place.

// Group colours: slots 1 and 2 of the validated series palette.
export const GROUP_COLORS = { a: '#2a78d6', b: '#eb6834' } as const

const count = (mask: boolean[]) => mask.reduce((sum, on) => sum + (on ? 1 : 0), 0)

export function isEmptyCondition(condition: Condition): boolean {
  return CONDITION_GROUPINGS.every((grouping) => !condition[grouping]?.length)
}

// Adds or removes one class. Listing every class of a grouping is the same as
// listing none (any), so it is normalised away.
export function toggleKey(
  condition: Condition,
  grouping: ConditionGrouping,
  key: string,
): Condition {
  const list = condition[grouping] ?? []
  const next = list.includes(key) ? list.filter((item) => item !== key) : [...list, key]
  return normalizeCondition({ ...condition, [grouping]: next })
}

// The days of the base that meet the condition. A day without a weather value
// never meets a condition on that weather class.
export function conditionMask(
  engine: Engine,
  condition: Condition,
  base: boolean[],
): boolean[] {
  const rules = CONDITION_GROUPINGS.flatMap((grouping) => {
    const wantedKeys = condition[grouping]
    if (!wantedKeys || wantedKeys.length === 0) return []
    const { keys, of } = assignGroups(engine.input, engine.axis, grouping)
    const wanted = new Set<number>()
    keys.forEach((key, index) => {
      if (wantedKeys.includes(key)) wanted.add(index)
    })
    return [{ of, wanted }]
  })
  return base.map((on, i) => on && rules.every((rule) => rule.wanted.has(rule.of[i])))
}

export type Split = {
  a: boolean[]
  b: boolean[]
  overlap: number // days that meet both conditions (they count in A only)
}

// A = days of the filter that meet condition A. B = all other days of the
// filter, or the days meeting condition B that are not in A.
export function splitGroups(engine: Engine, base: boolean[], config: CompareConfig): Split {
  const a = conditionMask(engine, config.a, base)
  if (config.b === null) {
    return { a, b: base.map((on, i) => on && !a[i]), overlap: 0 }
  }
  const both = conditionMask(engine, config.b, base)
  return {
    a,
    b: both.map((on, i) => on && !a[i]),
    overlap: count(both.map((on, i) => on && a[i])),
  }
}

export type SideStat = Summary & {
  days: number // days in the group
  low: boolean // fewer than min_days_per_group values: a warning only
  tooFew: boolean // fewer than MIN_CELL_DAYS values: no statistics are shown
  box: BoxStats | null
}

export type StationCompare = {
  code: string
  a: SideStat
  b: SideStat
  diff: number | null // mean of A minus mean of B
  diffMedian: number | null
  percent: number | null // diff relative to the mean of B
}

function sideStat(
  series: (number | null)[],
  mask: boolean[],
  minDays: number,
): SideStat {
  const values: number[] = []
  for (let i = 0; i < mask.length; i += 1) {
    const v = series[i]
    if (mask[i] && v !== null) values.push(v)
  }
  const summary = summarize(values)
  return {
    ...summary,
    days: count(mask),
    low: summary.n < minDays,
    tooFew: summary.n < MIN_CELL_DAYS,
    box: boxStats(values),
  }
}

export function compareStats(engine: Engine, split: Split, stations: string[]): StationCompare[] {
  const minDays = engine.input.thresholds.min_days_per_group
  return stations.map((code) => {
    const series = valuesOf(engine.input, 'no2', code)
    const a = sideStat(series, split.a, minDays)
    const b = sideStat(series, split.b, minDays)
    const comparable = !a.tooFew && !b.tooFew && a.mean !== null && b.mean !== null
    const diff = comparable ? (a.mean as number) - (b.mean as number) : null
    const diffMedian =
      comparable && a.median !== null && b.median !== null ? a.median - b.median : null
    const baseMean = b.mean
    const percent =
      diff !== null && baseMean !== null && baseMean > 0 ? (diff / baseMean) * 100 : null
    return { code, a, b, diff, diffMedian, percent }
  })
}

// "windig und Winter", "Werktag oder Wochenende und Schneetag", "alle Tage".
export function describeCondition(condition: Condition): string {
  const parts = CONDITION_GROUPINGS.flatMap((grouping) => {
    const keys = condition[grouping]
    if (!keys || keys.length === 0) return []
    return [keys.map((key) => groupLabel(grouping, key)).join(' oder ')]
  })
  return parts.length === 0 ? 'alle Tage' : parts.join(' und ')
}

export function conditionGroupingLabel(grouping: ConditionGrouping): string {
  return GROUPING_LABELS[grouping]
}

export function conditionKeys(grouping: ConditionGrouping): readonly string[] {
  return CONDITION_KEYS[grouping]
}

// Condition A as a day filter, or null when the filter controls cannot say it
// exactly (or nothing would be left). Whenever a selection comes back,
// selecting with it gives exactly the days of A within the old filter (tested).
export function conditionToSelection(
  selection: DaySelection,
  condition: Condition,
  thresholds: Thresholds,
): DaySelection | null {
  let current: DaySelection | null = selection
  for (const grouping of CONDITION_GROUPINGS) {
    const keys = condition[grouping]
    if (!keys || keys.length === 0) continue
    current = highlightToSelection(current, { kind: 'groups', grouping, keys }, thresholds)
    if (!current) return null
  }
  return current
}

// A short explanation of what a class means, with the thresholds taken from
// the data (never typed in here).
export function keyHint(
  grouping: ConditionGrouping,
  key: string,
  th: Thresholds,
): string | undefined {
  const t = PGC.thresholds
  const f = (value: number) => formatNumber(value, 2)
  switch (`${grouping}.${key}`) {
    case 'windClass.calm':
      return t.calm(f(th.wind_calm_max_kmh))
    case 'windClass.normal':
      return t.normal
    case 'windClass.windy':
      return t.windy(f(th.wind_windy_min_kmh))
    case 'rainClass.dry':
      return t.dry(f(th.rain_wet_min_mm))
    case 'rainClass.wet':
      return t.wet(f(th.rain_wet_min_mm), f(th.rain_very_wet_min_mm))
    case 'rainClass.veryWet':
      return t.veryWet(f(th.rain_very_wet_min_mm))
    case 'snowDay.snow':
      return t.snow(f(th.snow_day_min_cm))
    case 'snowDay.noSnow':
      return t.noSnow
    case 'temperatureClass.frost':
      return t.frost(f(th.frost_day_tmin_below))
    case 'temperatureClass.mild':
      return t.mild
    case 'temperatureClass.summer':
      return t.summer(f(th.summer_day_tmax_above))
    default:
      return undefined
  }
}
