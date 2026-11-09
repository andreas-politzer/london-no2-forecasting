import { useId, useState } from 'react'
import InfoPopover from '../../InfoPopover'
import { PGU, GROUPING_LABELS, VARIABLE_LABELS, chartTitle } from '../labels'
import {
  GROUPINGS,
  NUMERIC_VARIABLES,
  type ChartConfig,
  type ChartOption,
  type ChartType,
  type Grouping,
  type NumericVariable,
} from '../state'
import { isLinearVariable } from '../stats'
import { chartBasis } from './basis'
import { toggleStation } from './chartActions'
import type { Highlight } from './highlight'
import type { ChartData, ChartDefinition } from './types'
import { useElementWidth } from './useElementWidth'

type Props = {
  config: ChartConfig
  data: ChartData
  definition: ChartDefinition | undefined
  definitions: ChartDefinition[]
  stationList: { code: string; place: string }[]
  globalStations: string[]
  highlight: Highlight | null
  onHighlight: (highlight: Highlight | null) => void
  onChange: (patch: Partial<Omit<ChartConfig, 'id'>>) => void
  onChangeType: (type: ChartType) => void
  onOption: (key: string, value: ChartOption) => void
  onDuplicate: () => void
  onRemove: () => void
  canRemove: boolean
}

const LINEAR_VARIABLES = NUMERIC_VARIABLES.filter(isLinearVariable)

type SelectProps = {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

function Select({ label, value, options, onChange }: SelectProps) {
  const id = useId()
  return (
    <div className="pgx-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// The card around every chart: title, settings, the chart itself, and the
// numbers behind it (days, values, marked days) with the small-number warning.
export default function ChartFrame({
  config,
  data,
  definition,
  definitions,
  stationList,
  globalStations,
  highlight,
  onHighlight,
  onChange,
  onChangeType,
  onOption,
  onDuplicate,
  onRemove,
  canRemove,
}: Props) {
  const [open, setOpen] = useState(false)
  const [bodyRef, width] = useElementWidth<HTMLDivElement>()
  const settingsId = useId()

  const variable: NumericVariable = config.y ?? config.x ?? 'no2'
  const basis = chartBasis(data, variable)
  const ownStations = config.stations !== null
  const weatherOnly = definition?.fields.y === true && config.y !== undefined && config.y !== 'no2'
  const typeOptions = definitions.map((d) => ({ value: d.type, label: d.label }))
  if (!definition) typeOptions.push({ value: config.type, label: config.type })
  const title = definition ? chartTitle(definition.label, config) : config.type

  return (
    <section className="pgx-chart" aria-label={title}>
      <header className="pgx-chart-head">
        <h3 className="pgx-chart-title">{title}</h3>
        <div className="pgx-chart-actions">
          <button
            type="button"
            className="pgx-btn"
            aria-expanded={open}
            aria-controls={settingsId}
            onClick={() => setOpen((value) => !value)}
          >
            {PGU.settings}
          </button>
          <button type="button" className="pgx-btn" onClick={onDuplicate}>
            {PGU.duplicate}
          </button>
          <button type="button" className="pgx-btn" onClick={onRemove} disabled={!canRemove}>
            {PGU.remove}
          </button>
        </div>
      </header>

      {open && (
        <div className="pgx-settings" id={settingsId}>
          <Select
            label={PGU.chartType}
            value={config.type}
            options={typeOptions}
            onChange={(value) => onChangeType(value as ChartType)}
          />
          {definition?.fields.y && (
            <Select
              label={PGU.variable}
              value={config.y ?? 'no2'}
              options={LINEAR_VARIABLES.map((v) => ({ value: v, label: VARIABLE_LABELS[v] }))}
              onChange={(value) => onChange({ y: value as NumericVariable })}
            />
          )}
          {definition?.fields.x && (
            <Select
              label={PGU.xVariable}
              value={config.x ?? 'no2'}
              options={LINEAR_VARIABLES.map((v) => ({ value: v, label: VARIABLE_LABELS[v] }))}
              onChange={(value) => onChange({ x: value as NumericVariable })}
            />
          )}
          {definition?.fields.group && (
            <Select
              label={PGU.groupBy}
              value={config.group ?? 'none'}
              options={GROUPINGS.map((g) => ({ value: g, label: GROUPING_LABELS[g] }))}
              onChange={(value) => onChange({ group: value as Grouping })}
            />
          )}
          {definition?.settings.map((setting) => {
            const current = config.options[setting.key] ?? setting.fallback
            return (
              <Select
                key={setting.key}
                label={setting.label}
                value={String(current)}
                options={setting.choices.map((c) => ({ value: String(c.value), label: c.label }))}
                onChange={(value) => {
                  const choice = setting.choices.find((c) => String(c.value) === value)
                  if (choice) onOption(setting.key, choice.value)
                }}
              />
            )
          })}
          <div className="pgx-field">
            <span className="pgx-field-label">{PGU.stations}</span>
            {ownStations ? (
              <div className="pgx-chips">
                {stationList.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    className="pgx-chip"
                    aria-pressed={(config.stations ?? []).includes(s.code)}
                    title={s.place}
                    onClick={() =>
                      onChange({
                        stations: toggleStation(
                          config.stations ?? globalStations,
                          s.code,
                          stationList.map((x) => x.code),
                        ),
                      })
                    }
                  >
                    {s.code}
                  </button>
                ))}
                <button type="button" className="pgx-btn" onClick={() => onChange({ stations: null })}>
                  {PGU.stationsInherit}
                </button>
              </div>
            ) : (
              <div className="pgx-chips">
                <span className="pgx-muted">
                  {PGU.stationsShared}: {data.stations.join(', ')}
                </span>
                <button type="button" className="pgx-btn" onClick={() => onChange({ stations: [...globalStations] })}>
                  {PGU.stationsOwn}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="pgx-chart-body" ref={bodyRef}>
        {!definition && <p className="tab-note">{PGU.notAvailable}</p>}
        {definition && width > 0 && (
          <definition.Component
            config={config}
            data={data}
            width={width}
            highlight={highlight}
            onHighlight={onHighlight}
          />
        )}
      </div>

      <footer className="pgx-basis">
        <span>{PGU.basisDays(basis.selectedDays)}</span>
        {basis.perStation.map((s) => (
          <span key={s.code}>{PGU.basisValues(s.code, s.values)}</span>
        ))}
        {basis.highlightedDays !== null && <span>{PGU.basisMarked(basis.highlightedDays)}</span>}
        <InfoPopover title={PGU.nInfoTitle} short={PGU.nInfoShort} more={PGU.nInfoMore} align="right" />
      </footer>
      {weatherOnly && <p className="pgx-note">{PGU.weatherSingle}</p>}
    </section>
  )
}
