import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildAxis,
  buildFlags,
  dayIndex,
  groupStats,
  sectorOf,
  selectDays,
  summarize,
  type EngineInput,
  type Summary,
} from '../src/playground/engine'
import {
  defaultSelection,
  type DaySelection,
  type Grouping,
  type StateContext,
} from '../src/playground/state'

const base = new URL('../public/data/playground/', import.meta.url)
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(name, base), 'utf-8'))

const meta = read('playground_meta.json')
const cal = read('calendar.json')
const weather = read('weather.json')
const reference = JSON.parse(
  readFileSync(new URL('./reference/engine_reference.json', import.meta.url), 'utf-8'),
)

const stations: string[] = Object.keys(meta.definitions.measured_days)
const th = meta.definitions.thresholds

const input: EngineInput = {
  firstDay: meta.first_day,
  days: meta.days,
  weekday: cal.weekday,
  holiday: cal.holiday,
  corona: cal.corona,
  ulez: cal.ulez,
  weather: weather.series,
  no2: Object.fromEntries(stations.map((code) => [code, read(`no2_${code}.json`).no2])),
  thresholds: th,
}
const axis = buildAxis(input)
const flags = buildFlags(input, axis)

const ctx: StateContext = {
  stations,
  defaultStation: stations[0],
  firstDay: meta.first_day,
  lastDay: meta.last_day,
}
const everyDay = selectDays(input, defaultSelection(ctx), stations, axis)

function maskedValues(mask: boolean[], station: string): number[] {
  const out: number[] = []
  input.no2[station].forEach((value, i) => {
    if (mask[i] && value !== null) out.push(value)
  })
  return out
}

const CHECKS = ['mean', 'median', 'q1', 'q3'] as const

function expectSummary(
  actual: Summary,
  expected: Record<string, number | null>,
  label: string,
) {
  expect(actual.n, `${label} n`).toBe(expected.n)
  for (const key of CHECKS) {
    const want = expected[key]
    if (want === null) expect(actual[key], `${label} ${key}`).toBeNull()
    else expect(actual[key], `${label} ${key}`).toBeCloseTo(want, 9)
  }
}

const count = (mask: boolean[]) => mask.filter(Boolean).length

describe('reference setup', () => {
  it('uses the same data as the reference file', () => {
    expect(reference.days).toBe(input.days)
    expect(reference.first_day).toBe(input.firstDay)
    expect(reference.thresholds).toEqual(th)
    expect(Object.keys(reference.stations).sort()).toEqual([...stations].sort())
  })
})

describe('day axis', () => {
  it('maps dates to indices', () => {
    expect(dayIndex(input.firstDay, input.firstDay)).toBe(0)
    expect(dayIndex('2020-02-28', '2020-03-01')).toBe(2) // leap year
    expect(dayIndex(input.firstDay, meta.last_day)).toBe(input.days - 1)
  })

  it('has year and month for every day', () => {
    expect(axis.year).toHaveLength(input.days)
    expect(axis.month[0]).toBe(Number(input.firstDay.slice(5, 7)))
    expect(Math.min(...axis.month)).toBe(1)
    expect(Math.max(...axis.month)).toBe(12)
  })
})

describe('wind sectors', () => {
  it('uses 8 sectors of 45 degrees centred on north', () => {
    expect(sectorOf(0)).toBe(0)
    expect(sectorOf(22.4)).toBe(0)
    expect(sectorOf(22.5)).toBe(1)
    expect(sectorOf(90)).toBe(2)
    expect(sectorOf(337.4)).toBe(7)
    expect(sectorOf(337.5)).toBe(0)
    expect(sectorOf(359.9)).toBe(0)
    expect(sectorOf(null)).toBeNull()
  })
})

describe('summarize', () => {
  it('matches the inclusive quartile method', () => {
    const s = summarize([4, 1, 3, 2])
    expect(s).toMatchObject({ n: 4, mean: 2.5, median: 2.5, q1: 1.75, q3: 3.25 })
    expect(s.min).toBe(1)
    expect(s.max).toBe(4)
  })

  it('gives no quartiles for fewer than two values', () => {
    expect(summarize([7])).toMatchObject({ n: 1, mean: 7, median: 7, q1: null, q3: null })
    expect(summarize([])).toEqual({
      n: 0, mean: null, median: null, q1: null, q3: null, min: null, max: null,
    })
  })
})

describe('classes against the Python reference', () => {
  const single = Object.keys(reference.all_days).filter((n) => !n.startsWith('combo_'))

  it('has exactly the single classes of the reference', () => {
    expect(Object.keys(flags).sort()).toEqual([...single].sort())
  })

  it('counts every class like Python', () => {
    for (const name of single) {
      expect(count(flags[name]), name).toBe(reference.all_days[name])
    }
  })

  for (const station of stations) {
    it(`summaries per class for ${station}`, () => {
      for (const name of single) {
        expectSummary(
          summarize(maskedValues(flags[name], station)),
          reference.stations[station][name],
          `${station} ${name}`,
        )
      }
    })
  }
})

