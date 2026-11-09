import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildEngine } from '../src/playground/adapter'
import {
  highlightMask,
  highlightToSelection,
  intersectRange,
  mergeRanges,
  toggleGroupHighlight,
  type Highlight,
} from '../src/playground/charts/highlight'
import type { PlaygroundData } from '../src/playground/data'
import { assignGroups, selectDays } from '../src/playground/engine'
import {
  GROUPINGS,
  defaultSelection,
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

const filters: Record<string, DaySelection> = {
  all: defaultSelection(ctx),
  restricted: { ...defaultSelection(ctx), months: [1, 2, 3, 10, 11, 12], period: ['2016-01-01', '2024-12-31'] },
  workdays: { ...defaultSelection(ctx), weekdays: [0, 1, 2, 3, 4], holiday: 'exclude' },
}

const same = (a: boolean[], b: boolean[]) => a.length === b.length && a.every((v, i) => v === b[i])

describe('ranges', () => {
  it('intersects with open ends', () => {
    expect(intersectRange([null, 5], [2, null])).toEqual([2, 5])
    expect(intersectRange([1, 4], [2, 9])).toEqual([2, 4])
    expect(intersectRange([null, null], [null, 3])).toEqual([null, 3])
  })
  it('merges ranges per variable', () => {
    const merged = mergeRanges({ no2: [10, null] }, { no2: [null, 50], snowfall_sum: [1, null] })
    expect(merged.no2).toEqual([10, 50])
    expect(merged.snowfall_sum).toEqual([1, null])
  })
})

describe('highlight stays inside the filter', () => {
  for (const [name, selection] of Object.entries(filters)) {
    it(`every kind is a subset of the filter (${name})`, () => {
      const filter = selectDays(engine.input, selection, stations, engine.axis)
      const marks: Highlight[] = [
        { kind: 'period', from: '2019-03-01', to: '2019-09-30' },
        { kind: 'ranges', ranges: { temperature_2m_mean: [15, null] } },
        { kind: 'groups', grouping: 'season', keys: ['winter'] },
      ]
      for (const mark of marks) {
        const marked = highlightMask(engine, selection, stations, mark)
        expect(marked.every((on, i) => !on || filter[i])).toBe(true)
        expect(marked.some(Boolean)).toBe(true)
      }
    })
  }
})

describe('highlightToSelection is exact whenever it answers', () => {
  let answered = 0
  let refused = 0
  for (const [name, selection] of Object.entries(filters)) {
    for (const grouping of GROUPINGS) {
      if (grouping === 'none') continue
      const { keys } = assignGroups(engine.input, engine.axis, grouping)
      const subsets = [...keys.map((k) => [k]), keys.slice(0, 2), keys]
      it(`${grouping} on ${name}`, () => {
        for (const subset of subsets) {
          const mark: Highlight = { kind: 'groups', grouping, keys: subset }
          const result = highlightToSelection(selection, mark, th)
          if (result === null) {
            refused += 1
            continue
          }
          answered += 1
          const viaFilter = selectDays(engine.input, result, stations, engine.axis)
          const viaMask = highlightMask(engine, selection, stations, mark)
          expect(same(viaFilter, viaMask), `${grouping} ${subset.join(',')}`).toBe(true)
        }
      })
    }
    it(`period and ranges on ${name}`, () => {
      const marks: Highlight[] = [
        { kind: 'period', from: '2018-06-01', to: '2018-08-31' },
        { kind: 'ranges', ranges: { wind_speed_10m_mean: [5, 12], temperature_2m_mean: [null, 8] } },
      ]
      for (const mark of marks) {
        const result = highlightToSelection(selection, mark, th)
        expect(result).not.toBeNull()
        const viaFilter = selectDays(engine.input, result as DaySelection, stations, engine.axis)
        expect(same(viaFilter, highlightMask(engine, selection, stations, mark))).toBe(true)
      }
    })
  }
  it('both answers occur (the test is not vacuous)', () => {
    expect(answered).toBeGreaterThan(20)
    expect(refused).toBeGreaterThan(0)
  })
})

describe('highlightToSelection refuses what a filter cannot express', () => {
  const sel = filters.all
  it('years that are not one block', () => {
    expect(highlightToSelection(sel, { kind: 'groups', grouping: 'year', keys: ['2016', '2019'] }, th)).toBeNull()
  })
  it('two wind classes at once', () => {
    expect(highlightToSelection(sel, { kind: 'groups', grouping: 'windClass', keys: ['calm', 'windy'] }, th)).toBeNull()
  })
  it('an empty period', () => {
    const narrow = { ...sel, period: ['2020-01-01', '2020-12-31'] as [string, string] }
    expect(highlightToSelection(narrow, { kind: 'period', from: '2015-01-01', to: '2015-02-01' }, th)).toBeNull()
  })
  it('no groups', () => {
    expect(highlightToSelection(sel, { kind: 'groups', grouping: 'month', keys: [] }, th)).toBeNull()
  })
})

describe('toggleGroupHighlight', () => {
  it('replaces, adds with shift and clears', () => {
    let mark = toggleGroupHighlight(null, 'month', '3', false)
    expect(mark).toEqual({ kind: 'groups', grouping: 'month', keys: ['3'] })
    mark = toggleGroupHighlight(mark, 'month', '5', true)
    expect(mark).toEqual({ kind: 'groups', grouping: 'month', keys: ['3', '5'] })
    mark = toggleGroupHighlight(mark, 'month', '3', true)
    expect(mark).toEqual({ kind: 'groups', grouping: 'month', keys: ['5'] })
    expect(toggleGroupHighlight(mark, 'month', '5', false)).toBeNull()
  })
  it('a click in another grouping starts anew; "none" does nothing', () => {
    const mark = toggleGroupHighlight(null, 'month', '3', false)
    expect(toggleGroupHighlight(mark, 'weekday', '1', true)).toEqual({ kind: 'groups', grouping: 'weekday', keys: ['1'] })
    expect(toggleGroupHighlight(mark, 'none', 'all', false)).toBe(mark)
  })
})
