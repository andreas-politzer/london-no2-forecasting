import type { Engine } from '../adapter'
import { assignGroups, valuesOf } from '../engine'
import type { Grouping, NumericVariable } from '../state'

// Values per group for one station (weather: the same at every station).
// The keys come from the engine, in its order; groups without values stay in
// the list with an empty array.
export function cellValues(
  engine: Engine,
  mask: boolean[],
  variable: NumericVariable,
  grouping: Grouping,
  station: string,
): { keys: string[]; values: number[][] } {
  const { keys, of } = assignGroups(engine.input, engine.axis, grouping)
  const series = valuesOf(engine.input, variable, station)
  const values: number[][] = keys.map(() => [])
  for (let i = 0; i < engine.input.days; i += 1) {
    const v = series[i]
    if (mask[i] && of[i] >= 0 && v !== null) values[of[i]].push(v)
  }
  return { keys, values }
}
