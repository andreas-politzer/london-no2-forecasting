import type { WeatherKey } from './data'

export const STATE_VERSION = 1

export type Mode = 'explore' | 'combine' | 'experiment'
export const MODES: readonly Mode[] = ['explore', 'combine', 'experiment']

export const WEATHER_KEYS: readonly WeatherKey[] = [
  'temperature_2m_mean',
  'temperature_2m_max',
  'temperature_2m_min',
  'wind_speed_10m_max',
  'wind_speed_10m_mean',
  'wind_direction_10m_dominant',
  'precipitation_sum',
  'snowfall_sum',
  'relative_humidity_2m_mean',
]

export type NumericVariable = 'no2' | WeatherKey
export const NUMERIC_VARIABLES: readonly NumericVariable[] = [
  'no2',
  ...WEATHER_KEYS,
]

export type Grouping =
  | 'none'
  | 'windClass'
  | 'rainClass'
  | 'snowDay'
  | 'temperatureClass'
  | 'season'
  | 'dayType'
  | 'weekday'
  | 'month'
  | 'year'
  | 'corona'
  | 'ulez'
  | 'windSector'
export const GROUPINGS: readonly Grouping[] = [
  'none',
  'windClass',
  'rainClass',
  'snowDay',
  'temperatureClass',
  'season',
  'dayType',
  'weekday',
  'month',
  'year',
  'corona',
  'ulez',
  'windSector',
]

export type ChartType =
  | 'timeline'
  | 'distribution'
  | 'box'
  | 'bars'
  | 'scatter'
  | 'heatmap'
  | 'windrose'
  | 'calendar'
  | 'yearcompare'
export const CHART_TYPES: readonly ChartType[] = [
  'timeline',
  'distribution',
  'box',
  'bars',
  'scatter',
  'heatmap',
  'windrose',
  'calendar',
  'yearcompare',
]

export type HolidayMode = 'any' | 'only' | 'exclude'
export const HOLIDAY_MODES: readonly HolidayMode[] = ['any', 'only', 'exclude']

export type Range = [number | null, number | null]

// FILTER: which days are analysed. Saved with the experiment.
export type DaySelection = {
  period: [string, string]
  months: number[] | null
  weekdays: number[] | null
  holiday: HolidayMode
  corona: number[] | null
  ulez: number[] | null
  ranges: Partial<Record<NumericVariable, Range>>
  windSectors: number[] | null
}

export type ChartOption = number | string | boolean

export type ChartConfig = {
  id: string
  type: ChartType
  stations: string[] | null
  x?: NumericVariable
  y?: NumericVariable
  group?: Grouping
  options: Record<string, ChartOption>
}

// Rule: the training period ends strictly before the test period starts.
export type ModelConfig = {
  features: string[]
  trainPeriod: [string, string]
  testPeriod: [string, string]
}

// COMBINE: two groups of days built from class switches, compared inside the
// day filter. A condition lists, per grouping, the classes that are allowed
// (within one grouping "or", between groupings "and"); a missing grouping
// means "any". b = null means "all other days of the filter".
export const CONDITION_KEYS = {
  windClass: ['calm', 'normal', 'windy'],
  rainClass: ['dry', 'wet', 'veryWet'],
  snowDay: ['snow', 'noSnow'],
  temperatureClass: ['frost', 'mild', 'summer'],
  season: ['winter', 'spring', 'summer', 'autumn'],
  dayType: ['workday', 'weekend', 'bankHoliday'],
  corona: ['0', '1', '2'],
  ulez: ['0', '1', '2', '3'],
} as const
export type ConditionGrouping = keyof typeof CONDITION_KEYS
export const CONDITION_GROUPINGS = Object.keys(CONDITION_KEYS) as ConditionGrouping[]
export type Condition = Partial<Record<ConditionGrouping, string[]>>
export type CompareConfig = { a: Condition; b: Condition | null }

