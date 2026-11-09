import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildEngine } from '../src/playground/adapter'
import type { PlaygroundData } from '../src/playground/data'
import { assignGroups, selectDays } from '../src/playground/engine'
import {
  MIN_CELL_DAYS,
  SECTOR_NAMES,
  binEdges,
  boxStats,
  calendarCells,
  correlationMatrix,
  crossStats,
  hexbin,
  histogramBars,
  isLinearVariable,
  isoDay,
  kdeBandwidth,
  kdeProfiles,
  linearFit,
  maskedSeries,
  monthlyByYear,
  pairComplete,
  pearson,
  ranks,
  rollingMean,
  scatterPairs,
  spearman,
  windRose,
} from '../src/playground/stats'
import { defaultSelection, type StateContext } from '../src/playground/state'

const base = new URL('../public/data/playground/', import.meta.url)
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(name, base), 'utf-8'))

const meta = read('playground_meta.json')
const calendar = read('calendar.json')
const weather = read('weather.json')
const ref = JSON.parse(
  readFileSync(new URL('./reference/stats_reference.json', import.meta.url), 'utf-8'),
)

const stations: string[] = Object.keys(ref.stations)
const no2 = Object.fromEntries(
  stations.map((code) => [code, read(`no2_${code}.json`).no2]),
)
const data: PlaygroundData = { dates: [], calendar, weather, meta, no2 }
const { input, axis, flags } = buildEngine(data)
const th = meta.definitions.thresholds

const ctx: StateContext = {
  stations,
  defaultStation: stations[0],
  firstDay: meta.first_day,
  lastDay: meta.last_day,
}
const everyDay = selectDays(input, defaultSelection(ctx), stations, axis)
const windyWorkdayWinter = selectDays(
  input,
  {
    ...defaultSelection(ctx),
    ranges: { wind_speed_10m_mean: [th.wind_windy_min_kmh, null] },
    months: [12, 1, 2],
    weekdays: [0, 1, 2, 3, 4],
    holiday: 'exclude',
  },
  stations,
  axis,
)

const LINEAR_WEATHER = [
  'temperature_2m_mean',
  'temperature_2m_max',
  'temperature_2m_min',
  'wind_speed_10m_max',
  'wind_speed_10m_mean',
  'precipitation_sum',
  'snowfall_sum',
  'relative_humidity_2m_mean',
] as const

function close(actual: number | null | undefined, expected: number | null, label: string) {
  if (expected === null) expect(actual, label).toBeNull()
  else expect(actual, label).toBeCloseTo(expected, 9)
}

function valuesInGroups(station: string, grouping: 'windClass' | 'windSector') {
  const { keys, of } = assignGroups(input, axis, grouping)
  const groups: number[][] = keys.map(() => [])
  input.no2[station].forEach((v, i) => {
    if (v !== null && of[i] >= 0) groups[of[i]].push(v)
  })
  return groups
}

describe('helpers', () => {
  it('formats days and recognises the circular variable', () => {
    expect(isoDay('2020-02-28', 2)).toBe('2020-03-01')
    expect(isoDay('2019-12-31', 1)).toBe('2020-01-01')
    expect(isLinearVariable('no2')).toBe(true)
    expect(isLinearVariable('wind_direction_10m_dominant')).toBe(false)
  })

  it('masks a series', () => {
    expect(maskedSeries([1, 2, null, 4], [true, false, true, true])).toEqual([1, null, null, 4])
  })
})

