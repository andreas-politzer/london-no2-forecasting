import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildEngine } from '../src/playground/adapter'
import {
  distributionSeries,
  distributionShape,
  kdeCurve,
  overlayOnShape,
  roundBound,
} from '../src/playground/charts/distributionData'
import { brushRange, linearInvert, linearScale } from '../src/playground/charts/svg'
import {
  SMOOTH_WINDOWS,
  markedRuns,
  timelineSeries,
  toWindow,
  yearlyMeans,
} from '../src/playground/charts/timelineData'
import type { PlaygroundData } from '../src/playground/data'
import { selectDays } from '../src/playground/engine'
import { defaultSelection, type StateContext } from '../src/playground/state'
import { kdeProfiles } from '../src/playground/stats'

const base = new URL('../public/data/playground/', import.meta.url)
const read = (name: string) => JSON.parse(readFileSync(new URL(name, base), 'utf-8'))
const meta = read('playground_meta.json')
const stations = ['BL0', 'KC1']
const no2 = Object.fromEntries(stations.map((code) => [code, read(`no2_${code}.json`).no2]))
const data: PlaygroundData = { dates: [], calendar: read('calendar.json'), weather: read('weather.json'), meta, no2 }
const engine = buildEngine(data)
const ctx: StateContext = { stations, defaultStation: 'BL0', firstDay: meta.first_day, lastDay: meta.last_day }
const all = selectDays(engine.input, defaultSelection(ctx), stations, engine.axis)
const winter = selectDays(engine.input, { ...defaultSelection(ctx), months: [12, 1, 2] }, stations, engine.axis)

const count = (mask: boolean[], series: (number | null)[]) =>
  series.reduce<number>((n, v, i) => n + (mask[i] && v !== null ? 1 : 0), 0)

describe('timeline data', () => {
  it('reads the window option safely', () => {
    expect(toWindow(7)).toBe(7)
    expect(toWindow('x')).toBe(30)
    expect(toWindow(undefined)).toBe(30)
    expect(SMOOTH_WINDOWS).toContain(365)
  })
  it('NO2 gives one series per station, weather exactly one', () => {
    expect(timelineSeries(engine, 'no2', 30, all, stations).map((s) => s.code)).toEqual(stations)
    expect(timelineSeries(engine, 'temperature_2m_mean', 30, all, stations)).toHaveLength(1)
  })
  it('days outside the filter are gaps', () => {
    const [s] = timelineSeries(engine, 'no2', 1, winter, ['BL0'])
    expect(s.raw.every((v, i) => winter[i] || v === null)).toBe(true)
    expect(s.smooth).toBe(s.raw)
    expect(s.raw.filter((v) => v !== null).length).toBe(count(winter, engine.input.no2.BL0))
  })
  it('a 7-day mean equals the plain mean of its window', () => {
    const [s] = timelineSeries(engine, 'no2', 7, all, ['BL0'])
    const i = 2000
    const window = s.raw.slice(i - 3, i + 4).filter((v): v is number => v !== null)
    expect(window.length).toBeGreaterThanOrEqual(4)
    expect(s.smooth[i]).toBeCloseTo(window.reduce((a, b) => a + b, 0) / window.length, 10)
  })
  it('yearly means weigh back to the overall mean', () => {
    const [s] = timelineSeries(engine, 'no2', 1, all, ['BL0'])
    const rows = yearlyMeans(engine.axis.year, s.raw)
    const total = rows.reduce((sum, r) => sum + (r.mean ?? 0) * r.n, 0)
    const n = rows.reduce((sum, r) => sum + r.n, 0)
    const values = s.raw.filter((v): v is number => v !== null)
    expect(n).toBe(values.length)
    expect(total / n).toBeCloseTo(values.reduce((a, b) => a + b, 0) / values.length, 8)
    expect(rows.map((r) => r.year)).toEqual([...rows.map((r) => r.year)].sort((a, b) => a - b))
  })
  it('marked runs', () => {
    expect(markedRuns([false, true, true, false, true])).toEqual([[1, 2], [4, 4]])
    expect(markedRuns([true, true])).toEqual([[0, 1]])
    expect(markedRuns([false, false])).toEqual([])
  })
})

