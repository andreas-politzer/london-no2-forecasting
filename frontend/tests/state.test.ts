import { describe, expect, it } from 'vitest'
import {
  STATE_VERSION,
  defaultState,
  parseState,
  serializeState,
  type StateContext,
} from '../src/playground/state'

const ctx: StateContext = {
  stations: ['BL0', 'KC1', 'MY1', 'RI2'],
  defaultStation: 'KC1',
  firstDay: '2010-01-01',
  lastDay: '2026-10-31',
}

function validRaw() {
  return {
    version: 1,
    mode: 'experiment',
    stations: ['BL0', 'KC1'],
    selection: {
      period: ['2018-01-01', '2025-12-31'],
      months: [1, 2, 12],
      weekdays: [0, 1, 2, 3, 4],
      holiday: 'exclude',
      corona: [0, 2],
      ulez: [1, 2],
      ranges: { no2: [10, null], wind_speed_10m_mean: [null, 18.2] },
      windSectors: [0, 7],
    },
    charts: [
      {
        id: 'a',
        type: 'box',
        stations: ['KC1'],
        y: 'no2',
        group: 'windClass',
        options: { bins: 20 },
      },
      {
        id: 'b',
        type: 'scatter',
        stations: null,
        x: 'temperature_2m_mean',
        y: 'no2',
        options: {},
      },
    ],
    model: {
      kind: 'linear',
      mode: 'explain',
      horizon: 7,
      features: ['weekday', 'temperature_2m_mean'],
      trainPeriod: ['2018-01-01', '2023-12-31'],
      testPeriod: ['2024-01-01', '2025-12-31'],
      params: { ridge: 1, trees: 100, depth: 3, rate: 0.1 },
    },
  }
}

function withSelection(patch: Record<string, unknown>) {
  const raw = validRaw()
  return { ...raw, selection: { ...raw.selection, ...patch } }
}

function withModel(patch: Record<string, unknown>) {
  const raw = validRaw()
  return { ...raw, model: { ...raw.model, ...patch } }
}

describe('defaultState', () => {
  it('builds the documented default', () => {
    const state = defaultState(ctx)
    expect(state.version).toBe(STATE_VERSION)
    expect(state.mode).toBe('explore')
    expect(state.stations).toEqual(['KC1'])
    expect(state.selection.period).toEqual(['2010-01-01', '2026-10-31'])
    expect(state.selection.holiday).toBe('any')
    expect(state.selection.ranges).toEqual({})
    expect(state.charts).toHaveLength(1)
    expect(state.charts[0]).toMatchObject({ type: 'timeline', y: 'no2' })
    expect(state.model).toBeUndefined()
  })
})

