import { describe, expect, it } from 'vitest'
import { encodeShare } from '../src/playground/persist'
import { resolveInitial } from '../src/playground/useSession'
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

function sharedState(): PlaygroundState {
  const state = defaultState(ctx)
  state.mode = 'combine'
  state.stations = ['BL0', 'KC1']
  state.selection = {
    ...state.selection,
    months: [12, 1, 2].sort((a, b) => a - b),
    ranges: { wind_speed_10m_mean: [18.2, null] },
  }
  state.charts = [
    {
      id: 'a',
      type: 'box',
      stations: null,
      y: 'no2',
      group: 'windClass',
      options: { title: 'Größe €' },
    },
  ]
  return state
}

const plain = (text: string) => `pg=${btoa(text).replace(/=+$/, '')}`

describe('resolveInitial', () => {
  it('starts with the default state when there is no share link', () => {
    for (const hash of ['', '#', '#tab=models', '#other=1']) {
      const result = resolveInitial(hash, ctx)
      expect(result.state, hash).toEqual(defaultState(ctx))
      expect(result.notice, hash).toBeNull()
    }
  })

  it('opens a readable share link without a notice', () => {
    const state = sharedState()
    const result = resolveInitial(`#${encodeShare(state)}`, ctx)
    expect(result.state).toEqual(state)
    expect(result.notice).toBeNull()
  })

  it('reports a link that cannot be decoded', () => {
    for (const hash of ['#pg=!!!', `#${plain('not json')}`]) {
      const result = resolveInitial(hash, ctx)
      expect(result.state, hash).toEqual(defaultState(ctx))
      expect(result.notice, hash).toEqual({ kind: 'share-broken' })
    }
  })

  it('reports a link from another version', () => {
    const old = JSON.stringify({ ...defaultState(ctx), version: 2 })
    const result = resolveInitial(`#${plain(old)}`, ctx)
    expect(result.state).toEqual(defaultState(ctx))
    expect(result.notice).toEqual({ kind: 'share-version' })
  })

  it('reports a link whose content is not a state at all', () => {
    for (const text of ['42', '[1,2]', '"text"', 'null']) {
      const result = resolveInitial(`#${plain(text)}`, ctx)
      expect(result.state, text).toEqual(defaultState(ctx))
      expect(result.notice, text).toEqual({ kind: 'share-broken' })
    }
  })

  it('repairs a partly invalid link and lists what was repaired', () => {
    const state = sharedState()
    state.selection.months = [1, 99]
    state.stations = ['KC1', 'XX9']
    const result = resolveInitial(`#${encodeShare(state)}`, ctx)
    expect(result.state.selection.months).toEqual([1])
    expect(result.state.stations).toEqual(['KC1'])
    expect(result.state.mode).toBe('combine')
    if (result.notice?.kind !== 'share-repaired') {
      throw new Error('expected a repair notice')
    }
    expect(result.notice.repairs).toEqual(
      expect.arrayContaining(['selection.months', 'stations']),
    )
  })
})