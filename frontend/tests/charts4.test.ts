import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildEngine } from '../src/playground/adapter'
import { cellValues } from '../src/playground/charts/boxData'
import { SEQUENTIAL, divergingColor, rampColor, textOn } from '../src/playground/charts/colors'
import { dotsPath, scatterSeries } from '../src/playground/charts/scatterData'
import type { PlaygroundData } from '../src/playground/data'
import { selectDays } from '../src/playground/engine'
import { VARIABLE_LABELS, VARIABLE_SHORT } from '../src/playground/labels'
import { defaultSelection, NUMERIC_VARIABLES, type StateContext } from '../src/playground/state'

const base = new URL('../public/data/playground/', import.meta.url)
const read = (name: string) => JSON.parse(readFileSync(new URL(name, base), 'utf-8'))
const meta = read('playground_meta.json')
const stations = ['BL0', 'KC1']
const no2 = Object.fromEntries(stations.map((code) => [code, read(`no2_${code}.json`).no2]))
const data: PlaygroundData = { dates: [], calendar: read('calendar.json'), weather: read('weather.json'), meta, no2 }
const engine = buildEngine(data)
const ctx: StateContext = { stations, defaultStation: 'BL0', firstDay: meta.first_day, lastDay: meta.last_day }
const all = selectDays(engine.input, defaultSelection(ctx), stations, engine.axis)
const count = (mask: boolean[], series: (number | null)[]) =>
  series.reduce<number>((n, v, i) => n + (mask[i] && v !== null ? 1 : 0), 0)

describe('box data', () => {
  it('groups partition the days with a value', () => {
    const { keys, values } = cellValues(engine, all, 'no2', 'season', 'BL0')
    expect(keys).toHaveLength(4)
    expect(values.reduce((s, v) => s + v.length, 0)).toBe(count(all, engine.input.no2.BL0))
  })
  it('works for weather and for no grouping', () => {
    const { keys, values } = cellValues(engine, all, 'temperature_2m_mean', 'none', 'BL0')
    expect(keys).toEqual(['all'])
    expect(values[0].length).toBe(count(all, engine.input.weather.temperature_2m_mean))
  })
})

describe('scatter data', () => {
  it('NO2 on an axis: one series per station, with a fit', () => {
    const series = scatterSeries(engine, all, 'temperature_2m_mean', 'no2', stations)
    expect(series.map((s) => s.code)).toEqual(stations)
    for (const s of series) {
      expect(s.pairs.x.length).toBe(s.pairs.y.length)
      expect(s.fit?.n).toBe(s.pairs.x.length)
      expect(s.fit?.slope).toBeLessThan(0) // warmer days have lower NO2
    }
  })
  it('two weather variables: a single series', () => {
    expect(scatterSeries(engine, all, 'temperature_2m_mean', 'wind_speed_10m_mean', stations)).toHaveLength(1)
  })
  it('dots path has one dot per point', () => {
    expect(dotsPath([[1, 2], [3.14159, 4]])).toBe('M1.0 2.0h0M3.1 4.0h0')
    expect(dotsPath([])).toBe('')
  })
})

describe('colours', () => {
  it('ramp ends on the ends of the sequential palette and is clamped', () => {
    expect(rampColor(0)).toBe(SEQUENTIAL[0])
    expect(rampColor(1)).toBe(SEQUENTIAL[SEQUENTIAL.length - 1])
    expect(rampColor(-5)).toBe(rampColor(0))
    expect(rampColor(7)).toBe(rampColor(1))
    expect(rampColor(Number.NaN)).toBe(rampColor(0))
  })
  it('diverging is neutral at zero, blue below and red above', () => {
    expect(divergingColor(0)).toBe('#f0efec')
    expect(divergingColor(-1)).toBe('#2a78d6')
    expect(divergingColor(1)).toBe('#e34948')
  })
  it('text colour contrasts with the background', () => {
    expect(textOn('#ffffff')).toBe('#0f172a')
    expect(textOn('#0d366b')).toBe('#ffffff')
  })
})

describe('labels', () => {
  it('every variable has a long and a short label', () => {
    for (const v of NUMERIC_VARIABLES) {
      expect(VARIABLE_LABELS[v].length).toBeGreaterThan(0)
      expect(VARIABLE_SHORT[v].length).toBeGreaterThan(0)
    }
  })
})
