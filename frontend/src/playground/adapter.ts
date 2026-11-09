import type { PlaygroundData } from './data'
import { buildAxis, buildFlags, type Axis, type EngineInput } from './engine'

// Bridge between the loaded files (data.ts) and the pure calculation core
// (engine.ts). No logic of its own: it only renames and passes arrays through.
export function toEngineInput(data: PlaygroundData): EngineInput {
  return {
    firstDay: data.calendar.first_day,
    days: data.calendar.n,
    weekday: data.calendar.weekday,
    holiday: data.calendar.holiday,
    corona: data.calendar.corona,
    ulez: data.calendar.ulez,
    weather: data.weather.series,
    no2: data.no2,
    thresholds: data.meta.definitions.thresholds,
  }
}

export type Engine = {
  input: EngineInput
  axis: Axis
  flags: Record<string, boolean[]>
}

// Built once per loaded data set. The React side keeps the result in useMemo.
export function buildEngine(data: PlaygroundData): Engine {
  const input = toEngineInput(data)
  const axis = buildAxis(input)
  return { input, axis, flags: buildFlags(input, axis) }
}