describe('rolling mean', () => {
  it('uses a centred window and leaves the edges empty', () => {
    expect(rollingMean([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([null, 2, 3, 4, 5, 6, null])
  })

  it('puts the extra day of an even window after the centre', () => {
    // window 4: two days before the centre, one after
    expect(rollingMean([1, 2, 3, 4, 5, 6], 4)).toEqual([null, null, 2.5, 3.5, 4.5, null])
  })

  it('needs at least half of the window to have a value', () => {
    expect(rollingMean([1, null, null, 4, 5], 3)).toEqual([null, null, null, 4.5, null])
  })

  for (const station of stations) {
    it(`matches Python for ${station}`, () => {
      const blocks: [string, number, boolean[]][] = [
        ['w7', 7, everyDay],
        ['w30', 30, everyDay],
        ['w7_windy_workday_winter', 7, windyWorkdayWinter],
      ]
      for (const [name, window, mask] of blocks) {
        const out = rollingMean(maskedSeries(input.no2[station], mask), window)
        const expected = ref.stations[station].rolling[name]
        const valid = out.filter((v) => v !== null) as number[]
        expect(valid.length, `${station} ${name} valid`).toBe(expected.valid)
        close(
          valid.reduce((a, b) => a + b, 0) / valid.length,
          expected.mean_of_valid,
          `${station} ${name} mean`,
        )
        for (const [i, value] of expected.samples) {
          close(out[i], value, `${station} ${name} [${i}]`)
        }
      }
    })
  }
})

describe('histogram', () => {
  it('handles empty and constant data', () => {
    expect(binEdges([])).toEqual([])
    expect(binEdges([5, 5, 5])).toEqual([4.5, 5.5])
    expect(histogramBars([5, 5, 5], [4.5, 5.5])).toEqual([
      { from: 4.5, to: 5.5, count: 3, share: 1, density: 3 / (3 * 1) },
    ])
  })

  it('uses a given number of bins and a closed last bin', () => {
    const edges = binEdges([0, 1, 2, 3, 4], 4)
    expect(edges).toEqual([0, 1, 2, 3, 4])
    const bars = histogramBars([0, 1, 2, 3, 4], edges)
    expect(bars.map((b) => b.count)).toEqual([1, 1, 1, 2])
  })

  it('has shares that sum to 1 and a density that integrates to 1', () => {
    const values = input.no2.KC1.filter((v: number | null): v is number => v !== null)
    const edges = binEdges(values)
    const bars = histogramBars(values, edges)
    expect(bars.reduce((s, b) => s + b.count, 0)).toBe(values.length)
    expect(bars.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1, 9)
    expect(bars.reduce((s, b) => s + b.density * (b.to - b.from), 0)).toBeCloseTo(1, 9)
  })

  for (const station of stations) {
    it(`matches Python for ${station}`, () => {
      const expected = ref.stations[station].hist
      const values = input.no2[station].filter(
        (v: number | null): v is number => v !== null,
      )
      const edges = binEdges(values)
      expect(edges).toHaveLength(expected.edges.length)
      edges.forEach((e, i) => close(e, expected.edges[i], `edge ${i}`))
      expect(histogramBars(values, edges).map((b) => b.count)).toEqual(expected.counts)
      const [calm, normal, windy] = valuesInGroups(station, 'windClass')
      expect(histogramBars(calm, edges).map((b) => b.count)).toEqual(expected.by_wind_class.calm)
      expect(histogramBars(normal, edges).map((b) => b.count)).toEqual(expected.by_wind_class.normal)
      expect(histogramBars(windy, edges).map((b) => b.count)).toEqual(expected.by_wind_class.windy)
    })
  }
})

describe('density', () => {
  it('gives no bandwidth for fewer than two values or no spread', () => {
    expect(kdeBandwidth([1])).toBeNull()
    expect(kdeBandwidth([3, 3, 3])).toBeNull()
    expect(kdeProfiles([[3, 3, 3]])).toBeNull()
  })

  it('gives no curve for a group with fewer than two values', () => {
    const profiles = kdeProfiles([[1, 2, 3, 4], [2]])
    expect(profiles?.curves[0]).toHaveLength(128)
    expect(profiles?.curves[1]).toBeNull()
  })

  it('starts at zero when all values are non-negative, otherwise below', () => {
    expect(kdeProfiles([[0, 1, 2, 3, 4]])?.grid[0]).toBe(0)
    expect(kdeProfiles([[-3, -1, 2, 3, 4]])?.grid[0]).toBeLessThan(-3)
  })

  it('integrates to about 1 when nothing is clipped', () => {
    const profiles = kdeProfiles([[-3, -1, 2, 3, 4, 0, 1, 2, -2, 5]])
    const curve = profiles?.curves[0]
    const grid = profiles?.grid
    if (!curve || !grid) throw new Error('expected a curve')
    let area = 0
    for (let i = 1; i < grid.length; i += 1) {
      area += ((curve[i] + curve[i - 1]) / 2) * (grid[i] - grid[i - 1])
    }
    expect(area).toBeGreaterThan(0.99)
    expect(area).toBeLessThan(1.01)
  })

  for (const station of stations) {
    it(`matches Python for ${station}`, () => {
      const expected = ref.stations[station].kde
      const [calm, normal, windy] = valuesInGroups(station, 'windClass')
      const profiles = kdeProfiles([calm, normal, windy])
      if (!profiles) throw new Error('expected profiles')
      close(profiles.bandwidth, expected.bandwidth, 'bandwidth')
      close(profiles.grid[0], expected.grid_first, 'grid first')
      close(profiles.grid[127], expected.grid_last, 'grid last')
      const names = ['calm', 'normal', 'windy'] as const
      names.forEach((name, g) => {
        expected.at.forEach((index: number, k: number) => {
          close(profiles.curves[g]?.[index], expected.curves[name][k], `${name} @${index}`)
        })
      })
    })
  }
})

describe('box plot', () => {
  it('uses Tukey whiskers and reports outliers', () => {
    const box = boxStats([1, 2, 3, 4, 100])
    expect(box).toMatchObject({
      n: 5,
      q1: 2,
      median: 3,
      q3: 4,
      whiskerLow: 1,
      whiskerHigh: 4,
      outliers: [100],
      min: 1,
      max: 100,
    })
    expect(box?.mean).toBe(22)
  })

  it('needs at least two values', () => {
    expect(boxStats([])).toBeNull()
    expect(boxStats([4])).toBeNull()
  })

  for (const station of stations) {
    it(`matches Python for ${station}`, () => {
      const masks = {
        all: flags.all,
        windy: flags.wind_windy,
        calm: flags.wind_calm,
      }
      for (const [name, mask] of Object.entries(masks)) {
        const values = input.no2[station].filter(
          (v: number | null, i: number) => mask[i] && v !== null,
        ) as number[]
        const box = boxStats(values)
        const expected = ref.stations[station].box[name]
        if (!box) throw new Error('expected a box')
        const label = `${station} ${name}`
        expect(box.n, label).toBe(expected.n)
        close(box.mean, expected.mean, `${label} mean`)
        close(box.q1, expected.q1, `${label} q1`)
        close(box.median, expected.median, `${label} median`)
        close(box.q3, expected.q3, `${label} q3`)
        close(box.whiskerLow, expected.whisker_low, `${label} whisker low`)
        close(box.whiskerHigh, expected.whisker_high, `${label} whisker high`)
        expect(box.outliers.length, `${label} outliers`).toBe(expected.outliers)
        close(box.outliers.reduce((a, b) => a + b, 0), expected.outlier_sum, `${label} outlier sum`)
      }
    })
  }
})

describe('correlation', () => {
  it('computes Pearson for simple cases', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12)
    expect(pearson([1, 2], [1, 2])).toBeNull()
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
  })

  it('ranks equal values by their mean position', () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4])
    expect(ranks([3, 1, 2])).toEqual([3, 1, 2])
  })

  it('finds a monotone relation with Spearman but not with Pearson', () => {
    const x = [1, 2, 3, 4, 5, 6]
    const y = x.map((v) => v ** 5)
    expect(spearman(x, y)).toBeCloseTo(1, 12)
    expect(pearson(x, y) ?? 0).toBeLessThan(0.99)
  })

  it('uses only days where both values exist and are selected', () => {
    const pairs = pairComplete([1, null, 3, 4], [5, 6, null, 8], [true, true, true, false])
    expect(pairs).toEqual({ x: [1], y: [5], index: [0] })
  })

  for (const station of stations) {
    it(`matrix matches Python for ${station}`, () => {
      const columns = [
        { key: 'no2', values: input.no2[station] },
        ...LINEAR_WEATHER.map((key) => ({ key, values: input.weather[key] })),
      ]
      const blocks: [string, boolean[]][] = [
        ['corr_all', everyDay],
        ['corr_windy_workday_winter', windyWorkdayWinter],
      ]
      for (const [name, mask] of blocks) {
        const expected = ref.stations[station][name]
        expect(columns.map((c) => c.key)).toEqual(expected.keys)
        for (const method of ['pearson', 'spearman'] as const) {
          const matrix = correlationMatrix(columns, mask, method)
          matrix.r.forEach((row, i) =>
            row.forEach((value, j) => {
              close(value, expected[method][i][j], `${station} ${name} ${method} [${i}][${j}]`)
              expect(matrix.n[i][j]).toBe(expected.n[i][j])
              expect(matrix.r[j][i]).toBe(value)
            }),
          )
        }
      }
    })
  }
})

