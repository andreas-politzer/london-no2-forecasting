import type { NumericVariable } from '../state'
import type { ChartData } from './types'

export type Basis = {
  selectedDays: number // days in the filter
  highlightedDays: number | null // marked days, null when nothing is marked
  perStation: { code: string; values: number }[] // days with a value (NO2 only)
}

const count = (mask: boolean[]) => mask.reduce((sum, on) => sum + (on ? 1 : 0), 0)

// The numbers behind a chart: how many days, and how many of them have a value.
// Weather variables have a value on every day, so only NO2 is counted per
// station.
export function chartBasis(data: ChartData, variable: NumericVariable): Basis {
  const perStation =
    variable === 'no2'
      ? data.stations.map((code) => {
          const series = data.engine.input.no2[code]
          let values = 0
          for (let i = 0; i < data.mask.length; i += 1) {
            if (data.mask[i] && series[i] !== null) values += 1
          }
          return { code, values }
        })
      : []
  return {
    selectedDays: count(data.mask),
    highlightedDays: data.highlightMask ? count(data.highlightMask) : null,
    perStation,
  }
}
