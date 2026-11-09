import { NUMERIC_VARIABLES, type DaySelection, type HolidayMode, type NumericVariable } from '../state'
import { isLinearVariable } from '../stats'
import {
  MONTH_SHORT,
  PGU,
  SECTOR_SHORT,
  VARIABLE_LABELS,
  WEEKDAY_SHORT,
} from '../labels'
import {
  addRange,
  removeRange,
  setPeriodBound,
  setRangeBound,
  toggleInList,
} from './filterLogic'

type Props = {
  selection: DaySelection
  limits: { first: string; last: string }
  selectedDays: number
  totalDays: number
  onChange: (selection: DaySelection) => void
  onReset: () => void
}

type ChipsProps = {
  legend: string
  labels: string[]
  first: number
  list: number[] | null
  onChange: (list: number[] | null) => void
}

// Chips for a list filter. With nothing chosen (null) every chip is shown as
// included, in a softer colour.
function Chips({ legend, labels, first, list, onChange }: ChipsProps) {
  const universe = labels.map((_, i) => first + i)
  return (
    <fieldset className="pgx-fieldset">
      <legend>{legend}</legend>
      <div className="pgx-chips">
        {labels.map((label, i) => {
          const value = first + i
          const on = list === null || list.includes(value)
          return (
            <button
              key={value}
              type="button"
              className={`pgx-chip${list === null ? ' pgx-chip-soft' : ''}`}
              aria-pressed={on}
              onClick={() => onChange(toggleInList(list, value, universe))}
            >
              {label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

const formatBound = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

// The day filter: period, months, weekdays, holidays, Corona, ULEZ, wind
// direction and value ranges. All conditions are combined with "and".
export default function FilterPanel({
  selection,
  limits,
  selectedDays,
  totalDays,
  onChange,
  onReset,
}: Props) {
  const free = NUMERIC_VARIABLES.filter(
    (variable) => isLinearVariable(variable) && !selection.ranges[variable],
  )
  const ranges = Object.entries(selection.ranges) as [NumericVariable, [number | null, number | null]][]

  return (
    <aside className="pgx-filter" aria-label={PGU.filterTitle}>
      <h3 className="block-title">{PGU.filterTitle}</h3>
      <p className="pgx-muted">{PGU.filterIntro}</p>
      <p className={`pgx-count${selectedDays === 0 ? ' pgx-count-empty' : ''}`} role="status">
        {selectedDays === 0 ? PGU.noDays : PGU.daysSelected(selectedDays, totalDays)}
      </p>

      <fieldset className="pgx-fieldset">
        <legend>{PGU.period}</legend>
        <div className="pgx-dates">
          <label>
            <span>{PGU.from}</span>
            <input
              type="date"
              value={selection.period[0]}
              min={limits.first}
              max={limits.last}
              onChange={(event) => onChange(setPeriodBound(selection, 0, event.target.value, limits))}
            />
          </label>
          <label>
            <span>{PGU.to}</span>
            <input
              type="date"
              value={selection.period[1]}
              min={limits.first}
              max={limits.last}
              onChange={(event) => onChange(setPeriodBound(selection, 1, event.target.value, limits))}
            />
          </label>
        </div>
      </fieldset>

      <Chips
        legend={PGU.months}
        labels={MONTH_SHORT}
        first={1}
        list={selection.months}
        onChange={(months) => onChange({ ...selection, months })}
      />
      <Chips
        legend={PGU.weekdays}
        labels={WEEKDAY_SHORT}
        first={0}
        list={selection.weekdays}
        onChange={(weekdays) => onChange({ ...selection, weekdays })}
      />

      <fieldset className="pgx-fieldset">
        <legend>{PGU.holidays}</legend>
        <select
          aria-label={PGU.holidays}
          value={selection.holiday}
          onChange={(event) => onChange({ ...selection, holiday: event.target.value as HolidayMode })}
        >
          {(Object.keys(PGU.holidayModes) as HolidayMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {PGU.holidayModes[mode]}
            </option>
          ))}
        </select>
      </fieldset>

      <Chips
        legend={PGU.corona}
        labels={PGU.coronaChips}
        first={0}
        list={selection.corona}
        onChange={(corona) => onChange({ ...selection, corona })}
      />
      <Chips
        legend={PGU.ulez}
        labels={PGU.ulezChips}
        first={0}
        list={selection.ulez}
        onChange={(ulez) => onChange({ ...selection, ulez })}
      />
      <Chips
        legend={PGU.sectors}
        labels={SECTOR_SHORT}
        first={0}
        list={selection.windSectors}
        onChange={(windSectors) => onChange({ ...selection, windSectors })}
      />
      <p className="pgx-muted pgx-small-note">{PGU.chipHint}</p>

      <fieldset className="pgx-fieldset">
        <legend>{PGU.ranges}</legend>
        {ranges.map(([variable, range]) => (
          <div className="pgx-range" key={variable}>
            <span className="pgx-range-name">{VARIABLE_LABELS[variable]}</span>
            <div className="pgx-range-inputs">
              {([0, 1] as const).map((side) => (
                <label key={side}>
                  <span>{side === 0 ? PGU.rangeFrom : PGU.rangeTo}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    defaultValue={formatBound(range[side])}
                    key={`${variable}-${side}-${range[side]}`}
                    onBlur={(event) => onChange(setRangeBound(selection, variable, side, event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                    }}
                  />
                </label>
              ))}
              <button
                type="button"
                className="pgx-btn"
                aria-label={`${PGU.rangeRemove}: ${VARIABLE_LABELS[variable]}`}
                onClick={() => onChange(removeRange(selection, variable))}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        {free.length > 0 && (
          <select
            aria-label={PGU.rangeAdd}
            value=""
            onChange={(event) => {
              if (event.target.value) onChange(addRange(selection, event.target.value as NumericVariable))
            }}
          >
            <option value="">+ {PGU.rangeAdd}</option>
            {free.map((variable) => (
              <option key={variable} value={variable}>
                {VARIABLE_LABELS[variable]}
              </option>
            ))}
          </select>
        )}
      </fieldset>

      <button type="button" className="pgx-btn" onClick={onReset}>
        {PGU.reset}
      </button>
    </aside>
  )
}
