// The model workshop's vocabulary: which ingredients exist, which are allowed
// when, and what an experiment is. No React, no data here.

export const CALENDAR_FEATURES = ['weekday', 'month', 'bankHoliday', 'trend', 'corona', 'ulez'] as const
export const LAG_DAYS = { lag1: 1, lag7: 7, lag14: 14, lag28: 28 } as const
export const WINDOW_DAYS = { mean7: 7, mean28: 28 } as const
export const WEATHER_FEATURES = [
  'temperature_2m_mean',
  'temperature_2m_max',
  'temperature_2m_min',
  'wind_speed_10m_mean',
  'wind_speed_10m_max',
  'wind_direction_10m_dominant',
  'precipitation_sum',
  'snowfall_sum',
  'relative_humidity_2m_mean',
] as const

// Fixed order: the columns of a model always come in this order.
export const MODEL_FEATURES = [
  ...CALENDAR_FEATURES,
  'lag1',
  'lag7',
  'lag14',
  'lag28',
  'mean7',
  'mean28',
  ...WEATHER_FEATURES,
] as const
export type ModelFeature = (typeof MODEL_FEATURES)[number]

export type ModelKind = 'linear' | 'boosting'
export const MODEL_KINDS: readonly ModelKind[] = ['linear', 'boosting']

// explain: the weather of the day itself may be used (how much does it explain?).
// forecast: only what was known before; the day is `horizon` days ahead.
export type ModelMode = 'explain' | 'forecast'
export const MODEL_MODES: readonly ModelMode[] = ['explain', 'forecast']

export const HORIZONS = [1, 7, 30] as const

export type ModelParams = {
  ridge: number // strength of the linear model's penalty (0 = none)
  trees: number
  depth: number
  rate: number
}

export const RIDGE_CHOICES = [0, 1, 10, 100] as const
export const PARAM_LIMITS = {
  ridge: [0, 1000],
  trees: [1, 500],
  depth: [1, 6],
  rate: [0.01, 1],
} as const
export const DEFAULT_PARAMS: ModelParams = { ridge: 1, trees: 100, depth: 3, rate: 0.1 }

// Fixed, not adjustable (same default as scikit-learn's boosting).
export const MIN_LEAF = 20
export const MAX_BINS = 32

// Rule: the training period ends strictly before the test period starts.
export type ModelSpec = {
  station: string
  kind: ModelKind
  mode: ModelMode
  horizon: number
  features: string[]
  trainPeriod: [string, string]
  testPeriod: [string, string]
  params: ModelParams
}

export function isModelFeature(value: unknown): value is ModelFeature {
  return (MODEL_FEATURES as readonly unknown[]).includes(value)
}

export type FeatureProblem = 'unknown' | 'weather-in-forecast' | 'lag-too-short'

// Why a feature may not be used in this mode and horizon (null = allowed).
// This is the leakage rule: a forecast `horizon` days ahead may only use what
// was known then. Calendar facts and events are known; the NO2 of the days
// before the horizon is known; the weather of the target day is not.
export function featureProblem(
  feature: string,
  mode: ModelMode,
  horizon: number,
): FeatureProblem | null {
  if (!isModelFeature(feature)) return 'unknown'
  if (mode === 'explain') return null
  if ((WEATHER_FEATURES as readonly string[]).includes(feature)) return 'weather-in-forecast'
  if (feature in LAG_DAYS && LAG_DAYS[feature as keyof typeof LAG_DAYS] < horizon) {
    return 'lag-too-short'
  }
  return null
}

export function effectiveHorizon(spec: Pick<ModelSpec, 'mode' | 'horizon'>): number {
  return spec.mode === 'explain' ? 1 : spec.horizon
}

// The seasonal-naive baseline repeats the same weekday of the last week that
// was already known.
export function naiveLag(horizon: number): number {
  return 7 * Math.ceil(horizon / 7)
}
