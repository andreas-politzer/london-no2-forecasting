import type { PlaygroundData } from '../data'
import { EXAMPLES } from '../examples'
import { MIN_CELL_DAYS } from '../stats'
import type { IntroFacts } from './introContent'

// A day counts as measured with this many distinct hourly values. The pipeline
// rule lives in backend/forecast_lab/data.py (MIN_HOURS); a test compares both.
export const MIN_HOURLY_VALUES = 18

// The changeable facts of the introduction, taken from what the application
// really uses.
export function introFactsFrom(data: PlaygroundData, stationCount: number): IntroFacts {
  return {
    stationCount,
    firstDay: data.meta.first_day,
    lastDay: data.meta.last_day,
    days: data.meta.days,
    minGroupDays: data.meta.definitions.thresholds.min_days_per_group,
    minCellDays: MIN_CELL_DAYS,
    exampleCount: EXAMPLES.length,
    minHours: MIN_HOURLY_VALUES,
  }
}