describe('parseState', () => {
  it('loads a valid state unchanged and without repairs', () => {
    expect(parseState(validRaw(), ctx)).toEqual({
      state: validRaw(),
      repairs: [],
    })
  })

  it('ignores unknown fields without repairs', () => {
    const raw = { ...validRaw(), future: { a: 1 } }
    expect(parseState(raw, ctx)).toEqual({ state: validRaw(), repairs: [] })
  })

  it('falls back to the default state on a wrong version', () => {
    const result = parseState({ ...validRaw(), version: 2 }, ctx)
    expect(result.state).toEqual(defaultState(ctx))
    expect(result.repairs).toEqual(['version'])
  })

  it('falls back to the default state on non-objects', () => {
    for (const raw of [null, 42, 'x', [1, 2]]) {
      const result = parseState(raw, ctx)
      expect(result.state).toEqual(defaultState(ctx))
      expect(result.repairs).toEqual(['state'])
    }
  })

  it('reports partly invalid list values', () => {
    const { state, repairs } = parseState(
      withSelection({ months: [1, 2, 99], weekdays: [0, 'x', 6] }),
      ctx,
    )
    expect(state.selection.months).toEqual([1, 2])
    expect(state.selection.weekdays).toEqual([0, 6])
    expect(repairs).toContain('selection.months')
    expect(repairs).toContain('selection.weekdays')
  })

  it('repairs an entirely invalid list to "all"', () => {
    const { state, repairs } = parseState(
      withSelection({ months: [99], corona: 'yes' }),
      ctx,
    )
    expect(state.selection.months).toBeNull()
    expect(state.selection.corona).toBeNull()
    expect(repairs).toEqual(
      expect.arrayContaining(['selection.months', 'selection.corona']),
    )
  })

  it('repairs a bad holiday mode, bad ranges and a reversed period', () => {
    const { state, repairs } = parseState(
      withSelection({
        holiday: 'sometimes',
        ranges: { no2: [5, 1], bogus: [0, 1], precipitation_sum: [1, null] },
        period: ['2025-12-31', '2018-01-01'],
      }),
      ctx,
    )
    expect(state.selection.holiday).toBe('any')
    expect(state.selection.ranges).toEqual({ precipitation_sum: [1, null] })
    expect(state.selection.period).toEqual(['2010-01-01', '2026-10-31'])
    expect(repairs).toEqual(
      expect.arrayContaining([
        'selection.holiday',
        'selection.ranges.no2',
        'selection.ranges.bogus',
        'selection.period',
      ]),
    )
  })

  it('reports a period that had to be clipped to the data', () => {
    const { state, repairs } = parseState(
      withSelection({ period: ['2000-01-01', '2030-01-01'] }),
      ctx,
    )
    expect(state.selection.period).toEqual(['2010-01-01', '2026-10-31'])
    expect(repairs).toContain('selection.period')
  })

  it('drops unknown stations and reports them', () => {
    const { state, repairs } = parseState(
      { ...validRaw(), stations: ['RI2', 'XX9', 'BL0'] },
      ctx,
    )
    expect(state.stations).toEqual(['BL0', 'RI2'])
    expect(repairs).toContain('stations')
  })

  it('uses the default station when none is known', () => {
    const { state, repairs } = parseState(
      { ...validRaw(), stations: ['XX9'] },
      ctx,
    )
    expect(state.stations).toEqual(['KC1'])
    expect(repairs).toContain('stations')
  })

  it('reports unknown stations inside a chart', () => {
    const raw = validRaw()
    raw.charts[0].stations = ['KC1', 'XX9']
    const { state, repairs } = parseState(raw, ctx)
    expect(state.charts[0].stations).toEqual(['KC1'])
    expect(repairs).toContain('charts.stations')
  })

  it('renames duplicate chart ids', () => {
    const raw = validRaw()
    raw.charts[1].id = 'a'
    const { state, repairs } = parseState(raw, ctx)
    const ids = state.charts.map((chart) => chart.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(repairs).toContain('charts.id')
  })

  it('drops charts with an unknown type and keeps the rest', () => {
    const raw = validRaw()
    raw.charts.push({ id: 'c', type: 'pie' as never, stations: null, options: {} } as never)
    const { state, repairs } = parseState(raw, ctx)
    expect(state.charts).toHaveLength(2)
    expect(repairs).toContain('charts.type')
  })

  it('uses the default chart when no chart survives', () => {
    const { state, repairs } = parseState({ ...validRaw(), charts: [] }, ctx)
    expect(state.charts).toEqual(defaultState(ctx).charts)
    expect(repairs).toEqual([])
  })
})

describe('model periods (leakage rule)', () => {
  it('accepts training strictly before testing', () => {
    const { state, repairs } = parseState(validRaw(), ctx)
    expect(state.model).toBeDefined()
    expect(repairs).toEqual([])
  })

  it('rejects overlapping training and test periods', () => {
    const { state, repairs } = parseState(
      withModel({
        trainPeriod: ['2018-01-01', '2024-12-31'],
        testPeriod: ['2024-11-01', '2025-12-31'],
      }),
      ctx,
    )
    expect(state.model).toBeUndefined()
    expect(repairs).toContain('model.overlap')
  })

  it('rejects training that ends on the first test day', () => {
    const { state, repairs } = parseState(
      withModel({
        trainPeriod: ['2018-01-01', '2024-01-01'],
        testPeriod: ['2024-01-01', '2025-12-31'],
      }),
      ctx,
    )
    expect(state.model).toBeUndefined()
    expect(repairs).toContain('model.overlap')
  })

  it('rejects a test period that lies before the training period', () => {
    const { state, repairs } = parseState(
      withModel({
        trainPeriod: ['2024-01-01', '2025-12-31'],
        testPeriod: ['2018-01-01', '2023-12-31'],
      }),
      ctx,
    )
    expect(state.model).toBeUndefined()
    expect(repairs).toContain('model.overlap')
  })

  it('reports non-text features', () => {
    const { state, repairs } = parseState(
      withModel({ features: ['weekday', 7, null] }),
      ctx,
    )
    expect(state.model?.features).toEqual(['weekday'])
    expect(repairs).toContain('model.features')
  })

  it('drops a model with an invalid period', () => {
    const { state, repairs } = parseState(
      withModel({ testPeriod: ['nope', '2025-12-31'] }),
      ctx,
    )
    expect(state.model).toBeUndefined()
    expect(repairs).toContain('model')
  })
})

describe('serializeState', () => {
  it('survives a serialize and parse round trip', () => {
    const first = parseState(validRaw(), ctx).state
    const second = parseState(JSON.parse(serializeState(first)), ctx)
    expect(second.repairs).toEqual([])
    expect(second.state).toEqual(first)
  })

  it('round-trips the default state', () => {
    const state = defaultState(ctx)
    const result = parseState(JSON.parse(serializeState(state)), ctx)
    expect(result.repairs).toEqual([])
    expect(result.state).toEqual(state)
  })
})