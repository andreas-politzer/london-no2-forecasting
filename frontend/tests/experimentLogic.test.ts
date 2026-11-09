import { describe, expect, it } from 'vitest'
import {
  baselinesCoincide,
  errorsOf,
  germanDate,
  histogram,
  isoOfDay,
  methodRows,
  periodProblem,
  pointsWithGaps,
  spanShare,
  timeTicks,
  type Done,
} from '../src/playground/experiment/experimentLogic'

const fake = (persistenceLag: number, naiveLag: number): Done =>
  ({
    persistenceLag,
    naiveLag,
    scores: {
      model: { mae: 6, rmse: 8, bias: -1 },
      persistence: { mae: 8, rmse: 10, bias: 0.1 },
      naive: { mae: 10, rmse: 12, bias: 0.2 },
      mean: { mae: 16, rmse: 20, bias: 0.3 },
      modelTrain: { mae: 5, rmse: 7, bias: 0 },
    },
  }) as unknown as Done

describe('dates', () => {
  it('counts days from the first day, across leap days', () => {
    expect(isoOfDay('2010-01-01', 0)).toBe('2010-01-01')
    expect(isoOfDay('2010-01-01', 365)).toBe('2011-01-01')
    expect(isoOfDay('2010-01-01', 1520)).toBe('2014-03-01')
    expect(germanDate('2024-03-09')).toBe('09.03.2024')
  })
  it('shares of a span', () => {
    expect(spanShare('2020-01-01', '2020-12-31', '2020-01-01', '2020-12-31')).toEqual([0, 1])
    const [a, b] = spanShare('2020-01-01', '2020-01-10', '2020-01-06', '2020-01-10')
    expect(a).toBeCloseTo(0.5, 9)
    expect(b).toBe(1)
  })
})

describe('errors and tables', () => {
  it('error is prediction minus measurement', () => {
    expect(errorsOf([12, 8], [10, 10])).toEqual([2, -2])
  })
  it('compares every method with persistence, model first', () => {
    const rows = methodRows(fake(1, 7))
    expect(rows.map((r) => r.key)).toEqual(['model', 'persistence', 'naive', 'mean'])
    expect(rows[0].versusPersistence).toBeCloseTo(-25, 9)
    expect(rows[1].versusPersistence).toBeCloseTo(0, 9)
    expect(rows[3].versusPersistence).toBeCloseTo(100, 9)
  })
  it('knows when persistence and seasonal naive are the same method', () => {
    expect(baselinesCoincide(fake(7, 7))).toBe(true)
    expect(baselinesCoincide(fake(1, 7))).toBe(false)
    expect(baselinesCoincide(fake(30, 35))).toBe(false)
  })
})

describe('periods', () => {
  it('training must end before testing begins and both run forwards', () => {
    expect(periodProblem(['2012-01-01', '2022-12-31'], ['2023-01-01', '2024-12-31'])).toBeNull()
    expect(periodProblem(['2012-01-01', '2023-01-01'], ['2023-01-01', '2024-12-31'])).toBe('overlap')
    expect(periodProblem(['2012-01-01', '2023-06-01'], ['2023-01-01', '2024-12-31'])).toBe('overlap')
    expect(periodProblem(['2022-01-01', '2012-01-01'], ['2023-01-01', '2024-12-31'])).toBe('order')
  })
})

describe('chart data', () => {
  it('a histogram counts every value once, on a range symmetric around zero', () => {
    const values = [-3, -1, 0, 0.5, 2, 3]
    const h = histogram(values, 6)
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(values.length)
    expect(h.edges[0]).toBe(-h.edges[h.edges.length - 1])
  })
  it('a gap of days lifts the line', () => {
    const points = pointsWithGaps([1, 2, 5], [10, 11, 12], (d) => d, (v) => v)
    expect(points.map((p) => p.y)).toEqual([10, 11, null, 12])
  })
  it('time ticks fall on January 1st for long spans', () => {
    const ticks = timeTicks('2010-01-01', 4000, 5500)
    expect(ticks.length).toBeGreaterThan(0)
    for (const tick of ticks) expect(isoOfDay('2010-01-01', tick.index)).toBe(`${tick.label}-01-01`)
  })
})
