import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildEngine, type Engine } from '../src/playground/adapter'
import type { PlaygroundData } from '../src/playground/data'
import { dayIndex } from '../src/playground/engine'
import { binCuts, fitBoosting } from '../src/playground/modelcore/boosting'
import { buildDataset, completeRows } from '../src/playground/modelcore/features'
import { permutationImportance } from '../src/playground/modelcore/importance'
import { fitRidge, type Matrix } from '../src/playground/modelcore/linear'
import { runExperiment, type ExperimentResult } from '../src/playground/modelcore/experiment'
import { scores } from '../src/playground/modelcore/metrics'
import {
  DEFAULT_PARAMS,
  effectiveHorizon,
  featureProblem,
  naiveLag,
  persistenceLag,
  type ModelSpec,
} from '../src/playground/modelcore/types'

const base = new URL('../public/data/playground/', import.meta.url)
const read = (name: string) => JSON.parse(readFileSync(new URL(name, base), 'utf-8'))
const meta = read('playground_meta.json')
const stations = ['BL0', 'KC1', 'MY1']
const no2 = Object.fromEntries(stations.map((code) => [code, read(`no2_${code}.json`).no2]))
const data: PlaygroundData = { dates: [], calendar: read('calendar.json'), weather: read('weather.json'), meta, no2 }
const engine = buildEngine(data)
const first = engine.input.firstDay

const matrix = (rows: number[][]): Matrix => ({
  n: rows.length,
  p: rows[0].length,
  data: Float64Array.from(rows.flat()),
})

function spec(patch: Partial<ModelSpec> = {}): ModelSpec {
  return {
    station: 'KC1',
    kind: 'linear',
    mode: 'forecast',
    horizon: 7,
    features: ['weekday', 'month', 'trend', 'lag7', 'mean7'],
    trainPeriod: ['2012-01-01', '2022-12-31'],
    testPeriod: ['2023-01-01', '2024-12-31'],
    params: { ...DEFAULT_PARAMS },
    ...patch,
  }
}

function ok(result: ExperimentResult) {
  if (!result.ok) throw new Error(`experiment failed: ${JSON.stringify(result.error)}`)
  return result
}

// The engine with the NO2 of one station (or all weather) changed from a day on.
function tampered(from: number, what: 'no2' | 'weather'): Engine {
  const input = { ...engine.input }
  if (what === 'no2') {
    input.no2 = {
      ...input.no2,
      KC1: input.no2.KC1.map((v, i) => (i >= from && v !== null ? v * 3 + 50 : v)),
    }
  } else {
    input.weather = Object.fromEntries(
      Object.entries(input.weather).map(([key, series]) => [
        key,
        series.map((v, i) => (i >= from && v !== null ? v * 2 + 7 : v)),
      ]),
    ) as typeof input.weather
  }
  return { ...engine, input }
}

describe('the leakage rule for ingredients', () => {
  it('forbids the weather of the day in a forecast, allows it when explaining', () => {
    expect(featureProblem('temperature_2m_mean', 'forecast', 7)).toBe('weather-in-forecast')
    expect(featureProblem('temperature_2m_mean', 'explain', 1)).toBeNull()
  })
  it('forbids lags shorter than the horizon', () => {
    expect(featureProblem('lag1', 'forecast', 7)).toBe('lag-too-short')
    expect(featureProblem('lag7', 'forecast', 7)).toBeNull()
    expect(featureProblem('lag7', 'forecast', 30)).toBe('lag-too-short')
    expect(featureProblem('lag1', 'forecast', 1)).toBeNull()
    expect(featureProblem('lag1', 'explain', 30)).toBeNull()
  })
  it('allows calendar, events and windows in every forecast', () => {
    for (const f of ['weekday', 'month', 'bankHoliday', 'trend', 'corona', 'ulez', 'mean7', 'mean28']) {
      expect(featureProblem(f, 'forecast', 30)).toBeNull()
    }
    expect(featureProblem('moonphase', 'explain', 1)).toBe('unknown')
  })
  it('horizon and naive lag', () => {
    expect(effectiveHorizon({ mode: 'explain', horizon: 30 })).toBe(1)
    expect(effectiveHorizon({ mode: 'forecast', horizon: 30 })).toBe(30)
    expect([1, 7, 8, 14, 30].map(naiveLag)).toEqual([7, 7, 14, 14, 35])
    expect([1, 7, 30].map(persistenceLag)).toEqual([1, 7, 30])
  })
})

