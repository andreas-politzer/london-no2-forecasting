import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildEngine } from '../src/playground/adapter'
import { compareStats, splitGroups } from '../src/playground/compare/compareLogic'
import type { PlaygroundData } from '../src/playground/data'
import { selectDays } from '../src/playground/engine'
import { EXAMPLES, applyExample } from '../src/playground/examples'
import { toSpec } from '../src/playground/modelcore/config'
import { runExperiment } from '../src/playground/modelcore/experiment'
import { CHART_TYPES, defaultModelConfig, parseState, serializeState, type StateContext } from '../src/playground/state'

const base = new URL('../public/data/playground/', import.meta.url)
const read = (name: string) => JSON.parse(readFileSync(new URL(name, base), 'utf-8'))
const meta = read('playground_meta.json')
const stations = ['BL0', 'KC1', 'MY1']
const no2 = Object.fromEntries(stations.map((code) => [code, read(`no2_${code}.json`).no2]))
const data: PlaygroundData = { dates: [], calendar: read('calendar.json'), weather: read('weather.json'), meta, no2 }
const engine = buildEngine(data)
const ctx: StateContext = { stations, defaultStation: 'KC1', firstDay: meta.first_day, lastDay: meta.last_day }

describe('the ten examples', () => {
  it('are ten, with distinct ids and real texts', () => {
    expect(EXAMPLES).toHaveLength(10)
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(10)
    for (const example of EXAMPLES) {
      expect(example.title.length).toBeGreaterThan(5)
      expect(example.text.length).toBeGreaterThan(20)
    }
  })
  for (const example of EXAMPLES) {
    describe(example.id, () => {
      const state = applyExample(ctx, example)
      it('is a valid state that survives saving and loading unchanged', () => {
        const loaded = parseState(JSON.parse(serializeState(state)), ctx)
        expect(loaded.repairs).toEqual([])
        expect(loaded.state).toEqual(state)
        expect(state.mode).toBe(example.mode)
        for (const chart of state.charts) expect(CHART_TYPES).toContain(chart.type)
      })
      if (example.mode === 'combine') {
        it('compares two groups that both have enough measured days', () => {
          const compare = state.compare
          expect(compare).toBeDefined()
          const mask = selectDays(engine.input, state.selection, state.stations, engine.axis)
          const split = splitGroups(engine, mask, compare!)
          const [result] = compareStats(engine, split, state.stations)
          expect(result.a.tooFew, `${example.id}: group A`).toBe(false)
          expect(result.b.tooFew, `${example.id}: group B`).toBe(false)
        })
      }
      if (example.mode === 'experiment') {
        it('runs and leaves enough test days', () => {
          const config = state.model ?? defaultModelConfig(ctx)
          const result = runExperiment(engine, toSpec(config, config.station ?? 'KC1'))
          expect(result.ok).toBe(true)
          if (result.ok) expect(result.counts.testRows).toBeGreaterThan(100)
        })
      }
    })
  }
})