export function defaultCompare(): CompareConfig {
  return { a: { windClass: ['windy'] }, b: null }
}

// Canonical form: keys in their fixed order, no duplicates, and a grouping
// that is empty or lists every class is dropped (both mean "any").
export function normalizeCondition(condition: Condition): Condition {
  const out: Condition = {}
  for (const grouping of CONDITION_GROUPINGS) {
    const list = condition[grouping]
    if (!list) continue
    const all: readonly string[] = CONDITION_KEYS[grouping]
    const keys = all.filter((key) => list.includes(key))
    if (keys.length > 0 && keys.length < all.length) out[grouping] = keys
  }
  return out
}

// Highlighting (marking days inside a chart) is NOT part of the state:
// it is transient and never changes the day selection.
export type PlaygroundState = {
  version: typeof STATE_VERSION
  mode: Mode
  stations: string[]
  selection: DaySelection
  charts: ChartConfig[]
  model?: ModelConfig
  compare?: CompareConfig
}

export type StateContext = {
  stations: string[]
  defaultStation: string
  firstDay: string
  lastDay: string
}

// repairs: one code for every input that was dropped, clipped or replaced.
export type ParseResult = { state: PlaygroundState; repairs: string[] }

export function defaultSelection(ctx: StateContext): DaySelection {
  return {
    period: [ctx.firstDay, ctx.lastDay],
    months: null,
    weekdays: null,
    holiday: 'any',
    corona: null,
    ulez: null,
    ranges: {},
    windSectors: null,
  }
}

export function defaultState(ctx: StateContext): PlaygroundState {
  return {
    version: STATE_VERSION,
    mode: 'explore',
    stations: [ctx.defaultStation],
    selection: defaultSelection(ctx),
    charts: [
      {
        id: 'chart-1',
        type: 'timeline',
        stations: null,
        y: 'no2',
        group: 'none',
        options: {},
      },
    ],
  }
}

export function serializeState(state: PlaygroundState): string {
  return JSON.stringify(state)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function pickOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.find((item) => item === value) ?? null
}

function intList(
  value: unknown,
  min: number,
  max: number,
): { list: number[] | undefined; dropped: boolean } {
  if (!Array.isArray(value)) return { list: undefined, dropped: true }
  const set = new Set<number>()
  let dropped = false
  for (const item of value) {
    if (
      typeof item === 'number' &&
      Number.isInteger(item) &&
      item >= min &&
      item <= max
    ) {
      set.add(item)
    } else {
      dropped = true
    }
  }
  return {
    list: set.size === 0 ? undefined : [...set].sort((a, b) => a - b),
    dropped,
  }
}

function listField(
  raw: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  repairs: string[],
): number[] | null {
  const value = raw[key]
  if (value === undefined || value === null) return null
  const { list, dropped } = intList(value, min, max)
  if (!list || dropped) repairs.push(`selection.${key}`)
  return list ?? null
}

function parsePeriod(
  value: unknown,
  ctx: StateContext,
): [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null
  const [from, to] = value as unknown[]
  if (!isDay(from) || !isDay(to) || from > to) return null
  const start = from < ctx.firstDay ? ctx.firstDay : from
  const end = to > ctx.lastDay ? ctx.lastDay : to
  return start > end ? null : [start, end]
}

// True when parsePeriod returned the period exactly as it was given.
function sameDays(raw: unknown, period: [string, string]): boolean {
  return Array.isArray(raw) && raw[0] === period[0] && raw[1] === period[1]
}