describe('ingredients', () => {
  it('encodes categories as dummies for the linear model, as numbers for boosting', () => {
    const dummies = buildDataset(engine, 'KC1', ['weekday', 'corona'], 'dummies', 1)
    expect(dummies.columns.map((c) => c.name)).toEqual([
      'weekday_1', 'weekday_2', 'weekday_3', 'weekday_4', 'weekday_5', 'weekday_6', 'corona_1', 'corona_2',
    ])
    const ordinal = buildDataset(engine, 'KC1', ['weekday', 'corona'], 'ordinal', 1)
    expect(ordinal.columns.map((c) => c.name)).toEqual(['weekday', 'corona'])
  })
  it('keeps the fixed column order whatever order was chosen', () => {
    const a = buildDataset(engine, 'KC1', ['lag7', 'weekday', 'trend'], 'dummies', 1)
    const b = buildDataset(engine, 'KC1', ['trend', 'weekday', 'lag7'], 'dummies', 1)
    expect(a.columns.map((c) => c.name)).toEqual(b.columns.map((c) => c.name))
    expect(a.columns[a.columns.length - 1].name).toBe('lag7')
  })
  it('a lag looks back by exactly its length', () => {
    const d = buildDataset(engine, 'KC1', ['lag7'], 'ordinal', 7)
    const series = engine.input.no2.KC1
    for (const t of [10, 500, 3000, 6000]) {
      const expected = series[t - 7]
      expect(d.columns[0].values[t]).toBe(expected === null ? Number.NaN : expected)
    }
    expect(Number.isNaN(d.columns[0].values[3])).toBe(true)
  })
  it('a window ends `horizon` days before the day and is the mean of what was measured', () => {
    const horizon = 7
    const d = buildDataset(engine, 'MY1', ['mean7'], 'ordinal', horizon)
    const series = engine.input.no2.MY1
    const t = 2000
    const values = series.slice(t - horizon - 6, t - horizon + 1).filter((v): v is number => v !== null)
    expect(values.length).toBeGreaterThanOrEqual(4)
    expect(d.columns[0].values[t]).toBeCloseTo(values.reduce((s, v) => s + v, 0) / values.length, 12)
  })
  it('wind direction becomes sine and cosine', () => {
    const d = buildDataset(engine, 'KC1', ['wind_direction_10m_dominant'], 'dummies', 1)
    expect(d.columns.map((c) => c.name)).toEqual(['wind_direction_sin', 'wind_direction_cos'])
    for (let t = 0; t < 50; t += 1) {
      expect(d.columns[0].values[t] ** 2 + d.columns[1].values[t] ** 2).toBeCloseTo(1, 9)
    }
  })
  it('complete rows need a measured target and every ingredient', () => {
    const d = buildDataset(engine, 'KC1', ['lag28'], 'ordinal', 1)
    const rows = completeRows(d, 0, 100)
    expect(rows[0]).toBeGreaterThanOrEqual(28)
    for (const t of rows) {
      expect(Number.isFinite(d.target[t])).toBe(true)
      expect(Number.isFinite(d.columns[0].values[t])).toBe(true)
    }
  })
})

