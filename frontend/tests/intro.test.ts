import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { PlaygroundData } from '../src/playground/data'
import { EXAMPLES } from '../src/playground/examples'
import { buildIntro, longDate, numberWord, type Intro, type IntroBlock } from '../src/playground/intro/introContent'
import { MIN_HOURLY_VALUES, introFactsFrom } from '../src/playground/intro/introFacts'
import { MIN_CELL_DAYS } from '../src/playground/stats'

const base = new URL('../public/data/playground/', import.meta.url)
const read = (name: string) => JSON.parse(readFileSync(new URL(name, base), 'utf-8'))
const meta = read('playground_meta.json')
const data = { dates: [], calendar: read('calendar.json'), weather: read('weather.json'), meta, no2: {} } as unknown as PlaygroundData

function textOf(intro: Intro): string {
  const block = (b: IntroBlock): string =>
    b.kind === 'p' ? b.text : b.kind === 'warn' ? `${b.title} ${b.text}` : b.items.map((i) => `${i.lead ?? ''} ${i.text}`).join(' ')
  return [
    intro.title,
    intro.lead,
    intro.start.steps.map((s) => s.text).join(' '),
    intro.sections.map((s) => `${s.title} ${s.summary} ${s.blocks.map(block).join(' ')}`).join(' '),
    intro.glossary.map((g) => `${g.term} ${g.text}`).join(' '),
  ].join(' ')
}

describe('the introduction takes its changeable facts from the application', () => {
  const facts = introFactsFrom(data, 5)
  const intro = buildIntro(facts)
  const text = textOf(intro)

  it('uses the real stations, period, days and thresholds', () => {
    expect(facts.stationCount).toBe(5)
    expect(facts.firstDay).toBe(meta.first_day)
    expect(facts.lastDay).toBe(meta.last_day)
    expect(facts.days).toBe(meta.days)
    expect(facts.minGroupDays).toBe(meta.definitions.thresholds.min_days_per_group)
    expect(facts.minCellDays).toBe(MIN_CELL_DAYS)
    expect(facts.exampleCount).toBe(EXAMPLES.length)
    expect(text).toContain(`${longDate(meta.first_day)} bis ${longDate(meta.last_day)}`)
    expect(text).toContain(`${meta.days.toLocaleString('de-DE')} Tage`)
    expect(text).toContain(`Unter ${meta.definitions.thresholds.min_days_per_group} Messwerten`)
    expect(text).toContain(`Unter ${MIN_CELL_DAYS} Messwerten`)
    expect(text).toContain('fünf Messstationen')
    expect(text).toContain('Es gibt zehn davon')
  })
  it('changes when the facts change, so nothing is hard-coded', () => {
    const other = textOf(buildIntro({ ...facts, stationCount: 7, days: 1234, minGroupDays: 45, minCellDays: 12, exampleCount: 8, minHours: 20, firstDay: '2015-03-01', lastDay: '2020-06-30' }))
    expect(other).toContain('sieben Messstationen')
    expect(other).toContain('1.234 Tage')
    expect(other).toContain('Unter 45 Messwerten')
    expect(other).toContain('Unter 12 Messwerten')
    expect(other).toContain('Es gibt acht davon')
    expect(other).toContain('mindestens 20 verschiedene Stundenwerte')
    expect(other).toContain('1. März 2015 bis 30. Juni 2020')
    expect(other).not.toContain('fünf Messstationen')
  })
  it('the hourly threshold equals the backend rule', () => {
    const backend = readFileSync(new URL('../../backend/forecast_lab/data.py', import.meta.url), 'utf-8')
    const match = /^MIN_HOURS\s*=\s*(\d+)/m.exec(backend)
    expect(match).not.toBeNull()
    expect(MIN_HOURLY_VALUES).toBe(Number(match![1]))
  })
  it('the number of example experiments and of chart types named is right', () => {
    expect(EXAMPLES.length).toBe(10)
    expect(text).toContain('neun Arten')
  })
})

describe('the structure', () => {
  const intro = buildIntro(introFactsFrom(data, 5))
  it('has six entries in the table of contents, each pointing at something that exists', () => {
    expect(intro.toc).toHaveLength(6)
    const ids = new Set([...intro.sections.map((s) => s.id), 'start'])
    for (const entry of intro.toc) expect(ids.has(entry.id), entry.id).toBe(true)
    expect(new Set(intro.toc.map((e) => e.id)).size).toBe(6)
    expect(intro.sections).toHaveLength(5)
  })
  it('keeps the important warnings', () => {
    const text = textOf(intro)
    expect(text).toContain('Zusammenhang, keine Ursache')
    expect(text).toContain('nicht direkt vergleichbar')
    expect(text).toContain('Der Playground sagt keine kommenden Tage voraus')
    expect(text).toContain('keine Messungen direkt an den Messstationen')
  })
  it('explains MAE and bias separately, and every glossary term once', () => {
    const terms = intro.glossary.map((g) => g.term)
    expect(new Set(terms).size).toBe(terms.length)
    expect(terms).toContain('Mittlerer absoluter Fehler (MAE)')
    expect(terms).toContain('Verzerrung (Bias)')
    expect(intro.glossary.find((g) => g.term.startsWith('Verzerrung'))?.text).toContain('Vorzeichen')
  })
  it('does not promise a reset or a forecast of coming days', () => {
    const text = textOf(intro)
    expect(text).not.toContain('Nichts geht kaputt')
    expect(text).not.toMatch(/zurücksetzen/)
  })
  it('words and dates', () => {
    expect(numberWord(5)).toBe('fünf')
    expect(numberWord(20)).toBe('20')
    expect(longDate('2026-10-31')).toBe('31. Oktober 2026')
  })
})