function parseSelection(
  raw: unknown,
  ctx: StateContext,
  repairs: string[],
): DaySelection {
  const base = defaultSelection(ctx)
  if (!isRecord(raw)) {
    repairs.push('selection')
    return base
  }
  const period = parsePeriod(raw.period, ctx)
  if (!period || !sameDays(raw.period, period)) repairs.push('selection.period')

  let holiday: HolidayMode = 'any'
  if (raw.holiday !== undefined) {
    const picked = pickOf(raw.holiday, HOLIDAY_MODES)
    if (picked) holiday = picked
    else repairs.push('selection.holiday')
  }

  const ranges: Partial<Record<NumericVariable, Range>> = {}
  if (raw.ranges !== undefined) {
    if (isRecord(raw.ranges)) {
      const okBound = (bound: unknown) =>
        bound === null || (typeof bound === 'number' && Number.isFinite(bound))
      for (const [key, value] of Object.entries(raw.ranges)) {
        const variable = pickOf(key, NUMERIC_VARIABLES)
        if (
          variable &&
          Array.isArray(value) &&
          value.length === 2 &&
          okBound(value[0]) &&
          okBound(value[1]) &&
          !(
            typeof value[0] === 'number' &&
            typeof value[1] === 'number' &&
            value[0] > value[1]
          )
        ) {
          ranges[variable] = [value[0] as number | null, value[1] as number | null]
        } else {
          repairs.push(`selection.ranges.${key}`)
        }
      }
    } else {
      repairs.push('selection.ranges')
    }
  }

  return {
    period: period ?? base.period,
    months: listField(raw, 'months', 1, 12, repairs),
    weekdays: listField(raw, 'weekdays', 0, 6, repairs),
    holiday,
    corona: listField(raw, 'corona', 0, 2, repairs),
    ulez: listField(raw, 'ulez', 0, 3, repairs),
    ranges,
    windSectors: listField(raw, 'windSectors', 0, 7, repairs),
  }
}

// Keeps known stations in context order. Any unknown entry, a non-array or an
// empty result is reported under `path`.
function parseStations(
  value: unknown,
  ctx: StateContext,
  path: string,
  repairs: string[],
): string[] | null {
  if (!Array.isArray(value)) {
    repairs.push(path)
    return null
  }
  const known = ctx.stations.filter((code) => value.includes(code))
  if (
    known.length === 0 ||
    value.some((item) => !ctx.stations.includes(item as string))
  ) {
    repairs.push(path)
  }
  return known.length === 0 ? null : known
}

function parseCharts(
  raw: unknown,
  ctx: StateContext,
  repairs: string[],
): ChartConfig[] {
  if (!Array.isArray(raw)) {
    repairs.push('charts')
    return []
  }
  const charts: ChartConfig[] = []
  const used = new Set<string>()
  for (const item of raw) {
    if (!isRecord(item)) {
      repairs.push('charts.item')
      continue
    }
    const type = pickOf(item.type, CHART_TYPES)
    if (!type) {
      repairs.push('charts.type')
      continue
    }
    let id = typeof item.id === 'string' && item.id !== '' ? item.id : ''
    if (id === '' || used.has(id)) {
      let n = charts.length + 1
      while (used.has(`chart-${n}`)) n += 1
      id = `chart-${n}`
      repairs.push('charts.id')
    }
    used.add(id)

    const chart: ChartConfig = { id, type, stations: null, options: {} }
    if (item.stations !== undefined && item.stations !== null) {
      const stations = parseStations(item.stations, ctx, 'charts.stations', repairs)
      if (stations) chart.stations = stations
    }
    for (const key of ['x', 'y'] as const) {
      if (item[key] === undefined) continue
      const variable = pickOf(item[key], NUMERIC_VARIABLES)
      if (variable) chart[key] = variable
      else repairs.push(`charts.${key}`)
    }
    if (item.group !== undefined) {
      const group = pickOf(item.group, GROUPINGS)
      if (group) chart.group = group
      else repairs.push('charts.group')
    }
    if (item.options !== undefined) {
      if (isRecord(item.options)) {
        for (const [key, value] of Object.entries(item.options)) {
          if (
            typeof value === 'number' ||
            typeof value === 'string' ||
            typeof value === 'boolean'
          ) {
            chart.options[key] = value
          } else {
            repairs.push('charts.options')
          }
        }
      } else {
        repairs.push('charts.options')
      }
    }
    charts.push(chart)
  }
  return charts
}