describe('day selection (combined filters)', () => {
  const period: [string, string] = [meta.first_day, meta.last_day]
  const selection = (patch: Partial<DaySelection>): DaySelection => ({
    ...defaultSelection(ctx),
    period,
    ...patch,
  })

  const combos: Record<string, DaySelection> = {
    combo_windy_workday_winter: selection({
      ranges: { wind_speed_10m_mean: [th.wind_windy_min_kmh, null] },
      months: [12, 1, 2],
      weekdays: [0, 1, 2, 3, 4],
      holiday: 'exclude',
    }),
    combo_calm_weekend_summer: selection({
      ranges: { wind_speed_10m_mean: [null, th.wind_calm_max_kmh] },
      months: [6, 7, 8],
      weekdays: [5, 6],
      holiday: 'exclude',
    }),
    combo_corona1_spring: selection({ corona: [1], months: [3, 4, 5] }),
  }

  for (const [name, sel] of Object.entries(combos)) {
    it(`${name} equals the Python intersection`, () => {
      const mask = selectDays(input, sel, stations, axis)
      expect(count(mask)).toBe(reference.all_days[name])
      for (const station of stations) {
        expectSummary(
          summarize(maskedValues(mask, station)),
          reference.stations[station][name],
          `${station} ${name}`,
        )
      }
    })
  }

  it('selects the whole period by default', () => {
    expect(count(everyDay)).toBe(input.days)
  })

  it('restricts to a period', () => {
    const mask = selectDays(input, selection({ period: ['2019-01-01', '2019-12-31'] }), stations, axis)
    expect(count(mask)).toBe(365)
  })

  it('selects only or excludes bank holidays', () => {
    const only = selectDays(input, selection({ holiday: 'only' }), stations, axis)
    const without = selectDays(input, selection({ holiday: 'exclude' }), stations, axis)
    expect(count(only)).toBe(reference.all_days.bank_holiday)
    expect(count(only) + count(without)).toBe(input.days)
  })

  it('drops days without a NO2 value when NO2 is filtered', () => {
    const mask = selectDays(
      input,
      selection({ ranges: { no2: [0, null] } }),
      ['KC1'],
      axis,
    )
    expect(count(mask)).toBe(reference.stations.KC1.all.n)
  })
})

describe('groups against the Python reference', () => {
  const numbered = (from: number, to: number, prefix: string) =>
    Object.fromEntries(
      Array.from({ length: to - from + 1 }, (_, k) => [String(from + k), `${prefix}${from + k}`]),
    )
  const years = Object.fromEntries(
    Object.keys(reference.all_days)
      .filter((n) => n.startsWith('year_'))
      .map((n) => [n.slice(5), n]),
  )

  const mapping: [Grouping, Record<string, string>][] = [
    ['none', { all: 'all' }],
    ['windClass', { calm: 'wind_calm', windy: 'wind_windy' }],
    ['rainClass', { dry: 'rain_dry', veryWet: 'rain_very_wet' }],
    ['snowDay', { snow: 'snow_day' }],
    ['temperatureClass', { frost: 'frost_day', summer: 'summer_day' }],
    [
      'season',
      {
        winter: 'season_winter',
        spring: 'season_spring',
        summer: 'season_summer',
        autumn: 'season_autumn',
      },
    ],
    ['dayType', { workday: 'workday', weekend: 'weekend', bankHoliday: 'bank_holiday' }],
    ['weekday', numbered(0, 6, 'weekday_')],
    ['month', numbered(1, 12, 'month_')],
    ['year', years],
    ['corona', numbered(0, 2, 'corona_')],
    ['ulez', numbered(0, 3, 'ulez_')],
    ['windSector', numbered(0, 7, 'sector_')],
  ]

  for (const station of stations) {
    it(`group statistics for ${station}`, () => {
      for (const [grouping, keyToFlag] of mapping) {
        const stats = groupStats(input, axis, everyDay, grouping, 'no2', station)
        for (const [key, flag] of Object.entries(keyToFlag)) {
          const found = stats.find((s) => s.key === key)
          expect(found, `${grouping} ${key}`).toBeDefined()
          expectSummary(
            found as Summary,
            reference.stations[station][flag],
            `${station} ${grouping} ${key}`,
          )
        }
      }
    })
  }

  it('splits every day into exactly one group', () => {
    for (const [grouping] of mapping) {
      const stats = groupStats(input, axis, everyDay, grouping, 'no2', stations[0])
      const total = stats.reduce((sum, s) => sum + s.days, 0)
      expect(total, grouping).toBe(input.days)
    }
  })

  it('wet and very wet days add up to the reference rain_wet', () => {
    const stats = groupStats(input, axis, everyDay, 'rainClass', 'no2', 'KC1')
    const wet = (key: string) => stats.find((s) => s.key === key)?.n ?? 0
    expect(wet('wet') + wet('veryWet')).toBe(reference.stations.KC1.rain_wet.n)
  })
})

describe('small groups', () => {
  it('flags groups below the minimum as low, large ones not', () => {
    const small = selectDays(
      input,
      { ...defaultSelection(ctx), months: [1], holiday: 'only' },
      stations,
      axis,
    )
    const [group] = groupStats(input, axis, small, 'none', 'no2', 'KC1')
    expect(group.days).toBeGreaterThan(0)
    expect(group.n).toBeLessThan(th.min_days_per_group)
    expect(group.low).toBe(true)

    const [all] = groupStats(input, axis, everyDay, 'none', 'no2', 'KC1')
    expect(all.low).toBe(false)
  })
})