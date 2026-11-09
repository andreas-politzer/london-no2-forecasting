import type { ModelConfig } from '../state'
import {
  MODEL_FEATURES,
  effectiveHorizon,
  featureProblem,
  type FeatureProblem,
  type ModelMode,
  type ModelSpec,
} from './types'

// What the model workshop's configuration means for the calculation.
//
// The configuration keeps the person's whole selection of ingredients. A mode
// (explain or forecast) and a horizon decide which of them are *active*; the
// others stay selected, visible and locked with a reason, and come back by
// themselves when the mode allows them again. Switching the mode therefore
// changes the calculation, never the configuration.

export type FeatureStatus = {
  feature: string
  selected: boolean
  problem: FeatureProblem | null // null = allowed in this mode and horizon
}

// Every ingredient in the fixed order, with its selection and why it is locked.
export function featureStatus(config: ModelConfig): FeatureStatus[] {
  const horizon = effectiveHorizon(config)
  return MODEL_FEATURES.map((feature) => ({
    feature,
    selected: config.features.includes(feature),
    problem: featureProblem(feature, config.mode, horizon),
  }))
}

// Selected and allowed: exactly what the calculation uses.
export function activeFeatures(config: ModelConfig): string[] {
  return featureStatus(config)
    .filter((item) => item.selected && item.problem === null)
    .map((item) => item.feature)
}

// Selected but not allowed here: remembered, not used.
export function lockedFeatures(config: ModelConfig): { feature: string; problem: FeatureProblem }[] {
  const locked: { feature: string; problem: FeatureProblem }[] = []
  for (const item of featureStatus(config)) {
    if (item.selected && item.problem !== null) locked.push({ feature: item.feature, problem: item.problem })
  }
  return locked
}

// The mode changes; the selection, periods, model and parameters stay as they were.
export function setMode(config: ModelConfig, mode: ModelMode): ModelConfig {
  return { ...config, mode }
}

// A locked ingredient cannot be switched while it is locked; its selection is kept.
export function toggleFeature(config: ModelConfig, feature: string): ModelConfig {
  const item = featureStatus(config).find((entry) => entry.feature === feature)
  if (!item || item.problem !== null) return config
  const features = item.selected
    ? config.features.filter((name) => name !== feature)
    : [...config.features, feature]
  return { ...config, features }
}

// The experiment for a station: only the active ingredients go in.
export function toSpec(config: ModelConfig, station: string): ModelSpec {
  return {
    station,
    kind: config.kind,
    mode: config.mode,
    horizon: config.horizon,
    features: activeFeatures(config),
    trainPeriod: config.trainPeriod,
    testPeriod: config.testPeriod,
    params: config.params,
  }
}
