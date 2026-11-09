import { describe, expect, it } from 'vitest'
import {
  activeFeatures,
  featureStatus,
  lockedFeatures,
  setMode,
  toSpec,
  toggleFeature,
} from '../src/playground/modelcore/config'
import { MODEL_FEATURES } from '../src/playground/modelcore/types'
import { defaultModelConfig, parseState, defaultState, type ModelConfig } from '../src/playground/state'

const ctx = { stations: ['BL0', 'KC1', 'MY1'], defaultStation: 'KC1', firstDay: '2010-01-01', lastDay: '2026-10-31' }
const base = (): ModelConfig => defaultModelConfig(ctx)

describe('the mode changes the calculation, not the configuration', () => {
  it('keeps the whole selection when switching to forecast and back', () => {
    const explain = base()
    const forecast = setMode(explain, 'forecast')
    expect(forecast.features).toEqual(explain.features)
    expect(setMode(forecast, 'explain')).toEqual(explain)
  })
  it('uses the weather only when explaining, and still remembers it', () => {
    const explain = base()
    expect(activeFeatures(explain)).toContain('temperature_2m_mean')
    const forecast = setMode(explain, 'forecast')
    expect(activeFeatures(forecast)).not.toContain('temperature_2m_mean')
    expect(lockedFeatures(forecast).map((l) => l.feature)).toEqual([
      'temperature_2m_mean',
      'wind_speed_10m_mean',
      'precipitation_sum',
    ])
    expect(lockedFeatures(forecast).every((l) => l.problem === 'weather-in-forecast')).toBe(true)
    expect(activeFeatures(setMode(forecast, 'explain'))).toEqual(activeFeatures(explain))
  })
  it('a longer horizon locks lags that are too short and keeps them selected', () => {
    const at7 = setMode(base(), 'forecast')
    expect(activeFeatures(at7)).toContain('lag7')
    const at30 = { ...at7, horizon: 30 }
    expect(activeFeatures(at30)).not.toContain('lag7')
    expect(lockedFeatures(at30).find((l) => l.feature === 'lag7')?.problem).toBe('lag-too-short')
    expect(at30.features).toContain('lag7')
    expect({ ...at30, horizon: 7 }.features).toEqual(at7.features)
  })
  it('explaining always looks one day ahead, whatever horizon is stored', () => {
    const explain = { ...base(), horizon: 30 }
    expect(activeFeatures(explain)).toContain('lag7')
    expect(toSpec(explain, 'KC1').horizon).toBe(30) // stored for later, ignored by explaining
  })
  it('a locked ingredient cannot be switched, an allowed one can', () => {
    const forecast = setMode(base(), 'forecast')
    expect(toggleFeature(forecast, 'temperature_2m_mean')).toBe(forecast)
    expect(toggleFeature(forecast, 'lag14').features).toContain('lag14')
    expect(toggleFeature(forecast, 'lag7').features).not.toContain('lag7')
  })
  it('lists every ingredient once, in the fixed order, with a status', () => {
    const status = featureStatus(base())
    expect(status.map((s) => s.feature)).toEqual([...MODEL_FEATURES])
    expect(status.filter((s) => s.selected).map((s) => s.feature).sort()).toEqual([...base().features].sort())
  })
  it('the experiment only ever receives the active ingredients', () => {
    const spec = toSpec(setMode(base(), 'forecast'), 'KC1')
    expect(spec.features).toEqual(activeFeatures(setMode(base(), 'forecast')))
    expect(spec.features).not.toContain('precipitation_sum')
    expect(spec.mode).toBe('forecast')
  })
})

describe('the model configuration in the saved state', () => {
  const withModel = (model: unknown) => ({ ...defaultState(ctx), model })
  it('keeps a forecast configuration with a locked selection through save and load', () => {
    const config = setMode(base(), 'forecast')
    const { state, repairs } = parseState(JSON.parse(JSON.stringify(withModel(config))), ctx)
    expect(repairs).toEqual([])
    expect(state.model).toEqual(config)
    expect(state.model?.features).toContain('temperature_2m_mean')
  })
  it('fills fields an older state does not have', () => {
    const old = { features: ['weekday'], trainPeriod: ['2018-01-01', '2023-12-31'], testPeriod: ['2024-01-01', '2025-12-31'] }
    const { state, repairs } = parseState(withModel(old), ctx)
    expect(repairs).toEqual([])
    expect(state.model).toMatchObject({ kind: 'linear', mode: 'explain', horizon: 7, features: ['weekday'] })
  })
  it('repairs invalid values to defaults and says so', () => {
    const broken = { ...base(), kind: 'forest', mode: 'magic', horizon: 5, station: 'XX9', params: { ridge: -1, trees: 9999, depth: 3 } }
    const { state, repairs } = parseState(withModel(broken), ctx)
    expect(repairs).toEqual(expect.arrayContaining(['model.kind', 'model.mode', 'model.horizon', 'model.station', 'model.params']))
    expect(state.model).toMatchObject({ kind: 'linear', mode: 'explain', horizon: 7 })
    expect(state.model?.station).toBeUndefined()
    expect(state.model?.params.depth).toBe(3)
    expect(state.model?.params.trees).toBe(100)
  })
  it('drops unknown ingredients, reports them, and keeps the known ones', () => {
    const { state, repairs } = parseState(withModel({ ...base(), features: ['weekday', 'moonphase', 'weekday', 'lag7'] }), ctx)
    expect(repairs).toContain('model.features')
    expect(state.model?.features).toEqual(['weekday', 'lag7'])
  })
  it('still rejects overlapping periods completely', () => {
    const overlap = { ...base(), trainPeriod: ['2012-01-01', '2024-06-30'], testPeriod: ['2024-01-01', '2025-12-31'] }
    const { state, repairs } = parseState(withModel(overlap), ctx)
    expect(state.model).toBeUndefined()
    expect(repairs).toContain('model.overlap')
  })
})
