import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildEngine } from '../src/playground/adapter'
import {
  compareStats,
  conditionMask,
  conditionToSelection,
  describeCondition,
  isEmptyCondition,
  keyHint,
  splitGroups,
  toggleKey,
} from '../src/playground/compare/compareLogic'
import type { PlaygroundData } from '../src/playground/data'
import { assignGroups, selectDays } from '../src/playground/engine'
import {
  CONDITION_GROUPINGS,
  CONDITION_KEYS,
  defaultCompare,
  defaultSelection,
  defaultState,
  normalizeCondition,
  parseState,
  type Condition,
  type DaySelection,
  type StateContext,
} from '../src/playground/state'

const base = new URL('../public/data/playground/', import.meta.url)
const read = (name: string) => JSON.parse(readFileSync(new URL(name, base), 'utf-8'))
const meta = read('playground_meta.json')
const stations = ['BL0', 'KC1']
const no2 = Object.fromEntries(stations.map((code) => [code, read(`no2_${code}.json`).no2]))
const data: PlaygroundData = { dates: [], calendar: read('calendar.json'), weather: read('weather.json'), meta, no2 }
const engine = buildEngine(data)
const th = meta.definitions.thresholds
const ctx: StateContext = { stations, defaultStation: 'BL0', firstDay: meta.first_day, lastDay: meta.last_day }
const all = selectDays(engine.input, defaultSelection(ctx), stations, engine.axis)
const same = (a: boolean[], b: boolean[]) => a.length === b.length && a.every((v, i) => v === b[i])
const count = (mask: boolean[]) => mask.reduce((n, on) => n + (on ? 1 : 0), 0)
const and = (a: boolean[], b: boolean[]) => a.map((v, i) => v && b[i])

describe('condition keys', () => {
  it('match the classes of the engine', () => {
    for (const grouping of CONDITION_GROUPINGS) {
      expect([...CONDITION_KEYS[grouping]]).toEqual(assignGroups(engine.input, engine.axis, grouping).keys)
    }
  })
  it('normalises: order, duplicates, empty and complete lists', () => {
    expect(normalizeCondition({ season: ['summer', 'winter', 'winter'] })).toEqual({ season: ['winter', 'summer'] })
    expect(normalizeCondition({ snowDay: ['snow', 'noSnow'] })).toEqual({})
    expect(normalizeCondition({ windClass: [] })).toEqual({})
  })
  it('toggles a class on and off', () => {
    const one = toggleKey({}, 'windClass', 'windy')
    expect(one).toEqual({ windClass: ['windy'] })
    expect(toggleKey(one, 'windClass', 'windy')).toEqual({})
    expect(toggleKey({ snowDay: ['snow'] }, 'snowDay', 'noSnow')).toEqual({})
    expect(isEmptyCondition({})).toBe(true)
    expect(isEmptyCondition(one)).toBe(false)
  })
})

describe('condition masks', () => {
  it('a single class equals the engine flag', () => {
    expect(same(conditionMask(engine, { windClass: ['windy'] }, all), engine.flags.wind_windy)).toBe(true)
    expect(same(conditionMask(engine, { windClass: ['calm'] }, all), engine.flags.wind_calm)).toBe(true)
    expect(same(conditionMask(engine, { rainClass: ['veryWet'] }, all), engine.flags.rain_very_wet)).toBe(true)
    expect(same(conditionMask(engine, { snowDay: ['snow'] }, all), engine.flags.snow_day)).toBe(true)
    expect(same(conditionMask(engine, { temperatureClass: ['frost'] }, all), engine.flags.frost_day)).toBe(true)
    expect(same(conditionMask(engine, { season: ['winter'] }, all), engine.flags.season_winter)).toBe(true)
    expect(same(conditionMask(engine, { dayType: ['bankHoliday'] }, all), engine.flags.bank_holiday)).toBe(true)
    expect(same(conditionMask(engine, { corona: ['2'] }, all), engine.flags.corona_2)).toBe(true)
  })
  it('"or" inside a row, "and" between rows', () => {
    const wetOrVery = conditionMask(engine, { rainClass: ['wet', 'veryWet'] }, all)
    expect(same(wetOrVery, engine.flags.rain_wet)).toBe(true)
    const both = conditionMask(engine, { windClass: ['windy'], season: ['winter'] }, all)
    expect(same(both, and(engine.flags.wind_windy, engine.flags.season_winter))).toBe(true)
    expect(count(both)).toBeGreaterThan(0)
  })
  it('stays inside the base and an empty condition keeps the base', () => {
    const some = all.map((_, i) => i % 3 === 0)
    expect(same(conditionMask(engine, {}, some), some)).toBe(true)
    const windy = conditionMask(engine, { windClass: ['windy'] }, some)
    expect(windy.every((on, i) => !on || some[i])).toBe(true)
  })
})