describe('distribution data', () => {
  it('without grouping: one series per station with the right counts', () => {
    const built = distributionSeries(engine, winter, 'no2', 'none', stations, stations)
    expect(built.series.map((s) => s.key)).toEqual(stations)
    stations.forEach((code, i) => expect(built.series[i].values.length).toBe(count(winter, engine.input.no2[code])))
    expect(built.station).toBeNull()
    expect(built.tooMany).toBe(false)
  })
  it('colour follows the station, not its position', () => {
    const only = distributionSeries(engine, all, 'no2', 'none', ['KC1'], stations)
    const both = distributionSeries(engine, all, 'no2', 'none', stations, stations)
    expect(only.series[0].color).toBe(both.series[1].color)
  })
  it('with grouping: groups partition the days of the first station', () => {
    const built = distributionSeries(engine, all, 'no2', 'weekday', stations, stations)
    expect(built.series).toHaveLength(7)
    const total = built.series.reduce((sum, s) => sum + s.values.length, 0)
    expect(total).toBe(count(all, engine.input.no2.BL0))
    expect(built.station).toBe('BL0')
  })
  it('more groups than colours draw nothing and say so', () => {
    for (const grouping of ['month', 'year'] as const) {
      const built = distributionSeries(engine, all, 'no2', grouping, stations, stations)
      expect(built.series).toHaveLength(0)
      expect(built.tooMany).toBe(true)
    }
  })
  it('weather without grouping is one series over all days', () => {
    const built = distributionSeries(engine, all, 'temperature_2m_mean', 'none', stations, stations)
    expect(built.series).toHaveLength(1)
    expect(built.series[0].values.length).toBe(count(all, engine.input.weather.temperature_2m_mean))
  })
  it('flags few days, and only those', () => {
    const few = all.map((_, i) => i >= 6000 && i < 6010)
    expect(distributionSeries(engine, few, 'no2', 'none', ['BL0'], stations).series[0].low).toBe(true)
    expect(distributionSeries(engine, all, 'no2', 'none', ['BL0'], stations).series[0].low).toBe(false)
  })
})

describe('distribution shape', () => {
  const groups = distributionSeries(engine, all, 'no2', 'none', stations, stations).series.map((s) => s.values)
  it('histogram shares add up to one per series', () => {
    const shape = distributionShape(groups, 'histogram', undefined, 1)
    expect(shape?.kind).toBe('histogram')
    if (shape?.kind !== 'histogram') return
    for (const bars of shape.bars) expect(bars.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1, 10)
  })
  it('an explicit class count is respected', () => {
    const shape = distributionShape(groups, 'histogram', 20, 1)
    expect(shape?.kind === 'histogram' && shape.bars[0].length).toBe(20)
  })
  it('density curves integrate to about one', () => {
    const shape = distributionShape(groups, 'density', undefined, 1)
    expect(shape?.kind).toBe('density')
    if (shape?.kind !== 'density') return
    for (const curve of shape.curves) {
      expect(curve).not.toBeNull()
      let area = 0
      for (let i = 1; i < shape.grid.length; i += 1) {
        area += ((curve as number[])[i] + (curve as number[])[i - 1]) / 2 * (shape.grid[i] - shape.grid[i - 1])
      }
      expect(area).toBeGreaterThan(0.97)
      expect(area).toBeLessThan(1.03)
    }
  })
  it('a wider bandwidth gives a smoother curve', () => {
    const narrow = distributionShape(groups, 'density', undefined, 0.5)
    const wide = distributionShape(groups, 'density', undefined, 2)
    if (narrow?.kind !== 'density' || wide?.kind !== 'density') throw new Error('density expected')
    expect(wide.bandwidth).toBeCloseTo(narrow.bandwidth * 4, 10)
  })
  it('nothing to draw gives null', () => {
    expect(distributionShape([[], []], 'histogram', undefined, 1)).toBeNull()
  })
  it('kdeCurve reproduces kdeProfiles on the same grid', () => {
    const kde = kdeProfiles(groups, { factor: 1 })
    expect(kde).not.toBeNull()
    if (!kde) return
    const again = kdeCurve(groups[0], kde.grid, kde.bandwidth) as number[]
    const first = kde.curves[0] as number[]
    again.forEach((v, i) => expect(v).toBeCloseTo(first[i], 12))
  })
  it('marked days drawn on the same bins never exceed the days of the main series', () => {
    const shape = distributionShape(groups, 'histogram', undefined, 1)
    if (shape?.kind !== 'histogram') throw new Error('histogram expected')
    const subset = groups.map((values) => values.filter((_, i) => i % 3 === 0))
    const over = overlayOnShape(shape, subset)
    if (over.kind !== 'histogram') throw new Error('histogram expected')
    over.bars.forEach((bars, s) => {
      expect(bars.length).toBe(shape.bars[s].length)
      expect(bars.reduce((sum, b) => sum + b.count, 0)).toBe(subset[s].length)
    })
  })
  it('rounds brushed bounds to three digits', () => {
    expect(roundBound(12.3456)).toBe(12.3)
    expect(roundBound(0.012345)).toBe(0.0123)
    expect(roundBound(1234.5)).toBe(1230)
  })
})

describe('brush helpers', () => {
  it('linearInvert undoes linearScale', () => {
    const scale = linearScale(2, 12, 50, 250)
    const invert = linearInvert(2, 12, 50, 250)
    for (const v of [2, 5.5, 12]) expect(invert(scale(v))).toBeCloseTo(v, 10)
  })
  it('brushRange sorts and ignores short drags', () => {
    expect(brushRange(100, 40)).toEqual([40, 100])
    expect(brushRange(10, 12)).toBeNull()
    expect(brushRange(10, 14)).toEqual([10, 14])
  })
})
