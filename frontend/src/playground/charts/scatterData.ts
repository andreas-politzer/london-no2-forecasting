import type { Engine } from '../adapter'
import type { NumericVariable } from '../state'
import { linearFit, scatterPairs, type LinearFit, type Pairs } from '../stats'

export type ScatterSeries = {
  code: string
  pairs: Pairs
  fit: LinearFit | null
}

// One series per station when NO2 is on an axis. Two weather variables are the
// same at every station, so there is a single series.
export function scatterSeries(
  engine: Engine,
  mask: boolean[],
  x: NumericVariable,
  y: NumericVariable,
  stations: string[],
): ScatterSeries[] {
  const list = x === 'no2' || y === 'no2' ? stations : stations.slice(0, 1)
  return list.map((code) => {
    const pairs = scatterPairs(engine.input, mask, x, y, code)
    return { code, pairs, fit: linearFit(pairs.x, pairs.y) }
  })
}

// A path of small round dots: one element for thousands of points. The dots
// are drawn with round line caps on zero-length segments.
export function dotsPath(points: [number, number][]): string {
  let path = ''
  for (const [px, py] of points) path += `M${px.toFixed(1)} ${py.toFixed(1)}h0`
  return path
}
