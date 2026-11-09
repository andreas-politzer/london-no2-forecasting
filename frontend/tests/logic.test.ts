import { describe, expect, it } from 'vitest'
import {
  addChart,
  changeChartType,
  duplicateChart,
  effectiveStations,
  nextChartId,
  removeChart,
  setChartOption,
  toggleStation,
  updateChart,
} from '../src/playground/charts/chartActions'
import { bandScale, formatNumber, formatValue, linePath, linearScale, niceDomain, niceTicks, roundedTopBar } from '../src/playground/charts/svg'
import {
  addRange,
  countSelected,
  parseBound,
  removeRange,
  setPeriodBound,
  setRangeBound,
  toggleInList,
} from '../src/playground/filter/filterLogic'
import { defaultState, type StateContext } from '../src/playground/state'

const ctx: StateContext = { stations: ['BL0', 'EA6', 'KC1'], defaultStation: 'BL0', firstDay: '2010-01-01', lastDay: '2026-10-31' }

describe('chart actions', () => {
  const start = defaultState(ctx)
  it('adds charts with fresh ids', () => {
    const next = addChart(addChart(start, 'bars', { y: 'no2' }), 'bars', {})
    const ids = next.charts.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(nextChartId(next.charts)).not.toBe('')
  })
  it('never removes the last chart', () => {
    expect(removeChart(start, start.charts[0].id).charts).toHaveLength(start.charts.length)
    const two = addChart(start, 'bars', {})
    expect(removeChart(two, two.charts[1].id).charts).toHaveLength(two.charts.length - 1)
  })
  it('duplicates independently of the original', () => {
    const copy = duplicateChart(start, start.charts[0].id)
    expect(copy.charts).toHaveLength(start.charts.length + 1)
    const changed = setChartOption(copy, copy.charts[1].id, 'stat', 'median')
    expect(changed.charts[0].options.stat).toBe(start.charts[0].options.stat)
  })
  it('changing the type keeps only the station choice', () => {
    const own = updateChart(start, start.charts[0].id, { stations: ['EA6'] })
    const changed = changeChartType(own, start.charts[0].id, 'bars', { y: 'no2' })
    expect(changed.charts[0].stations).toEqual(['EA6'])
    expect(changed.charts[0].id).toBe(start.charts[0].id)
  })
  it('toggles stations: at least one, fixed order', () => {
    expect(toggleStation(['BL0'], 'BL0', ctx.stations)).toEqual(['BL0'])
    expect(toggleStation(['KC1'], 'BL0', ctx.stations)).toEqual(['BL0', 'KC1'])
  })
  it('effective stations: own choice or global', () => {
    const chart = { ...start.charts[0], stations: ['KC1'] }
    expect(effectiveStations(chart, ['BL0'], ctx.stations)).toEqual(['KC1'])
    expect(effectiveStations({ ...chart, stations: null }, ['BL0'], ctx.stations)).toEqual(['BL0'])
    expect(effectiveStations({ ...chart, stations: ['XXX'] }, ['BL0'], ctx.stations)).toEqual(['BL0'])
  })
})

describe('filter logic', () => {
  const sel = defaultState(ctx).selection
  it('toggleInList', () => {
    const all = [1, 2, 3]
    expect(toggleInList(null, 2, all)).toEqual([2])
    expect(toggleInList([2], 3, all)).toEqual([2, 3])
    expect(toggleInList([2, 3], 1, all)).toBeNull()
    expect(toggleInList([2], 2, all)).toBeNull()
  })
  it('parseBound', () => {
    expect(parseBound('')).toBeNull()
    expect(parseBound(' 3,5 ')).toBe(3.5)
    expect(parseBound('abc')).toBeUndefined()
  })
  it('ranges', () => {
    const added = addRange(sel, 'no2')
    expect(added.ranges.no2).toEqual([null, null])
    expect(addRange(added, 'no2')).toBe(added)
    const set = setRangeBound(setRangeBound(added, 'no2', 0, '10'), 'no2', 1, '50,5')
    expect(set.ranges.no2).toEqual([10, 50.5])
    expect(setRangeBound(set, 'no2', 0, 'x')).toBe(set)
    expect(removeRange(set, 'no2').ranges.no2).toBeUndefined()
  })
  it('period bounds', () => {
    const limits = { first: ctx.firstDay, last: ctx.lastDay }
    expect(setPeriodBound(sel, 0, '2020-02-30', limits)).toBe(sel)
    expect(setPeriodBound(sel, 0, '2005-01-01', limits)).toBe(sel)
    expect(setPeriodBound(sel, 1, '2009-01-01', limits)).toBe(sel)
    expect(setPeriodBound(sel, 0, '2020-01-01', limits).period[0]).toBe('2020-01-01')
    const narrow = setPeriodBound(sel, 1, '2020-12-31', limits)
    expect(setPeriodBound(narrow, 0, '2021-01-01', limits)).toBe(narrow)
  })
  it('countSelected', () => {
    expect(countSelected([true, false, true])).toBe(2)
  })
})

describe('svg helpers', () => {
  it('linearScale maps and survives a zero span', () => {
    const s = linearScale(0, 10, 0, 100)
    expect(s(5)).toBe(50)
    expect(linearScale(3, 3, 0, 100)(3)).toBe(50)
  })
  it('niceTicks lie on 1-2-5 steps inside the range', () => {
    const ticks = niceTicks(0, 47)
    expect(ticks[0]).toBe(0)
    expect(ticks.every((t) => t >= 0 && t <= 47)).toBe(true)
    expect(ticks[1] - ticks[0]).toBe(10)
    expect(niceTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })
  it('niceDomain covers the data', () => {
    const [lo, hi] = niceDomain(3, 47)
    expect(lo).toBeLessThanOrEqual(3)
    expect(hi).toBeGreaterThanOrEqual(47)
  })
  it('bandScale slots', () => {
    const band = bandScale(4, 0, 100, 0.2)
    expect(band.step).toBe(25)
    expect(band.width).toBe(20)
    expect(band.start(0)).toBe(2.5)
  })
  it('German number format', () => {
    expect(formatNumber(1234.5, 1)).toBe('1.234,5')
    expect(formatValue(38.923)).toBe('38,9')
    expect(formatValue(5.126)).toBe('5,13')
    expect(formatValue(1234.4)).toBe('1.234')
  })
  it('linePath lifts the pen at gaps', () => {
    const path = linePath([{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: null }, { x: 3, y: 4 }])
    expect(path).toBe('M0 1L1 2M3 4')
  })
  it('roundedTopBar is empty for degenerate bars', () => {
    expect(roundedTopBar(0, 0, 0, 10)).toBe('')
    expect(roundedTopBar(0, 0, 10, 0)).toBe('')
    expect(roundedTopBar(0, 0, 10, 10)).toMatch(/^M/)
  })
})