describe('scatter and linear fit', () => {
  it('fits a line', () => {
    const fit = linearFit([0, 1, 2, 3], [1, 3, 5, 7])
    expect(fit?.slope).toBeCloseTo(2, 12)
    expect(fit?.intercept).toBeCloseTo(1, 12)
    expect(fit?.r2).toBeCloseTo(1, 12)
    expect(linearFit([1, 2], [1, 2])).toBeNull()
    expect(linearFit([2, 2, 2], [1, 2, 3])).toBeNull()
  })

  it('has no R squared for constant y', () => {
    expect(linearFit([1, 2, 3], [5, 5, 5])?.r2).toBeNull()
  })

  for (const station of stations) {
    it(`matches Python for ${station}`, () => {
      const cases: [string, 'wind_speed_10m_mean' | 'temperature_2m_mean'][] = [
        ['fit_wind', 'wind_speed_10m_mean'],
        ['fit_temperature', 'temperature_2m_mean'],
      ]
      for (const [name, variable] of cases) {
        const pairs = scatterPairs(input, everyDay, variable, 'no2', station)
        const fit = linearFit(pairs.x, pairs.y)
        const expected = ref.stations[station][name]
        expect(pairs.x.length).toBe(expected.n)
        close(fit?.slope, expected.slope, `${station} ${name} slope`)
        close(fit?.intercept, expected.intercept, `${station} ${name} intercept`)
        close(fit?.r2, expected.r2, `${station} ${name} r2`)
      }
    })
  }

  it('keeps day indices in order and refuses unknown stations', () => {
    const pairs = scatterPairs(input, windyWorkdayWinter, 'wind_speed_10m_mean', 'no2', 'KC1')
    expect(pairs.index.every((i, k) => k === 0 || i > pairs.index[k - 1])).toBe(true)
    expect(pairs.index.every((i) => windyWorkdayWinter[i])).toBe(true)
    expect(() => scatterPairs(input, everyDay, 'no2', 'no2', 'XX9')).toThrow('unknown station')
  })
})

