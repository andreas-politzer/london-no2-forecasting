import type {
  ChartConfig,
  ChartOption,
  ChartType,
  Grouping,
  NumericVariable,
  PlaygroundState,
} from '../state'

// Pure changes of the playground state. The components only call these.

export type ChartDefaults = {
  x?: NumericVariable
  y?: NumericVariable
  group?: Grouping
  options?: Record<string, ChartOption>
}

export function nextChartId(charts: ChartConfig[]): string {
  const used = new Set(charts.map((chart) => chart.id))
  let n = charts.length + 1
  while (used.has(`chart-${n}`)) n += 1
  return `chart-${n}`
}

export function makeChart(id: string, type: ChartType, defaults: ChartDefaults): ChartConfig {
  const chart: ChartConfig = { id, type, stations: null, options: { ...(defaults.options ?? {}) } }
  if (defaults.x) chart.x = defaults.x
  if (defaults.y) chart.y = defaults.y
  if (defaults.group) chart.group = defaults.group
  return chart
}

export function addChart(
  state: PlaygroundState,
  type: ChartType,
  defaults: ChartDefaults,
): PlaygroundState {
  return {
    ...state,
    charts: [...state.charts, makeChart(nextChartId(state.charts), type, defaults)],
  }
}

// The last chart cannot be removed: a playground without a chart is useless and
// would come back as the default chart after reloading anyway.
export function removeChart(state: PlaygroundState, id: string): PlaygroundState {
  if (state.charts.length <= 1) return state
  return { ...state, charts: state.charts.filter((chart) => chart.id !== id) }
}

export function duplicateChart(state: PlaygroundState, id: string): PlaygroundState {
  const index = state.charts.findIndex((chart) => chart.id === id)
  if (index < 0) return state
  const original = state.charts[index]
  const copy: ChartConfig = {
    ...original,
    id: nextChartId(state.charts),
    stations: original.stations ? [...original.stations] : null,
    options: { ...original.options },
  }
  const charts = [...state.charts]
  charts.splice(index + 1, 0, copy)
  return { ...state, charts }
}

export function updateChart(
  state: PlaygroundState,
  id: string,
  patch: Partial<Omit<ChartConfig, 'id'>>,
): PlaygroundState {
  return {
    ...state,
    charts: state.charts.map((chart) => (chart.id === id ? { ...chart, ...patch } : chart)),
  }
}

// A new chart type starts from that type's defaults; only the chart's own
// station choice is kept.
export function changeChartType(
  state: PlaygroundState,
  id: string,
  type: ChartType,
  defaults: ChartDefaults,
): PlaygroundState {
  return {
    ...state,
    charts: state.charts.map((chart) => {
      if (chart.id !== id) return chart
      const next = makeChart(id, type, defaults)
      next.stations = chart.stations
      return next
    }),
  }
}

export function setChartOption(
  state: PlaygroundState,
  id: string,
  key: string,
  value: ChartOption,
): PlaygroundState {
  return {
    ...state,
    charts: state.charts.map((chart) =>
      chart.id === id ? { ...chart, options: { ...chart.options, [key]: value } } : chart,
    ),
  }
}

// Switches one station on or off. At least one stays on; the result keeps the
// fixed order of all stations.
export function toggleStation(current: string[], code: string, all: string[]): string[] {
  const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
  if (next.length === 0) return current
  return all.filter((c) => next.includes(c))
}

// The stations a chart really uses: its own choice or the global one.
export function effectiveStations(chart: ChartConfig, global: string[], all: string[]): string[] {
  const chosen = chart.stations ?? global
  const known = all.filter((code) => chosen.includes(code))
  return known.length > 0 ? known : global
}