describe('ridge regression', () => {
  const rows = Array.from({ length: 60 }, (_, i) => [i % 7, Math.sin(i), (i * 13) % 11, 5])
  const y = Float64Array.from(rows, ([a, b, c]) => 1 + 2 * a - 3 * b + 0.5 * c)

  it('recovers an exact linear relation without a penalty and drops constant columns', () => {
    const model = fitRidge(matrix(rows), y, 0)
    expect(model).not.toBeNull()
    expect((model as NonNullable<typeof model>).kept).toEqual([0, 1, 2])
    const predicted = (model as NonNullable<typeof model>).predict(matrix(rows))
    for (let i = 0; i < y.length; i += 1) expect(predicted[i]).toBeCloseTo(y[i], 8)
  })
  it('shrinks the coefficients when the penalty grows', () => {
    const size = (lambda: number) => {
      const model = fitRidge(matrix(rows), y, lambda) as NonNullable<ReturnType<typeof fitRidge>>
      return model.coef.reduce((s, c) => s + c * c, 0)
    }
    expect(size(10)).toBeLessThan(size(0))
    expect(size(1000)).toBeLessThan(size(10))
  })
  it('uses the training mean and spread for new data', () => {
    const model = fitRidge(matrix(rows), y, 1) as NonNullable<ReturnType<typeof fitRidge>>
    const a = model.predict(matrix([[3, 0.1, 4, 5]]))
    const b = model.predict(matrix([[3, 0.1, 4, 5], [0, 0, 0, 5]]))
    expect(b[0]).toBe(a[0])
  })
  it('survives identical columns by stabilising', () => {
    const twin = rows.map(([a, b, c]) => [a, a, b, c])
    const model = fitRidge(matrix(twin), y, 0)
    expect(model).not.toBeNull()
    expect((model as NonNullable<typeof model>).stabilised).toBe(true)
  })
})

describe('boosting', () => {
  const rows = Array.from({ length: 400 }, (_, i) => [i % 20, (i * 7) % 13])
  const y = Float64Array.from(rows, ([a, b]) => (a < 10 ? 5 : 25) + (b > 6 ? 3 : 0))
  const params = { trees: 30, depth: 2, rate: 0.3, minLeaf: 20, maxBins: 32 }

  it('cuts a column into at most maxBins bins', () => {
    const cuts = binCuts(Array.from({ length: 1000 }, (_, i) => i * 0.37), 32)
    expect(cuts.length).toBeLessThanOrEqual(31)
    for (let i = 1; i < cuts.length; i += 1) expect(cuts[i]).toBeGreaterThan(cuts[i - 1])
    // heavily tied values (rounded weather) still get many cuts
    const rounded = Array.from({ length: 4000 }, (_, i) => Math.round(((i * 7919) % 4000) / 14) / 10)
    expect(binCuts(rounded, 32).length).toBeGreaterThan(25)
    expect(binCuts([1, 2, 3], 32)).toEqual([1.5, 2.5])
    expect(binCuts([4, 4, 4], 32)).toEqual([])
  })
  it('learns a step function and is deterministic', () => {
    const model = fitBoosting(matrix(rows), y, params) as NonNullable<ReturnType<typeof fitBoosting>>
    const again = fitBoosting(matrix(rows), y, params) as NonNullable<ReturnType<typeof fitBoosting>>
    const predicted = model.predict(matrix(rows))
    expect(Array.from(predicted)).toEqual(Array.from(again.predict(matrix(rows))))
    expect(scores(y, predicted).mae).toBeLessThan(0.3)
  })
  it('more trees fit the training data at least as well', () => {
    const mae = (trees: number) => {
      const model = fitBoosting(matrix(rows), y, { ...params, trees }) as NonNullable<ReturnType<typeof fitBoosting>>
      return scores(y, model.predict(matrix(rows))).mae
    }
    expect(mae(40)).toBeLessThanOrEqual(mae(5))
  })
  it('does not split below the minimum leaf size', () => {
    const tiny = rows.slice(0, 30)
    const model = fitBoosting(matrix(tiny), y.slice(0, 30), params) as NonNullable<ReturnType<typeof fitBoosting>>
    expect(model.trees.every((t) => t.feature[0] === -1)).toBe(true) // 30 < 2 * 20: single leaf
  })
})

