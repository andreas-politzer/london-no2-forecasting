import type { Engine } from '../adapter'
import { dayIndex } from '../engine'
import { MIN_CELL_DAYS } from '../stats'
import { fitBoosting } from './boosting'
import { buildDataset, completeRows, type Dataset } from './features'
import { permutationImportance, type Importance } from './importance'
import { fitRidge, type Matrix } from './linear'
import { scores, type Scores } from './metrics'
import {
  MAX_BINS,
  MIN_LEAF,
  effectiveHorizon,
  featureProblem,
  naiveLag,
  type FeatureProblem,
  type ModelSpec,
} from './types'

// One experiment from start to finish: build the ingredients, split by time,
// fit on the training days, predict the test days, score against two plain
// baselines, and ask how much each ingredient mattered. Pure and deterministic.

export const MIN_TRAIN_ROWS = 60
export const MIN_TEST_ROWS = MIN_CELL_DAYS
export const WARN_TEST_ROWS = 30
const IMPORTANCE_REPEATS = 5
const IMPORTANCE_SEED = 20261109

export type ExperimentError =
  | { code: 'no-features' }
  | { code: 'unknown-station' }
  | { code: 'feature-not-allowed'; feature: string; problem: FeatureProblem }
  | { code: 'period' }
  | { code: 'train-too-small'; rows: number; needed: number }
  | { code: 'test-too-small'; rows: number; needed: number }
  | { code: 'no-fit' }

export type Coefficient = { feature: string; name: string; standardized: number; raw: number }

export type Counts = {
  trainDays: number // days in the training period
  trainMeasured: number // ... with a measured NO2 value
  trainRows: number // ... and complete ingredients: what the model learned from
  testDays: number
  testMeasured: number
  testComplete: number // measured and complete ingredients
  testRows: number // ... and the baseline had its input too: what is scored
}

export type ExperimentResult =
  | {
      ok: true
      spec: ModelSpec
      horizon: number
      naiveLag: number
      counts: Counts
      scores: { model: Scores; mean: Scores; naive: Scores; modelTrain: Scores }
      test: { day: number[]; actual: number[]; model: number[]; mean: number[]; naive: number[] }
      train: { day: number[]; actual: number[]; model: number[] }
      importance: Importance[] // largest first
      coefficients: { intercept: number; items: Coefficient[] } | null
      stabilised: boolean
      warnings: ('test-small' | 'stabilised')[]
    }
  | { ok: false; error: ExperimentError }

function matrixOf(dataset: Dataset, rows: number[]): Matrix {
  const p = dataset.columns.length
  const data = new Float64Array(rows.length * p)
  rows.forEach((t, i) => {
    for (let j = 0; j < p; j += 1) data[i * p + j] = dataset.columns[j].values[t]
  })
  return { n: rows.length, p, data }
}

const targets = (dataset: Dataset, rows: number[]) =>
  Float64Array.from(rows, (t) => dataset.target[t])

function measuredIn(dataset: Dataset, from: number, to: number): number[] {
  const out: number[] = []
  for (let t = Math.max(0, from); t <= Math.min(to, dataset.days - 1); t += 1) {
    if (Number.isFinite(dataset.target[t])) out.push(t)
  }
  return out
}

