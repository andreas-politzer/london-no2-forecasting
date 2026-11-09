import { defaultModelConfig, defaultState, type ChartConfig, type CompareConfig, type Mode, type PlaygroundState, type StateContext } from './state'
import type { ModelConfig } from './state'

// Ten ready-made experiments. Each one is a complete state: loading it replaces
// the current settings (the person can save those first). Every text says what
// to look at and, where it matters, what the result does not show.

export type Example = {
  id: string
  title: string
  text: string
  mode: Mode
  build: (ctx: StateContext) => Partial<PlaygroundState>
}

const chart = (type: ChartConfig['type'], rest: Partial<ChartConfig> = {}): ChartConfig => ({
  id: 'chart-1',
  type,
  stations: null,
  options: {},
  ...rest,
})

const compare = (a: CompareConfig['a'], b: CompareConfig['b']): CompareConfig => ({ a, b })

const model = (ctx: StateContext, patch: Partial<ModelConfig>): ModelConfig => ({ ...defaultModelConfig(ctx), station: 'KC1', ...patch })

export const EXAMPLES: Example[] = [
  {
    id: 'wind',
    title: 'Wie viel macht Wind aus?',
    text: 'Windige gegen windstille Tage, beide nur im Winter, damit nicht die Jahreszeit den Unterschied macht.',
    mode: 'combine',
    build: () => ({
      stations: ['KC1'],
      compare: compare({ windClass: ['windy'], season: ['winter'] }, { windClass: ['calm'], season: ['winter'] }),
    }),
  },
  {
    id: 'rain',
    title: 'Wäscht Regen die Luft?',
    text: 'Sehr nasse gegen trockene Tage. Regen kommt oft mit Wind, der Unterschied kann also auch vom Wind stammen.',
    mode: 'combine',
    build: () => ({
      stations: ['KC1'],
      compare: compare({ rainClass: ['veryWet'] }, { rainClass: ['dry'] }),
    }),
  },
  {
    id: 'holidays',
    title: 'Wie anders sind Feiertage?',
    text: 'Bank Holidays gegen normale Werktage. Es sind wenige Tage, achte auf die Zahl der Messwerte.',
    mode: 'combine',
    build: () => ({
      stations: ['KC1'],
      compare: compare({ dayType: ['bankHoliday'] }, { dayType: ['workday'] }),
    }),
  },
  {
    id: 'corona',
    title: 'Corona: Lockdown gegen Normalbetrieb',
    text: 'Lockdown-Tage im Frühling gegen Frühlingstage ohne Einschränkungen. Auch das Wetter und die Jahre waren verschieden.',
    mode: 'combine',
    build: () => ({
      stations: ['KC1'],
      compare: compare({ corona: ['2'], season: ['spring'] }, { corona: ['0'], season: ['spring'] }),
    }),
  },
  {
    id: 'windrose',
    title: 'Woher kommt die Belastung?',
    text: 'Eine Windrose: Aus welcher Richtung weht der Wind, und wie hoch ist das NO₂ an diesen Tagen?',
    mode: 'explore',
    build: () => ({
      stations: ['KC1'],
      charts: [chart('windrose', { options: { show: 'no2' } })],
    }),
  },
  {
    id: 'weekday',
    title: 'Der Wochenrhythmus',
    text: 'Mittleres NO₂ nach Wochentag. Wochenenden sind meist sauberer, weil weniger Verkehr unterwegs ist.',
    mode: 'explore',
    build: () => ({
      stations: ['KC1'],
      charts: [chart('bars', { y: 'no2', group: 'weekday', options: { stat: 'mean' } })],
    }),
  },
  {
    id: 'years',
    title: 'Wird die Luft besser?',
    text: 'Die Monatsmittel aller Jahre nebeneinander. Achte auf Lücken, wo nicht gemessen wurde.',
    mode: 'explore',
    build: () => ({
      stations: ['KC1'],
      charts: [chart('yearcompare', { y: 'no2', options: { form: 'grid' } })],
    }),
  },
  {
    id: 'ulez',
    title: 'Vor und nach der ULEZ',
    text: 'Die ULEZ-Phasen im Winter nebeneinander. In diesen Jahren änderte sich auch Verkehr, Wetter und Technik.',
    mode: 'explore',
    build: (ctx) => {
      const state = defaultState(ctx)
      return {
        stations: ['KC1'],
        selection: { ...state.selection, months: [1, 2, 11, 12] },
        charts: [chart('box', { y: 'no2', group: 'ulez', options: { form: 'box' } })],
      }
    },
  },
  {
    id: 'explain-weather',
    title: 'Wie viel erklärt das Wetter?',
    text: 'Ein lineares Modell aus Kalender und dem Wetter des Tages. Es erklärt Zusammenhänge, es prognostiziert nichts.',
    mode: 'experiment',
    build: (ctx) => ({
      stations: ['KC1'],
      model: model(ctx, { mode: 'explain', kind: 'linear' }),
    }),
  },
  {
    id: 'forecast-month',
    title: 'Lohnt sich eine Prognose für 30 Tage?',
    text: 'Ein Boosting-Modell mit Kalender und früheren Mittelwerten, gegen die einfachen Verfahren. Bei 30 Tagen bleibt wenig Wissen übrig.',
    mode: 'experiment',
    build: (ctx) => ({
      stations: ['KC1'],
      model: model(ctx, {
        mode: 'forecast',
        kind: 'boosting',
        horizon: 30,
        features: ['weekday', 'month', 'bankHoliday', 'trend', 'mean7', 'mean28'],
      }),
    }),
  },
]

// The state an example stands for: the defaults, with the example's parts.
export function applyExample(ctx: StateContext, example: Example): PlaygroundState {
  return { ...defaultState(ctx), ...example.build(ctx), mode: example.mode }
}