// Leakage rule: training must end strictly before testing starts. A model
// that breaks it is rejected completely, never half-repaired.
function parseModel(
  raw: unknown,
  ctx: StateContext,
  repairs: string[],
): ModelConfig | undefined {
  if (raw === undefined) return undefined
  if (!isRecord(raw) || !Array.isArray(raw.features)) {
    repairs.push('model')
    return undefined
  }
  const features = raw.features.filter(
    (item): item is string => typeof item === 'string',
  )
  if (features.length !== raw.features.length) repairs.push('model.features')

  const train = parsePeriod(raw.trainPeriod, ctx)
  const test = parsePeriod(raw.testPeriod, ctx)
  if (!train || !test) {
    repairs.push('model')
    return undefined
  }
  if (!sameDays(raw.trainPeriod, train) || !sameDays(raw.testPeriod, test)) {
    repairs.push('model.period')
  }
  if (train[1] >= test[0]) {
    repairs.push('model.overlap')
    return undefined
  }
  return { features, trainPeriod: train, testPeriod: test }
}

// A group condition read from outside: unknown groupings and keys are dropped
// (reported), the result is normalised.
function parseCondition(raw: unknown): { condition: Condition; clean: boolean } | null {
  if (!isRecord(raw)) return null
  let clean = true
  const found: Condition = {}
  for (const [key, value] of Object.entries(raw)) {
    const grouping = pickOf(key, CONDITION_GROUPINGS)
    if (!grouping || !Array.isArray(value)) {
      clean = false
      continue
    }
    const allowed: readonly string[] = CONDITION_KEYS[grouping]
    const keys = value.filter((item): item is string => typeof item === 'string' && allowed.includes(item))
    if (keys.length !== value.length) clean = false
    found[grouping] = keys
  }
  return { condition: normalizeCondition(found), clean }
}

function parseCompare(raw: unknown, repairs: string[]): CompareConfig | undefined {
  if (raw === undefined) return undefined
  if (!isRecord(raw)) {
    repairs.push('compare')
    return undefined
  }
  const fallback = defaultCompare()
  const a = parseCondition(raw.a)
  if (!a || !a.clean) repairs.push('compare.a')
  let b: Condition | null = null
  if (raw.b !== undefined && raw.b !== null) {
    const parsed = parseCondition(raw.b)
    if (parsed) b = parsed.condition
    if (!parsed || !parsed.clean) repairs.push('compare.b')
  }
  return { a: a ? a.condition : fallback.a, b }
}

// Checks a loaded or shared state. A wrong version or a non-object gives the
// default state; broken parts are replaced by defaults and listed in repairs.
export function parseState(raw: unknown, ctx: StateContext): ParseResult {
  const fallback = defaultState(ctx)
  if (!isRecord(raw)) return { state: fallback, repairs: ['state'] }
  if (raw.version !== STATE_VERSION) {
    return { state: fallback, repairs: ['version'] }
  }
  const repairs: string[] = []

  const mode = pickOf(raw.mode, MODES)
  if (!mode) repairs.push('mode')

  const stations = parseStations(raw.stations, ctx, 'stations', repairs)

  const charts = parseCharts(raw.charts, ctx, repairs)
  const model = parseModel(raw.model, ctx, repairs)
  const compare = parseCompare(raw.compare, repairs)

  const state: PlaygroundState = {
    version: STATE_VERSION,
    mode: mode ?? fallback.mode,
    stations: stations ?? fallback.stations,
    selection: parseSelection(raw.selection, ctx, repairs),
    charts: charts.length > 0 ? charts : fallback.charts,
  }
  if (model) state.model = model
  if (compare) state.compare = compare
  return { state, repairs }
}