export function runExperiment(engine: Engine, spec: ModelSpec): ExperimentResult {
  const fail = (error: ExperimentError): ExperimentResult => ({ ok: false, error })
  if (spec.features.length === 0) return fail({ code: 'no-features' })
  if (!(spec.station in engine.input.no2)) return fail({ code: 'unknown-station' })
  const horizon = effectiveHorizon(spec)
  for (const feature of spec.features) {
    const problem = featureProblem(feature, spec.mode, horizon)
    if (problem) return fail({ code: 'feature-not-allowed', feature, problem })
  }

  const first = engine.input.firstDay
  const trainFrom = dayIndex(first, spec.trainPeriod[0])
  const trainTo = dayIndex(first, spec.trainPeriod[1])
  const testFrom = dayIndex(first, spec.testPeriod[0])
  const testTo = dayIndex(first, spec.testPeriod[1])
  // The leakage rule: training ends strictly before testing begins.
  if (trainFrom > trainTo || testFrom > testTo || trainTo >= testFrom) return fail({ code: 'period' })

  const encoding = spec.kind === 'linear' ? 'dummies' : 'ordinal'
  const dataset = buildDataset(engine, spec.station, spec.features, encoding, horizon)
  const lag = naiveLag(horizon)

  const trainMeasured = measuredIn(dataset, trainFrom, trainTo)
  const trainRows = completeRows(dataset, trainFrom, trainTo)
  const testMeasured = measuredIn(dataset, testFrom, testTo)
  const testComplete = completeRows(dataset, testFrom, testTo)
  const testRows = testComplete.filter((t) => t - lag >= 0 && Number.isFinite(dataset.target[t - lag]))

  const counts: Counts = {
    trainDays: Math.max(0, Math.min(trainTo, dataset.days - 1) - Math.max(0, trainFrom) + 1),
    trainMeasured: trainMeasured.length,
    trainRows: trainRows.length,
    testDays: Math.max(0, Math.min(testTo, dataset.days - 1) - Math.max(0, testFrom) + 1),
    testMeasured: testMeasured.length,
    testComplete: testComplete.length,
    testRows: testRows.length,
  }
  if (trainRows.length < MIN_TRAIN_ROWS) {
    return fail({ code: 'train-too-small', rows: trainRows.length, needed: MIN_TRAIN_ROWS })
  }
  if (testRows.length < MIN_TEST_ROWS) {
    return fail({ code: 'test-too-small', rows: testRows.length, needed: MIN_TEST_ROWS })
  }

  const xTrain = matrixOf(dataset, trainRows)
  const yTrain = targets(dataset, trainRows)
  const xTest = matrixOf(dataset, testRows)
  const yTest = targets(dataset, testRows)

  let predict: (x: Matrix) => Float64Array
  let coefficients: { intercept: number; items: Coefficient[] } | null = null
  let stabilised = false
  if (spec.kind === 'linear') {
    const model = fitRidge(xTrain, yTrain, Math.max(0, spec.params.ridge))
    if (!model) return fail({ code: 'no-fit' })
    predict = model.predict
    stabilised = model.stabilised
    const items: Coefficient[] = model.kept.map((j, c) => ({
      feature: dataset.columns[j].feature,
      name: dataset.columns[j].name,
      standardized: model.coef[c],
      raw: model.coef[c] / model.scale[j],
    }))
    let rawIntercept = model.intercept
    model.kept.forEach((j, c) => {
      rawIntercept -= (model.coef[c] * model.mean[j]) / model.scale[j]
    })
    coefficients = { intercept: rawIntercept, items }
  } else {
    const model = fitBoosting(xTrain, yTrain, {
      trees: Math.max(1, Math.round(spec.params.trees)),
      depth: Math.max(1, Math.round(spec.params.depth)),
      rate: spec.params.rate,
      minLeaf: MIN_LEAF,
      maxBins: MAX_BINS,
    })
    if (!model) return fail({ code: 'no-fit' })
    predict = model.predict
  }

  const predTest = predict(xTest)
  const predTrain = predict(xTrain)
  let trainMean = 0
  for (const t of trainMeasured) trainMean += dataset.target[t]
  trainMean /= trainMeasured.length
  const meanPred = new Float64Array(testRows.length).fill(trainMean)
  const naivePred = Float64Array.from(testRows, (t) => dataset.target[t - lag])

  const groups: { feature: string; columns: number[] }[] = []
  dataset.columns.forEach((column, j) => {
    const last = groups[groups.length - 1]
    if (last && last.feature === column.feature) last.columns.push(j)
    else groups.push({ feature: column.feature, columns: [j] })
  })
  const importance = permutationImportance(predict, xTest, yTest, groups, IMPORTANCE_REPEATS, IMPORTANCE_SEED)
    .sort((a, b) => b.increase - a.increase)

  const warnings: ('test-small' | 'stabilised')[] = []
  if (testRows.length < WARN_TEST_ROWS) warnings.push('test-small')
  if (stabilised) warnings.push('stabilised')

  return {
    ok: true,
    spec,
    horizon,
    naiveLag: lag,
    counts,
    scores: {
      model: scores(yTest, predTest),
      mean: scores(yTest, meanPred),
      naive: scores(yTest, naivePred),
      modelTrain: scores(yTrain, predTrain),
    },
    test: {
      day: testRows,
      actual: Array.from(yTest),
      model: Array.from(predTest),
      mean: Array.from(meanPred),
      naive: Array.from(naivePred),
    },
    train: { day: trainRows, actual: Array.from(yTrain), model: Array.from(predTrain) },
    importance,
    coefficients,
    stabilised,
    warnings,
  }
}
