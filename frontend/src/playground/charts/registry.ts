import { PGU } from '../labels'
import type { ChartType } from '../state'
import BarsChart from './BarsChart'
import type { ChartDefinition } from './types'

// The chart catalogue. A new chart type is one component plus one entry here;
// the frame, the settings, saving, sharing and highlighting need no change.
export const CHART_DEFINITIONS: ChartDefinition[] = [
  {
    type: 'bars',
    label: 'Balken',
    hint: 'Mittelwert oder Median je Gruppe, mit Fallzahl.',
    fields: { x: false, y: true, group: true },
    defaults: { y: 'no2', group: 'windClass', options: { stat: 'mean' } },
    settings: [
      {
        key: 'stat',
        label: PGU.statLabel,
        fallback: 'mean',
        choices: [
          { value: 'mean', label: PGU.statMean },
          { value: 'median', label: PGU.statMedian },
        ],
      },
    ],
    Component: BarsChart,
  },
]

export function getDefinition(type: ChartType): ChartDefinition | undefined {
  return CHART_DEFINITIONS.find((definition) => definition.type === type)
}