describe('hexbin', () => {
  const R = 12
  const sqrt3 = Math.sqrt(3)

  it('puts known points into known hexagons', () => {
    expect(hexbin([[0, 0]], R)).toEqual([{ q: 0, r: 0, cx: 0, cy: 0, count: 1 }])
    const [neighbour] = hexbin([[R * sqrt3 + 0.1, 0.1]], R)
    expect([neighbour.q, neighbour.r]).toEqual([1, 0])
    expect(neighbour.cx).toBeCloseTo(R * sqrt3, 9)
  })

  it('assigns every point to its nearest hexagon centre', () => {
    let seed = 12345
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const points: [number, number][] = Array.from({ length: 2000 }, () => [
      random() * 400,
      random() * 300,
    ])
    const bins = hexbin(points, R)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(2000)
    const tally = new Array<number>(bins.length).fill(0)
    for (const [x, y] of points) {
      let best = 0
      let bestDistance = Infinity
      bins.forEach((bin, k) => {
        const d = (bin.cx - x) ** 2 + (bin.cy - y) ** 2
        if (d < bestDistance) {
          bestDistance = d
          best = k
        }
      })
      tally[best] += 1
    }
    expect(tally).toEqual(bins.map((b) => b.count))
    expect(bins.every((b) => !Object.is(b.q, -0) && !Object.is(b.r, -0))).toBe(true)
  })
})

describe('wind rose', () => {
  for (const station of stations) {
    it(`matches Python for ${station}`, () => {
      const expected = ref.stations[station].rose
      const rose = windRose(input, axis, everyDay, station)
      expect(rose.total).toBe(input.days)
      expect(rose.sectors.map((s) => s.name)).toEqual([...SECTOR_NAMES])
      rose.sectors.forEach((sector, s) => {
        expect(sector.days, `days ${s}`).toBe(expected.days[s])
        expect([...sector.speedDays], `speed ${s}`).toEqual(expected.speed_days[s])
        expect(sector.no2.n, `no2 n ${s}`).toBe(expected.no2_n[s])
        close(sector.no2.mean, expected.no2_mean[s], `no2 mean ${s}`)
      })
    })
  }

  it('counts only selected days', () => {
    const rose = windRose(input, axis, windyWorkdayWinter, 'KC1')
    expect(rose.total).toBe(windyWorkdayWinter.filter(Boolean).length)
    for (const sector of rose.sectors) {
      expect(sector.speedDays[0] + sector.speedDays[1]).toBe(0)
    }
  })
})