describe('permutation importance', () => {
  const rows = Array.from({ length: 300 }, (_, i) => [i % 10, (i * 37) % 17])
  const y = Float64Array.from(rows, ([a]) => 3 * a)
  const predict = (x: Matrix) => Float64Array.from({ length: x.n }, (_, i) => 3 * x.data[i * x.p])
  const groups = [
    { feature: 'signal', columns: [0] },
    { feature: 'noise', columns: [1] },
  ]
  it('is large for the ingredient the model uses and zero for the others', () => {
    const [signal, noise] = permutationImportance(predict, matrix(rows), y, groups, 5, 1)
    expect(signal.increase).toBeGreaterThan(5)
    expect(noise.increase).toBeCloseTo(0, 12)
  })
  it('gives the same answer for the same seed', () => {
    const a = permutationImportance(predict, matrix(rows), y, groups, 3, 42)
    const b = permutationImportance(predict, matrix(rows), y, groups, 3, 42)
    expect(a).toEqual(b)
  })
})

describe('an experiment', () => {
  it('fills the counts consistently and scores three baselines on the same days', () => {
    const r = ok(runExperiment(engine, spec()))
    const c = r.counts
    expect(c.testRows).toBeLessThanOrEqual(c.testComplete)
    expect(c.testComplete).toBeLessThanOrEqual(c.testMeasured)
    expect(c.testMeasured).toBeLessThanOrEqual(c.testDays)
    expect(c.trainRows).toBeLessThanOrEqual(c.trainMeasured)
    expect(r.test.day).toHaveLength(c.testRows)
    expect(r.test.actual).toHaveLength(c.testRows)
    expect(r.test.model).toHaveLength(c.testRows)
    expect(r.scores.model.mae).toBeCloseTo(scores(r.test.actual, r.test.model).mae, 12)
    expect(r.scores.naive.mae).toBeCloseTo(scores(r.test.actual, r.test.naive).mae, 12)
    // The baselines repeat what was known at the origin, day by day.
    const series = engine.input.no2.KC1
    r.test.day.forEach((t, i) => {
      expect(r.test.persistence[i]).toBe(series[t - r.persistenceLag])
      expect(r.test.naive[i]).toBe(series[t - r.naiveLag])
    })
    expect(r.scores.persistence.mae).toBeCloseTo(scores(r.test.actual, r.test.persistence).mae, 12)
    expect(r.test.persistence).toHaveLength(c.testRows)
    expect(r.persistenceLag).toBe(7)
    expect(r.horizon).toBe(7)
    expect(r.naiveLag).toBe(7)
    expect(r.importance.map((i) => i.feature).sort()).toEqual([...spec().features].sort())
    expect(r.importance[0].increase).toBeGreaterThanOrEqual(r.importance[r.importance.length - 1].increase)
    expect(r.coefficients?.items.length).toBeGreaterThan(0)
  })
  it('trains strictly before the test period, in rows and in days', () => {
    const r = ok(runExperiment(engine, spec()))
    const trainEnd = dayIndex(first, '2022-12-31')
    const testStart = dayIndex(first, '2023-01-01')
    expect(Math.max(...r.train.day)).toBeLessThanOrEqual(trainEnd)
    expect(Math.min(...r.test.day)).toBeGreaterThanOrEqual(testStart)
  })
  it('is deterministic', () => {
    const a = ok(runExperiment(engine, spec({ kind: 'boosting' })))
    const b = ok(runExperiment(engine, spec({ kind: 'boosting' })))
    expect(a.test.model).toEqual(b.test.model)
    expect(a.importance).toEqual(b.importance)
  })
  it('refuses what cannot be done', () => {
    const code = (patch: Partial<ModelSpec>) => {
      const r = runExperiment(engine, spec(patch))
      return r.ok ? 'ok' : r.error.code
    }
    expect(code({ features: [] })).toBe('no-features')
    expect(code({ station: 'XXX' })).toBe('unknown-station')
    expect(code({ features: ['weekday', 'temperature_2m_mean'] })).toBe('feature-not-allowed')
    expect(code({ features: ['weekday', 'lag1'], horizon: 7 })).toBe('feature-not-allowed')
    expect(code({ trainPeriod: ['2012-01-01', '2023-06-30'] })).toBe('period')
    expect(code({ testPeriod: ['2022-12-31', '2024-12-31'] })).toBe('period')
    expect(code({ trainPeriod: ['2012-01-01', '2012-01-20'] })).toBe('train-too-small')
    expect(code({ testPeriod: ['2023-01-01', '2023-01-12'] })).toBe('test-too-small')
  })
  it('explain mode may use the weather and then does better than without it', () => {
    const plain = ok(runExperiment(engine, spec({ mode: 'explain', horizon: 1, features: ['weekday', 'month', 'trend'] })))
    const withWind = ok(
      runExperiment(
        engine,
        spec({ mode: 'explain', horizon: 1, features: ['weekday', 'month', 'trend', 'wind_speed_10m_mean', 'temperature_2m_mean'] }),
      ),
    )
    expect(withWind.scores.model.mae).toBeLessThan(plain.scores.model.mae)
  })
})

