import { PGU } from '../labels'
import type { ChartType } from '../state'
import BarsChart from './BarsChart'
import DistributionChart from './DistributionChart'
import TimelineChart from './TimelineChart'
import { SMOOTH_WINDOWS } from './timelineData'
import type { ChartDefinition } from './types'

// The chart catalogue. A new chart type is one component plus one entry here;
// the frame, the settings, saving, sharing and highlighting need no change.
export const CHART_DEFINITIONS: ChartDefinition[] = [
  {
    type: 'timeline',
    label: 'Zeitverlauf',
    hint: 'Werte über den ganzen Zeitraum, geglättet. Ziehen markiert einen Zeitraum.',
    fields: { x: false, y: true, group: false },
    defaults: { y: 'no2', group: 'none', options: { window: 30 } },
    settings: [
      {
        key: 'window',
        label: PGU.smoothLabel,
        fallback: 30,
        choices: SMOOTH_WINDOWS.map((w) => ({ value: w, label: w === 1 ? PGU.smoothDaily : PGU.smoothDays(w) })),
      },
    ],
    Component: TimelineChart,
  },
  {
    type: 'distribution',
    label: 'Verteilung',
    hint: 'Wie sich die Werte auf Klassen verteilen. Ziehen markiert einen Wertebereich.',
    fields: { x: false, y: true, group: true },
    defaults: { y: 'no2', group: 'none', options: { mode: 'histogram', bins: 'auto', bandwidth: 1 } },
    settings: [
      {
        key: 'mode',
        label: PGU.distMode,
        fallback: 'histogram',
        choices: [
          { value: 'histogram', label: PGU.distHistogram },
          { value: 'density', label: PGU.distDensity },
        ],
      },
      {
        key: 'bins',
        label: PGU.distBins,
        fallback: 'auto',
        choices: [
          { value: 'auto', label: PGU.distBinsAuto },
          { value: 10, label: '10' },
          { value: 20, label: '20' },
          { value: 40, label: '40' },
        ],
      },
      {
        key: 'bandwidth',
        label: PGU.distBandwidth,
        fallback: 1,
        choices: [
          { value: 0.5, label: PGU.distBandwidthChoices.narrow },
          { value: 1, label: PGU.distBandwidthChoices.normal },
          { value: 2, label: PGU.distBandwidthChoices.wide },
        ],
      },
    ],
    Component: DistributionChart,
  },
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
