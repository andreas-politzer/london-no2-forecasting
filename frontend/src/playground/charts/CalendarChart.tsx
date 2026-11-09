import { useId, useMemo, useState, type MouseEvent } from 'react'
import { dayIndex } from '../engine'
import { PGU, MONTH_SHORT, VARIABLE_LABELS, WEEKDAY_SHORT } from '../labels'
import { calendarCells, isoDay } from '../stats'
import { rampColor } from './colors'
import { clamp, formatValue } from './svg'
import type { ChartProps } from './types'

const LEFT = 28
const TOP = 22
const NEUTRAL = '#1d2a4a'

function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })
}

// One year as a calendar: a square per day, columns are weeks, rows are weekdays,
// colour is the value. Days outside the filter are grey. A click marks a day,
// shift plus click marks the period from the last clicked day.
export default function CalendarChart({ config, data, width, highlight, onHighlight }: ChartProps) {
  const y = config.y ?? 'no2'
  const { engine } = data
  const station = data.stations[0]
  const years = useMemo(() => [...new Set(engine.axis.year)].sort((a, b) => a - b), [engine])
  const lastYear = years[years.length - 1]
  const lastDayIso = isoDay(engine.input.firstDay, engine.input.days - 1)
  const defaultYear = lastDayIso.endsWith('-12-31') ? lastYear : Math.max(years[0], lastYear - 1)
  const [year, setYear] = useState<number>(defaultYear)
  const [anchor, setAnchor] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const selectId = useId()

  const cells = useMemo(
    () => calendarCells(engine.input, engine.axis, data.mask, y, station, year),
    [engine, data.mask, y, station, year],
  )

  const size = clamp((width - LEFT - 8) / 53, 8, 18)
  const gap = size > 11 ? 2 : 1
  const svgW = LEFT + size * 54
  const svgH = TOP + size * 7 + 8

  let lo = Infinity
  let hi = -Infinity
  for (const cell of cells) {
    if (cell.value === null) continue
    lo = Math.min(lo, cell.value)
    hi = Math.max(hi, cell.value)
  }
  const norm = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5)

  const own = highlight?.kind === 'period' ? highlight : null
  const ownFrom = own ? dayIndex(engine.input.firstDay, own.from) : -1
  const ownTo = own ? dayIndex(engine.input.firstDay, own.to) : -1
  const markedMask = data.highlightMask
  const monthStarts = cells.filter((c) => c.day === 1)
  const hovered = hover === null ? null : cells.find((c) => c.index === hover) ?? null

  function click(index: number, event: MouseEvent) {
    if (event.shiftKey && anchor !== null) {
      const [a, b] = anchor <= index ? [anchor, index] : [index, anchor]
      onHighlight({ kind: 'period', from: isoDay(engine.input.firstDay, a), to: isoDay(engine.input.firstDay, b) })
      return
    }
    setAnchor(index)
    const iso = isoDay(engine.input.firstDay, index)
    onHighlight(own && ownFrom === index && ownTo === index ? null : { kind: 'period', from: iso, to: iso })
  }

  const selectedValues = cells.filter((c) => c.value !== null).length

  return (
    <div className="pgx-plot">
      <div className="pgx-caption">
        {PGU.calTitle} · {VARIABLE_LABELS[y]}
      </div>
      <div className="pgx-field pgx-inline">
        <label htmlFor={selectId}>{PGU.calYear}</label>
        <select id={selectId} value={year} onChange={(event) => setYear(Number(event.target.value))}>
          {years.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <div className="pgx-scrollx">
        <svg width={svgW} height={svgH} role="img" aria-label={`${PGU.calTitle} ${year}: ${VARIABLE_LABELS[y]}`}>
          {WEEKDAY_SHORT.map((name, row) =>
            row % 2 === 0 ? (
              <text key={name} className="pgx-tick" x={LEFT - 6} y={TOP + size * (row + 0.5)} dy="0.32em" textAnchor="end">
                {name}
              </text>
            ) : null,
          )}
          {monthStarts.map((c) => (
            <text key={c.month} className="pgx-tick" x={LEFT + size * c.col} y={TOP - 8}>
              {MONTH_SHORT[c.month - 1]}
            </text>
          ))}
          {cells.map((c) => {
            const fill = c.value === null ? (c.selected ? '#ffffff' : '#f0efec') : rampColor(norm(c.value))
            const inOwn = own !== null && c.index >= ownFrom && c.index <= ownTo
            return (
              <g key={c.index}>
                <rect
                  className="pgx-day"
                  x={LEFT + size * c.col + gap / 2}
                  y={TOP + size * c.weekday + gap / 2}
                  width={size - gap}
                  height={size - gap}
                  rx={2}
                  fill={fill}
                  stroke={inOwn ? NEUTRAL : c.selected && c.value === null ? '#cbd5e1' : 'none'}
                  strokeWidth={inOwn ? 2 : 1}
                  onPointerEnter={() => setHover(c.index)}
                  onPointerLeave={() => setHover(null)}
                  onClick={(event) => click(c.index, event)}
                />
                {markedMask && markedMask[c.index] && (
                  <circle cx={LEFT + size * (c.col + 0.5)} cy={TOP + size * (c.weekday + 0.5)} r={Math.max(1.5, size * 0.18)} fill={NEUTRAL} pointerEvents="none" />
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {hovered && (
        <div className="pgx-tip" style={{ left: clamp(LEFT + size * (hovered.col + 0.5), 124, Math.max(124, width - 124)), top: TOP + 40 }} role="status">
          <strong>
            {WEEKDAY_SHORT[hovered.weekday]}, {dateLabel(hovered.date)}
          </strong>
          <div>{!hovered.selected ? PGU.calOutside : hovered.value === null ? PGU.distNoValues : formatValue(hovered.value)}</div>
        </div>
      )}

      {hi > lo && (
        <div className="pgx-legend" aria-hidden="true">
          <span>{formatValue(lo)}</span>
          <span className="pgx-ramp" style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})` }} />
          <span>{formatValue(hi)}</span>
        </div>
      )}

      <p className="pgx-muted pgx-small">
        {PGU.calHint} {PGU.singleStation(station)} {PGU.calMarked}
      </p>

      <table className="pgx-sr">
        <caption>
          {PGU.calTitle} {year}: {VARIABLE_LABELS[y]}
        </caption>
        <tbody>
          <tr>
            <th scope="row">Tage mit Wert</th>
            <td>{selectedValues}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