describe('nothing from the future leaks into a forecast', () => {
  const horizon = 7
  const trainEnd = dayIndex(first, '2022-12-31')
  const testStart = dayIndex(first, '2023-01-01')
  const features = ['weekday', 'month', 'trend', 'lag7', 'lag14', 'mean7', 'mean28']

  for (const kind of ['linear', 'boosting'] as const) {
    it(`${kind}: changing the NO2 after the training period leaves the fitted model unchanged`, () => {
      const a = ok(runExperiment(engine, spec({ kind, horizon, features })))
      const b = ok(runExperiment(tampered(trainEnd + 1, 'no2'), spec({ kind, horizon, features })))
      expect(b.scores.modelTrain).toEqual(a.scores.modelTrain)
      expect(b.train.model).toEqual(a.train.model)
      if (kind === 'linear') expect(b.coefficients).toEqual(a.coefficients)
    })
    it(`${kind}: a forecast does not change when values after its origin change`, () => {
      const cut = testStart + 40
      const a = ok(runExperiment(engine, spec({ kind, horizon, features })))
      const b = ok(runExperiment(tampered(cut, 'no2'), spec({ kind, horizon, features })))
      const before = new Map(a.test.day.map((t, i) => [t, a.test.model[i]]))
      let compared = 0
      b.test.day.forEach((t, i) => {
        if (t - horizon < cut && before.has(t)) {
          expect(b.test.model[i]).toBe(before.get(t))
          compared += 1
        }
      })
      expect(compared).toBeGreaterThan(20)
    })
    it(`${kind}: the weather plays no role in a forecast`, () => {
      const a = ok(runExperiment(engine, spec({ kind, horizon, features })))
      const b = ok(runExperiment(tampered(0, 'weather'), spec({ kind, horizon, features })))
      expect(b.test.model).toEqual(a.test.model)
      expect(b.scores).toEqual(a.scores)
    })
  }
})

