import { useState } from 'react'
import type { Engine } from '../adapter'
import { PGU } from '../labels'
import type { ChartConfig, ChartType, DaySelection, PlaygroundState } from '../state'
import {
  addChart,
  changeChartType,
  duplicateChart,
  effectiveStations,
  removeChart,
  setChartOption,
  updateChart,
} from './chartActions'
import ChartFrame from './ChartFrame'
import { highlightToSelection, type Highlight } from './highlight'
import { CHART_DEFINITIONS, getDefinition } from './registry'
import type { ChartData } from './types'

type Props = {
  engine: Engine
  state: PlaygroundState
  update: (change: (previous: PlaygroundState) => PlaygroundState) => void
  mask: boolean[]
  highlight: Highlight | null
  highlightMask: boolean[] | null
  onHighlight: (highlight: Highlight | null) => void
  onApplyHighlight: (selection: DaySelection) => void
  stationList: { code: string; place: string }[]
}

// The charts of one workspace, the toolbar to add charts, and the marking
// toolbar. It only wires things together; every decision is in pure functions.
export default function ChartArea({
  engine,
  state,
  update,
  mask,
  highlight,
  highlightMask,
  onHighlight,
  onApplyHighlight,
  stationList,
}: Props) {
  const [newType, setNewType] = useState<ChartType>(CHART_DEFINITIONS[0].type)
  const allStations = stationList.map((s) => s.code).filter((code) => code in engine.input.no2)

  const dataFor = (chart: ChartConfig): ChartData => ({
    engine,
    selection: state.selection,
    mask,
    highlightMask,
    stations: effectiveStations(chart, state.stations, allStations),
    allStations,
  })

  const markedDays = highlightMask ? highlightMask.reduce((sum, on) => sum + (on ? 1 : 0), 0) : 0
  const asSelection = highlight
    ? highlightToSelection(state.selection, highlight, engine.input.thresholds)
    : null

  return (
    <div className="pgx-area">
      <div className="pgx-toolbar">
        <div className="pgx-add">
          <select
            aria-label={PGU.chartType}
            value={newType}
            onChange={(event) => setNewType(event.target.value as ChartType)}
          >
            {CHART_DEFINITIONS.map((d) => (
              <option key={d.type} value={d.type} title={d.hint}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pgx-btn pgx-btn-primary"
            onClick={() => {
              const definition = getDefinition(newType)
              if (definition) update((s) => addChart(s, newType, definition.defaults))
            }}
          >
            {PGU.addChart}
          </button>
        </div>

        {highlight ? (
          <div className="pgx-marking" role="status">
            <strong>{PGU.highlightDays(markedDays)}</strong>
            <button type="button" className="pgx-btn" onClick={() => onHighlight(null)}>
              {PGU.highlightClear}
            </button>
            <button
              type="button"
              className="pgx-btn pgx-btn-primary"
              disabled={asSelection === null}
              onClick={() => asSelection && onApplyHighlight(asSelection)}
            >
              {PGU.highlightApply}
            </button>
            {asSelection === null && <span className="pgx-muted">{PGU.highlightCannot}</span>}
          </div>
        ) : (
          <p className="pgx-muted pgx-hint">{PGU.highlightHint}</p>
        )}
      </div>

      <div className="pgx-charts">
        {state.charts.map((chart) => (
          <ChartFrame
            key={chart.id}
            config={chart}
            data={dataFor(chart)}
            definition={getDefinition(chart.type)}
            definitions={CHART_DEFINITIONS}
            stationList={stationList}
            globalStations={state.stations}
            highlight={highlight}
            onHighlight={onHighlight}
            onChange={(patch) => update((s) => updateChart(s, chart.id, patch))}
            onChangeType={(type) => {
              const definition = getDefinition(type)
              if (definition) update((s) => changeChartType(s, chart.id, type, definition.defaults))
            }}
            onOption={(key, value) => update((s) => setChartOption(s, chart.id, key, value))}
            onDuplicate={() => update((s) => duplicateChart(s, chart.id))}
            onRemove={() => update((s) => removeChart(s, chart.id))}
            canRemove={state.charts.length > 1}
          />
        ))}
      </div>
    </div>
  )
}
