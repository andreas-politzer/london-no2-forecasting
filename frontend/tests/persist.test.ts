import { describe, expect, it } from 'vitest'
import {
  MAX_NAME,
  MAX_SAVED,
  STORAGE_KEY,
  decodeShare,
  deleteExperiment,
  encodeShare,
  exportExperiment,
  exportFileName,
  importExperiment,
  listExperiments,
  saveExperiment,
  shareUrl,
  type KeyValueStore,
} from '../src/playground/persist'
import {
  defaultState,
  type PlaygroundState,
  type StateContext,
} from '../src/playground/state'

const ctx: StateContext = {
  stations: ['BL0', 'EA6', 'KC1', 'MY1', 'RI2'],
  defaultStation: 'KC1',
  firstDay: '2010-01-01',
  lastDay: '2026-10-31',
}

function sampleState(): PlaygroundState {
  const state = defaultState(ctx)
  state.mode = 'experiment'
  state.stations = ['BL0', 'KC1']
  state.selection = {
    ...state.selection,
    period: ['2018-01-01', '2025-12-31'],
    months: [12, 1, 2].sort((a, b) => a - b),
    ranges: { no2: [10, null] },
  }
  state.charts = [
    {
      id: 'a',
      type: 'box',
      stations: ['KC1'],
      y: 'no2',
      group: 'windClass',
      options: { title: 'Größe ü € 日本', bins: 20, smooth: true },
    },
  ]
  state.model = {
    kind: 'boosting',
    mode: 'forecast',
    horizon: 30,
    station: 'KC1',
    features: ['weekday', 'temperature_2m_mean'],
    trainPeriod: ['2018-01-01', '2023-12-31'],
    testPeriod: ['2024-01-01', '2025-12-31'],
    params: { ridge: 10, trees: 50, depth: 2, rate: 0.2 },
  }
  return state
}

function memoryStore() {
  const data = new Map<string, string>()
  const store: KeyValueStore = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
  return { data, store }
}

const brokenWrite: KeyValueStore = {
  getItem: () => null,
  setItem: () => {
    throw new Error('quota exceeded')
  },
}

const brokenRead: KeyValueStore = {
  getItem: () => {
    throw new Error('access denied')
  },
  setItem: () => {},
}

const day1 = new Date('2026-11-09T10:00:00Z')
const day2 = new Date('2026-11-10T10:00:00Z')

describe('share link', () => {
  it('survives a round trip including umlauts and non-latin text', () => {
    const state = sampleState()
    const shared = decodeShare(`#${encodeShare(state)}`, ctx)
    if (shared.status !== 'ok') throw new Error('expected ok')
    expect(shared.result.repairs).toEqual([])
    expect(shared.result.state).toEqual(state)
  })

  it('works with and without the leading hash sign', () => {
    const code = encodeShare(sampleState())
    expect(decodeShare(code, ctx).status).toBe('ok')
    expect(decodeShare(`#${code}`, ctx).status).toBe('ok')
  })

  it('uses only url-safe characters', () => {
    expect(encodeShare(sampleState())).toMatch(/^pg=[A-Za-z0-9_-]+$/)
  })

  it('says "none" for hashes that are not share links', () => {
    for (const hash of ['', '#', '#other=1', '#tab=models', 'pg']) {
      expect(decodeShare(hash, ctx).status, hash).toBe('none')
    }
  })

  it('says "broken" for share links that cannot be decoded', () => {
    const notJson = btoa('not json').replace(/=+$/, '')
    const badUtf8 = btoa(String.fromCharCode(255, 254)).replace(/=+$/, '')
    for (const hash of ['pg=!!!', 'pg=%%%', `pg=${notJson}`, `pg=${badUtf8}`]) {
      expect(decodeShare(hash, ctx).status, hash).toBe('broken')
    }
  })

  it('gives the default state and a version repair for a wrong version', () => {
    const old = { ...defaultState(ctx), version: 2 }
    const code = `pg=${btoa(JSON.stringify(old)).replace(/=+$/, '')}`
    const shared = decodeShare(code, ctx)
    if (shared.status !== 'ok') throw new Error('expected ok')
    expect(shared.result.repairs).toEqual(['version'])
    expect(shared.result.state).toEqual(defaultState(ctx))
  })

  it('replaces an existing hash when building a url', () => {
    const url = shareUrl('https://example.org/app/#old=1', sampleState())
    expect(url.startsWith('https://example.org/app/#pg=')).toBe(true)
    expect(url.split('#')).toHaveLength(2)
  })
})

