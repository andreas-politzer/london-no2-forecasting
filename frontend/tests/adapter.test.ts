import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildEngine, toEngineInput } from '../src/playground/adapter'
import type { PlaygroundData } from '../src/playground/data'
import { groupStats, selectDays, valuesOf } from '../src/playground/engine'
import { defaultSelection, type StateContext } from '../src/playground/state'

const base = new URL('../public/data/playground/', import.meta.url)
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(name, base), 'utf-8'))

const meta = read('playground_meta.json')
const calendar = read('calendar.json')
const weather = read('weather.json')
const reference = JSON.parse(
  readFileSync(new URL('./reference/engine_reference.json', import.meta.url), 'utf-8'),
)

const stations: string[] = Object.keys(meta.definitions.measured_days)
const no2 = Object.fromEntries(
  stations.map((code) => [code, read(`no2_${code}.json`).no2]),
)

const data: PlaygroundData = { dates: [], calendar, weather, meta, no2 }

describe('toEngineInput', () => {
  it('passes the loaded files through unchanged', () => {
    expect(toEngineInput(data)).toEqual({
      firstDay: meta.first_day,
      days: meta.days,
      weekday: calendar.weekday,
      holiday: calendar.holiday,
      corona: calendar.corona,
      ulez: calendar.ulez,
      weather: weather.series,
      no2,
      thresholds: meta.definitions.thresholds,
    })
  })

  it('has one value per day on every axis', () => {
    const input = toEngineInput(data)
    expect(input.weekday).toHaveLength(input.days)
    expect(input.holiday).toHaveLength(input.days)
    expect(input.corona).toHaveLength(input.days)
    expect(input.ulez).toHaveLength(input.days)
    for (const series of Object.values(input.weather)) {
      expect(series).toHaveLength(input.days)
    }
    for (const series of Object.values(input.no2)) {
      expect(series).toHaveLength(input.days)
    }
  })

  it('takes the thresholds from the data, not from constants', () => {
    const changed: PlaygroundData = {
      ...data,
      meta: {
        ...meta,
        definitions: {
          ...meta.definitions,
          thresholds: { ...meta.definitions.thresholds, wind_windy_min_kmh: 99 },
        },
      },
    }
    const { flags } = buildEngine(changed)
    expect(flags.wind_windy.filter(Boolean)).toHaveLength(0)
  })
})

describe('buildEngine end to end', () => {
  const engine = buildEngine(data)
  const ctx: StateContext = {
    stations,
    defaultStation: stations[0],
    firstDay: meta.first_day,
    lastDay: meta.last_day,
  }

  it('builds axis and flags for all days', () => {
    expect(engine.axis.days).toBe(meta.days)
    expect(engine.flags.all.filter(Boolean)).toHaveLength(meta.days)
    expect(engine.flags.wind_windy.filter(Boolean)).toHaveLength(
      reference.all_days.wind_windy,
    )
  })

  it('reproduces the Python numbers for windy days at KC1', () => {
    const mask = selectDays(engine.input, defaultSelection(ctx), stations, engine.axis)
    const groups = groupStats(engine.input, engine.axis, mask, 'windClass', 'no2', 'KC1')
    const windy = groups.find((g) => g.key === 'windy')
    const expected = reference.stations.KC1.wind_windy
    expect(windy?.n).toBe(expected.n)
    expect(windy?.mean).toBeCloseTo(expected.mean, 9)
    expect(windy?.median).toBeCloseTo(expected.median, 9)
  })

  it('refuses a station whose NO2 file was not loaded', () => {
    const partial = buildEngine({ ...data, no2: { KC1: no2.KC1 } })
    expect(() => valuesOf(partial.input, 'no2', 'BL0')).toThrow('unknown station: BL0')
    expect(valuesOf(partial.input, 'no2', 'KC1')).toHaveLength(meta.days)
  })
})