describe('training rows are built for the same forecast origin as the test rows', () => {
  // One dataset builder serves training and test, with the same horizon. A row for
  // day t may only look at NO2 up to day t - horizon, so a 30-day model is also
  // trained on what was known 30 days before each training target.
  const cut = 3000
  const cases: { horizon: number; features: string[] }[] = [
    { horizon: 1, features: ['lag1', 'lag7', 'lag14', 'lag28', 'mean7', 'mean28'] },
    { horizon: 7, features: ['lag7', 'lag14', 'lag28', 'mean7', 'mean28'] },
    { horizon: 30, features: ['mean7', 'mean28'] },
  ]
  for (const { horizon, features } of cases) {
    it(`horizon ${horizon}: a row only changes when NO2 up to day t - ${horizon} changes`, () => {
      const a = buildDataset(engine, 'KC1', features, 'ordinal', horizon)
      const b = buildDataset(tampered(cut, 'no2'), 'KC1', features, 'ordinal', horizon)
      let same = 0
      let moved = 0
      for (let t = 100; t < 6000; t += 1) {
        for (let j = 0; j < a.columns.length; j += 1) {
          const x = a.columns[j].values[t]
          const y = b.columns[j].values[t]
          if (t - horizon < cut) {
            // Nothing the row may see has changed, so the row must be identical.
            expect(Object.is(x, y)).toBe(true)
            same += 1
          } else if (!Object.is(x, y)) moved += 1
        }
      }
      expect(same).toBeGreaterThan(1000)
      expect(moved).toBeGreaterThan(100) // the check can fail: later rows do react
    })
    it(`horizon ${horizon}: the features of a training row are the 'known ${horizon} days earlier' ones`, () => {
      const rows = completeRows(buildDataset(engine, 'KC1', features, 'ordinal', horizon), 1000, 2000)
      const longer = buildDataset(engine, 'KC1', ['mean7'], 'ordinal', horizon)
      const series = engine.input.no2.KC1
      for (const t of rows.slice(0, 40)) {
        const window = series.slice(t - horizon - 6, t - horizon + 1).filter((v): v is number => v !== null)
        expect(longer.columns[0].values[t]).toBeCloseTo(window.reduce((sum, v) => sum + v, 0) / window.length, 12)
      }
    })
  }
  it('a 30-day model is a different model than a 1-day model on the same days', () => {
    const one = buildDataset(engine, 'KC1', ['mean7'], 'ordinal', 1)
    const thirty = buildDataset(engine, 'KC1', ['mean7'], 'ordinal', 30)
    let different = 0
    for (let t = 500; t < 600; t += 1) if (one.columns[0].values[t] !== thirty.columns[0].values[t]) different += 1
    expect(different).toBeGreaterThan(90)
  })
  it('a 30-day experiment refuses lags that would peek closer than 30 days', () => {
    const r = runExperiment(engine, spec({ horizon: 30, features: ['mean7', 'lag28'] }))
    expect(r.ok).toBe(false)
  })
})

describe('against the independent Python calculation', () => {
  type Reference = {
    spec: ModelSpec & { name: string }
    counts: Record<string, number>
    model: { mae: number; rmse: number; bias: number }
    modelTrain: { mae: number; rmse: number; bias: number }
    mean: { mae: number; rmse: number; bias: number }
    naive: { mae: number; rmse: number; bias: number }
    persistence: { mae: number; rmse: number; bias: number }
    coefficients?: Record<string, number>
  }
  const reference: { cases: Reference[] } = JSON.parse(
    readFileSync(new URL('./reference/model_reference.json', import.meta.url), 'utf-8'),
  )

  for (const ref of reference.cases) {
    it(ref.spec.name, () => {
      const { name, ...modelSpec } = ref.spec
      void name
      const r = ok(runExperiment(engine, modelSpec))
      for (const key of ['trainMeasured', 'trainRows', 'testMeasured', 'testComplete', 'testRows'] as const) {
        expect(r.counts[key], key).toBe(ref.counts[key])
      }
      for (const key of ['mae', 'rmse', 'bias'] as const) {
        expect(r.scores.mean[key]).toBeCloseTo(ref.mean[key], 8)
        expect(r.scores.naive[key]).toBeCloseTo(ref.naive[key], 8)
        expect(r.scores.persistence[key]).toBeCloseTo(ref.persistence[key], 8)
      }
      if (modelSpec.kind === 'linear') {
        for (const key of ['mae', 'rmse', 'bias'] as const) {
          expect(r.scores.model[key]).toBeCloseTo(ref.model[key], 6)
          expect(r.scores.modelTrain[key]).toBeCloseTo(ref.modelTrain[key], 6)
        }
        const items = r.coefficients?.items ?? []
        const expected = ref.coefficients ?? {}
        expect(items.map((i) => i.name).sort()).toEqual(Object.keys(expected).sort())
        for (const item of items) expect(item.standardized, item.name).toBeCloseTo(expected[item.name], 6)
      } else {
        // Own boosting, not scikit-learn's: the scores must be close (within 3 %), not equal.
        const gap = Math.abs(r.scores.model.mae - ref.model.mae) / ref.model.mae
        expect(gap).toBeLessThan(0.03)
        expect(r.scores.model.mae).toBeLessThan(r.scores.mean.mae)
        const trainGap = Math.abs(r.scores.modelTrain.mae - ref.modelTrain.mae) / ref.modelTrain.mae
        expect(trainGap).toBeLessThan(0.03)
      }
    })
  }
})
