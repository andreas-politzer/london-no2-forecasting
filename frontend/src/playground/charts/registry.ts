import { GROUPING_LABELS, PGU } from '../labels'
import { GROUPINGS, type ChartType } from '../state'
import BarsChart from './BarsChart'
import BoxChart from './BoxChart'
import CalendarChart from './CalendarChart'
import DistributionChart from './DistributionChart'
import HeatmapChart from './HeatmapChart'
import ScatterChart from './ScatterChart'
import WindRoseChart from './WindRoseChart'
import YearCompareChart from './YearCompareChart'
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
    type: 'box',
    label: 'Boxplot',
    hint: 'Streuung der Werte je Gruppe: Median, Box, Ausreißer. Wahlweise als Violine.',
    fields: { x: false, y: true, group: true },
    defaults: { y: 'no2', group: 'windClass', options: { form: 'box' } },
    settings: [
      {
        key: 'form',
        label: PGU.formLabel,
        fallback: 'box',
        choices: [
          { value: 'box', label: PGU.formBox },
          { value: 'violin', label: PGU.formViolin },
        ],
      },
    ],
    Component: BoxChart,
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
  {
    type: 'scatter',
    label: 'Streudiagramm',
    hint: 'Zwei Größen gegeneinander, ein Punkt je Tag, mit Trendlinie.',
    fields: { x: true, y: true, group: false },
    defaults: { x: 'temperature_2m_mean', y: 'no2', options: { form: 'points' } },
    settings: [
      {
        key: 'form',
        label: PGU.formLabel,
        fallback: 'points',
        choices: [
          { value: 'points', label: PGU.formPoints },
          { value: 'hexbin', label: PGU.formHexbin },
        ],
      },
    ],
    Component: ScatterChart,
  },
  {
    type: 'heatmap',
    label: 'Heatmap',
    hint: 'Mittelwert für jede Kombination zweier Gruppierungen, oder Korrelation aller Größen.',
    fields: { x: false, y: true, group: true },
    defaults: { y: 'no2', group: 'windClass', options: { form: 'cross', rows: 'month', method: 'spearman' } },
    settings: [
      {
        key: 'form',
        label: PGU.heatForm,
        fallback: 'cross',
        choices: [
          { value: 'cross', label: PGU.heatFormCross },
          { value: 'correlation', label: PGU.heatFormCorrelation },
        ],
      },
      {
        key: 'rows',
        label: PGU.heatRows,
        fallback: 'month',
        choices: GROUPINGS.filter((g) => g !== 'none').map((g) => ({ value: g, label: GROUPING_LABELS[g] })),
      },
      {
        key: 'method',
        label: PGU.heatMethod,
        fallback: 'spearman',
        choices: [
          { value: 'spearman', label: PGU.heatSpearman },
          { value: 'pearson', label: PGU.heatPearson },
        ],
      },
    ],
    Component: HeatmapChart,
  },
  {
    type: 'windrose',
    label: 'Windrose',
    hint: 'Aus welcher Richtung weht der Wind, und wie viel NO₂ gibt es dabei?',
    fields: { x: false, y: false, group: false },
    defaults: { options: { show: 'days' } },
    settings: [
      {
        key: 'show',
        label: PGU.roseShow,
        fallback: 'days',
        choices: [
          { value: 'days', label: PGU.roseShowDays },
          { value: 'no2', label: PGU.roseShowNo2 },
        ],
      },
    ],
    Component: WindRoseChart,
  },
  {
    type: 'calendar',
    label: 'Kalender',
    hint: 'Ein Jahr als Kalender, ein Feld je Tag, Farbe nach Wert.',
    fields: { x: false, y: true, group: false },
    defaults: { y: 'no2' },
    settings: [],
    Component: CalendarChart,
  },
  {
    type: 'yearcompare',
    label: 'Jahresvergleich',
    hint: 'Monatsmittel aller Jahre nebeneinander, als Tabelle oder Linien.',
    fields: { x: false, y: true, group: false },
    defaults: { y: 'no2', options: { form: 'grid' } },
    settings: [
      {
        key: 'form',
        label: PGU.formLabel,
        fallback: 'grid',
        choices: [
          { value: 'grid', label: PGU.formGrid },
          { value: 'lines', label: PGU.formLines },
        ],
      },
    ],
    Component: YearCompareChart,
  },
]

export function getDefinition(type: ChartType): ChartDefinition | undefined {
  return CHART_DEFINITIONS.find((definition) => definition.type === type)
}
