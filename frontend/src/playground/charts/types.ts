import type { ComponentType } from 'react'
import type { Engine } from '../adapter'
import type {
  ChartConfig,
  ChartOption,
  ChartType,
  DaySelection,
  Grouping,
  NumericVariable,
} from '../state'
import type { Highlight } from './highlight'

// Everything a chart needs, prepared once per chart by the chart area.
export type ChartData = {
  engine: Engine
  selection: DaySelection
  mask: boolean[] // the filter: the days that are analysed
  highlightMask: boolean[] | null // marked days inside the filter, never changes n
  stations: string[] // effective stations of this chart, ordered like allStations
  allStations: string[] // fixed order: gives every station its colour
}

export type ChartProps = {
  config: ChartConfig
  data: ChartData
  width: number // the chart decides its own height
  highlight: Highlight | null
  onHighlight: (highlight: Highlight | null) => void
}

// An extra setting of one chart type, shown as a drop-down in the chart frame.
export type ChartSetting = {
  key: string
  label: string
  fallback: ChartOption
  choices: { value: ChartOption; label: string }[]
}

// How a chart type registers itself (see registry.ts). A new chart type is one
// new component plus one entry in the registry; no other file changes.
export type ChartDefinition = {
  type: ChartType
  label: string
  hint: string
  fields: { x: boolean; y: boolean; group: boolean } // which choices the frame offers
  defaults: {
    x?: NumericVariable
    y?: NumericVariable
    group?: Grouping
    options?: Record<string, ChartOption>
  }
  settings: ChartSetting[]
  Component: ComponentType<ChartProps>
}