describe('splitting into A and B', () => {
  it('"all other days" is the exact complement inside the filter', () => {
    const filter = all.map((_, i) => i > 1000)
    const split = splitGroups(engine, filter, { a: { windClass: ['windy'] }, b: null })
    expect(same(split.a.map((v, i) => v || split.b[i]), filter)).toBe(true)
    expect(split.a.some((v, i) => v && split.b[i])).toBe(false)
    expect(split.overlap).toBe(0)
  })
  it('an own B never contains days of A, and overlap is counted', () => {
    const split = splitGroups(engine, all, {
      a: { season: ['winter'] },
      b: { windClass: ['windy'] },
    })
    expect(split.a.some((v, i) => v && split.b[i])).toBe(false)
    const both = count(and(engine.flags.season_winter, engine.flags.wind_windy))
    expect(split.overlap).toBe(both)
    expect(count(split.b)).toBe(count(engine.flags.wind_windy) - both)
  })
})

describe('comparison numbers', () => {
  it('count the days and values and take the difference of the means', () => {
    const split = splitGroups(engine, all, { a: { windClass: ['windy'] }, b: null })
    const [kc1] = compareStats(engine, split, ['KC1'])
    const series = engine.input.no2.KC1
    const valuesA = series.filter((v, i) => split.a[i] && v !== null) as number[]
    const valuesB = series.filter((v, i) => split.b[i] && v !== null) as number[]
    expect(kc1.a.n).toBe(valuesA.length)
    expect(kc1.b.n).toBe(valuesB.length)
    expect(kc1.a.days).toBe(count(split.a))
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
    expect(kc1.diff).toBeCloseTo(mean(valuesA) - mean(valuesB), 9)
    expect(kc1.diff as number).toBeLessThan(0) // windy days have lower NO2
    expect(kc1.percent).toBeCloseTo(((kc1.diff as number) / mean(valuesB)) * 100, 9)
    expect(kc1.a.low).toBe(false)
    expect(kc1.a.days - kc1.a.n).toBe(count(split.a) - valuesA.length) // days without a value
  })
  it('hides statistics when a group has fewer than ten values', () => {
    const few = all.map((_, i) => i >= 4000 && i < 4008)
    const split = splitGroups(engine, few, { a: { season: ['winter'] }, b: null })
    const [kc1] = compareStats(engine, split, ['KC1'])
    const smaller = kc1.a.n < kc1.b.n ? kc1.a : kc1.b
    expect(smaller.tooFew).toBe(true)
    expect(kc1.diff).toBeNull()
    expect(kc1.percent).toBeNull()
  })
  it('flags groups under the warning limit', () => {
    const filter = all.map((_, i) => i >= 4000 && i < 4020)
    const split = splitGroups(engine, filter, { a: {}, b: null })
    const [kc1] = compareStats(engine, split, ['KC1'])
    expect(kc1.a.low).toBe(true)
    expect(kc1.b.days).toBe(0)
    expect(kc1.b.n).toBe(0)
  })
  it('gives one result per station, in order', () => {
    const split = splitGroups(engine, all, defaultCompare())
    expect(compareStats(engine, split, ['KC1', 'BL0']).map((r) => r.code)).toEqual(['KC1', 'BL0'])
  })
})