describe('local saving', () => {
  it('starts empty', () => {
    expect(listExperiments(memoryStore().store, ctx)).toEqual([])
  })

  it('saves and lists an experiment', () => {
    const { store } = memoryStore()
    const result = saveExperiment(store, ctx, 'Wind im Winter', sampleState(), day1)
    expect(result.ok).toBe(true)
    const list = listExperiments(store, ctx)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      name: 'Wind im Winter',
      savedAt: day1.toISOString(),
    })
    expect(list[0].state).toEqual(sampleState())
  })

  it('replaces an experiment saved under the same name and keeps its id', () => {
    const { store } = memoryStore()
    saveExperiment(store, ctx, 'Test', sampleState(), day1)
    const firstId = listExperiments(store, ctx)[0].id
    const changed = { ...sampleState(), mode: 'explore' as const }
    saveExperiment(store, ctx, 'Test', changed, day2)
    const list = listExperiments(store, ctx)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(firstId)
    expect(list[0].savedAt).toBe(day2.toISOString())
    expect(list[0].state.mode).toBe('explore')
  })

  it('trims names, rejects empty ones and shortens long ones', () => {
    const { store } = memoryStore()
    expect(saveExperiment(store, ctx, '   ', sampleState(), day1)).toEqual({
      ok: false,
      reason: 'name',
    })
    saveExperiment(store, ctx, `  ${'x'.repeat(200)}  `, sampleState(), day1)
    expect(listExperiments(store, ctx)[0].name).toBe('x'.repeat(MAX_NAME))
  })

  it('refuses new experiments when full but still allows replacing', () => {
    const { store } = memoryStore()
    for (let i = 0; i < MAX_SAVED; i += 1) {
      expect(saveExperiment(store, ctx, `e${i}`, sampleState(), day1).ok).toBe(true)
    }
    expect(saveExperiment(store, ctx, 'one more', sampleState(), day1)).toEqual({
      ok: false,
      reason: 'full',
    })
    expect(saveExperiment(store, ctx, 'e0', sampleState(), day2).ok).toBe(true)
    expect(listExperiments(store, ctx)).toHaveLength(MAX_SAVED)
  })

  it('reports a storage failure instead of throwing', () => {
    expect(saveExperiment(brokenWrite, ctx, 'x', sampleState(), day1)).toEqual({
      ok: false,
      reason: 'storage',
    })
    expect(deleteExperiment(brokenWrite, ctx, 'any')).toBeNull()
  })

  it('treats unreadable storage as empty', () => {
    expect(listExperiments(brokenRead, ctx)).toEqual([])
    const { data, store } = memoryStore()
    data.set(STORAGE_KEY, '{ this is not json')
    expect(listExperiments(store, ctx)).toEqual([])
    data.set(STORAGE_KEY, '{"a":1}')
    expect(listExperiments(store, ctx)).toEqual([])
  })

  it('deletes by id and ignores unknown ids', () => {
    const { store } = memoryStore()
    saveExperiment(store, ctx, 'A', sampleState(), day1)
    saveExperiment(store, ctx, 'B', sampleState(), day1)
    const [a] = listExperiments(store, ctx)
    expect(deleteExperiment(store, ctx, 'unknown')).toHaveLength(2)
    const rest = deleteExperiment(store, ctx, a.id)
    expect(rest?.map((e) => e.name)).toEqual(['B'])
  })

  it('hides entries of an unknown state version but does not delete them', () => {
    const { data, store } = memoryStore()
    data.set(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'x', name: 'future', savedAt: day1.toISOString(), state: { version: 2 } },
        { broken: true },
      ]),
    )
    expect(listExperiments(store, ctx)).toEqual([])
    saveExperiment(store, ctx, 'new', sampleState(), day2)
    expect(listExperiments(store, ctx).map((e) => e.name)).toEqual(['new'])
    const raw = JSON.parse(data.get(STORAGE_KEY) ?? '[]')
    expect(raw).toHaveLength(3)
    expect(raw[0].name).toBe('future')
  })
})

describe('JSON export and import', () => {
  it('survives a round trip', () => {
    const text = exportExperiment('Mein Test', sampleState(), day1)
    const imported = importExperiment(text, ctx)
    if (!imported.ok) throw new Error('expected ok')
    expect(imported.name).toBe('Mein Test')
    expect(imported.repairs).toEqual([])
    expect(imported.state).toEqual(sampleState())
  })

  it('rejects text that is not JSON or not an experiment file', () => {
    expect(importExperiment('{ nope', ctx)).toEqual({ ok: false, reason: 'json' })
    expect(importExperiment('[1,2]', ctx)).toEqual({ ok: false, reason: 'format' })
    expect(importExperiment('{"format":"other"}', ctx)).toEqual({
      ok: false,
      reason: 'format',
    })
  })

  it('rejects wrong versions instead of importing the default state', () => {
    const file = JSON.parse(exportExperiment('x', sampleState(), day1))
    expect(importExperiment(JSON.stringify({ ...file, version: 2 }), ctx)).toEqual({
      ok: false,
      reason: 'version',
    })
    expect(
      importExperiment(
        JSON.stringify({ ...file, state: { ...file.state, version: 2 } }),
        ctx,
      ),
    ).toEqual({ ok: false, reason: 'state' })
    expect(
      importExperiment(JSON.stringify({ ...file, state: null }), ctx),
    ).toEqual({ ok: false, reason: 'state' })
  })

  it('imports a repairable state and reports the repairs', () => {
    const file = JSON.parse(exportExperiment('x', sampleState(), day1))
    file.state.selection.months = [1, 99]
    const imported = importExperiment(JSON.stringify(file), ctx)
    if (!imported.ok) throw new Error('expected ok')
    expect(imported.state.selection.months).toEqual([1])
    expect(imported.repairs).toContain('selection.months')
  })

  it('names unnamed files "Import"', () => {
    const file = JSON.parse(exportExperiment('x', sampleState(), day1))
    delete file.name
    const imported = importExperiment(JSON.stringify(file), ctx)
    if (!imported.ok) throw new Error('expected ok')
    expect(imported.name).toBe('Import')
  })
})

describe('exportFileName', () => {
  it('builds a safe file name', () => {
    expect(exportFileName('Wind & Regen: Winter!', day1)).toBe(
      'no2-playground-wind-regen-winter-2026-11-09.json',
    )
    expect(exportFileName('Größe', day1)).toBe('no2-playground-gr-e-2026-11-09.json')
    expect(exportFileName('', day1)).toBe('no2-playground-experiment-2026-11-09.json')
  })
})