describe('cross tables', () => {
  for (const station of stations) {
    it(`month by weekday and season by wind class match Python for ${station}`, () => {
      const cases: [string, 'month' | 'season', 'weekday' | 'windClass'][] = [
        ['cross_month_weekday', 'month', 'weekday'],
        ['cross_season_wind', 'season', 'windClass'],
      ]
      for (const [name, rows, cols] of cases) {
        const table = crossStats(input, axis, everyDay, rows, cols, 'no2', station)
        const expected = ref.stations[station][name]
        table.cells.forEach((row, r) =>
          row.forEach((cell, c) => {
            expect(cell.n, `${name} n [${r}][${c}]`).toBe(expected.n[r][c])
            close(cell.mean, expected.mean[r][c], `${name} mean [${r}][${c}]`)
            expect(cell.low).toBe(cell.n < th.min_days_per_group)
            expect(cell.days).toBeGreaterThanOrEqual(cell.n)
          }),
        )
      }
    })
  }

  it('has one cell per pair of groups', () => {
    const table = crossStats(input, axis, everyDay, 'month', 'weekday', 'no2', 'KC1')
    expect(table.rowKeys).toHaveLength(12)
    expect(table.colKeys).toHaveLength(7)
    const days = table.cells.flat().reduce((sum, cell) => sum + cell.days, 0)
    expect(days).toBe(input.days)
  })
})

describe('month cells', () => {
  for (const station of stations) {
    it(`match Python for ${station}`, () => {
      const result = monthlyByYear(input, axis, everyDay, 'no2', station)
      const expected = ref.stations[station].monthly
      expect(result.years).toEqual(expected.years)
      result.cells.forEach((row, y) =>
        row.forEach((cell, m) => {
          expect(cell.n, `n ${y}/${m}`).toBe(expected.n[y][m])
          close(cell.mean, expected.mean[y][m], `mean ${y}/${m}`)
          expect(cell.low).toBe(cell.n < MIN_CELL_DAYS)
        }),
      )
    })
  }
})

describe('calendar heatmap', () => {
  it('matches Python for 2019 with windy days selected', () => {
    const expected = ref.stations.KC1.calendar_2019
    const cells = calendarCells(input, axis, flags.wind_windy, 'no2', 'KC1', 2019)
    expect(cells).toHaveLength(expected.cells)
    expect(cells.filter((c) => c.selected)).toHaveLength(expected.selected)
    expect(cells.filter((c) => c.value !== null)).toHaveLength(expected.with_value)
    expect(Math.max(...cells.map((c) => c.col))).toBe(expected.max_col)
    for (const [date, probe] of expected.probes) {
      const cell = cells.find((c) => c.date === date)
      expect(cell?.index, date).toBe(probe.index)
      expect(cell?.col, date).toBe(probe.col)
      expect(cell?.weekday, date).toBe(probe.row)
      expect(cell?.selected, date).toBe(probe.selected)
      close(cell?.value, probe.value, date)
    }
  })

  it('handles leap years and Monday starts', () => {
    const leap = calendarCells(input, axis, everyDay, 'no2', 'KC1', 2020)
    expect(leap).toHaveLength(366)
    expect(leap[leap.length - 1].date).toBe('2020-12-31')
    expect(leap[leap.length - 1].col).toBe(52) // 1 January 2020 was a Wednesday
    const monday = calendarCells(input, axis, everyDay, 'no2', 'KC1', 2018)
    expect(monday[0]).toMatchObject({ date: '2018-01-01', col: 0, weekday: 0 })
  })

  it('shows values only for selected days', () => {
    const cells = calendarCells(input, axis, flags.wind_windy, 'no2', 'KC1', 2019)
    expect(cells.every((c) => c.selected || c.value === null)).toBe(true)
  })
})