describe('condition as a day filter', () => {
  const filters: Record<string, DaySelection> = {
    all: defaultSelection(ctx),
    restricted: { ...defaultSelection(ctx), months: [1, 2, 3, 10, 11, 12], period: ['2016-01-01', '2024-12-31'] },
    workdays: { ...defaultSelection(ctx), weekdays: [0, 1, 2, 3, 4], holiday: 'exclude' },
  }
  const conditions: Condition[] = [
    {},
    { windClass: ['windy'] },
    { windClass: ['calm'] },
    { windClass: ['normal'] },
    { rainClass: ['veryWet'] },
    { rainClass: ['wet', 'veryWet'] },
    { rainClass: ['dry'] },
    { snowDay: ['snow'] },
    { temperatureClass: ['frost'] },
    { season: ['winter'] },
    { season: ['winter', 'autumn'] },
    { dayType: ['workday'] },
    { dayType: ['weekend'] },
    { dayType: ['bankHoliday'] },
    { corona: ['2'] },
    { ulez: ['2', '3'] },
    { windClass: ['windy'], season: ['winter'] },
    { windClass: ['calm'], rainClass: ['wet', 'veryWet'], season: ['autumn'] },
    { dayType: ['weekend'], corona: ['1', '2'], ulez: ['1'] },
    { snowDay: ['snow'], temperatureClass: ['frost'] },
  ]
  let answered = 0
  let refused = 0
  for (const [name, selection] of Object.entries(filters)) {
    it(`is exact whenever it answers (${name})`, () => {
      const filter = selectDays(engine.input, selection, stations, engine.axis)
      for (const condition of conditions) {
        const result = conditionToSelection(selection, condition, th)
        if (result === null) {
          refused += 1
          continue
        }
        answered += 1
        const via = selectDays(engine.input, result, stations, engine.axis)
        expect(same(via, conditionMask(engine, condition, filter)), JSON.stringify(condition)).toBe(true)
      }
    })
  }
  it('answers for plain lower limits and refuses strict classes', () => {
    expect(answered).toBeGreaterThan(20)
    expect(refused).toBeGreaterThan(5)
    const sel = defaultSelection(ctx)
    expect(conditionToSelection(sel, { rainClass: ['wet', 'veryWet'] }, th)?.ranges.precipitation_sum).toEqual([
      th.rain_wet_min_mm,
      null,
    ])
    expect(conditionToSelection(sel, { rainClass: ['wet'] }, th)).toBeNull()
    expect(conditionToSelection(sel, { temperatureClass: ['frost'] }, th)).toBeNull()
  })
})

describe('texts', () => {
  it('describes a condition in words', () => {
    expect(describeCondition({})).toBe('alle Tage')
    expect(describeCondition({ windClass: ['windy'], season: ['winter', 'autumn'] })).toBe('windig und Winter oder Herbst')
  })
  it('takes the limits from the data', () => {
    expect(keyHint('windClass', 'windy', th)).toContain(String(th.wind_windy_min_kmh).replace('.', ','))
    expect(keyHint('snowDay', 'snow', th)).toContain('0,5')
    expect(keyHint('season', 'winter', th)).toBeUndefined()
  })
})

describe('compare in the state', () => {
  const raw = (compare: unknown) => ({ ...JSON.parse(JSON.stringify(defaultState(ctx))), compare })
  it('is optional', () => {
    const parsed = parseState(JSON.parse(JSON.stringify(defaultState(ctx))), ctx)
    expect(parsed.state.compare).toBeUndefined()
    expect(parsed.repairs).toEqual([])
  })
  it('keeps a valid comparison unchanged', () => {
    const compare = { a: { windClass: ['windy'], season: ['winter'] }, b: { windClass: ['calm'] } }
    const parsed = parseState(raw(compare), ctx)
    expect(parsed.state.compare).toEqual(compare)
    expect(parsed.repairs).toEqual([])
  })
  it('keeps "all other days"', () => {
    const parsed = parseState(raw({ a: { snowDay: ['snow'] }, b: null }), ctx)
    expect(parsed.state.compare).toEqual({ a: { snowDay: ['snow'] }, b: null })
  })
  it('drops unknown groupings and classes and reports it', () => {
    const parsed = parseState(raw({ a: { windClass: ['windy', 'gale'], moon: ['full'] }, b: null }), ctx)
    expect(parsed.state.compare?.a).toEqual({ windClass: ['windy'] })
    expect(parsed.repairs).toContain('compare.a')
  })
  it('replaces a broken group A and a broken group B', () => {
    const parsed = parseState(raw({ a: 'x', b: 5 }), ctx)
    expect(parsed.state.compare).toEqual({ a: defaultCompare().a, b: null })
    expect(parsed.repairs).toEqual(expect.arrayContaining(['compare.a', 'compare.b']))
  })
  it('rejects a comparison that is not an object', () => {
    const parsed = parseState(raw([1]), ctx)
    expect(parsed.state.compare).toBeUndefined()
    expect(parsed.repairs).toContain('compare')
  })
})
