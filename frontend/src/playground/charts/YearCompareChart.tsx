import { useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { PGU, MONTH_SHORT, VARIABLE_LABELS } from '../labels'
import { MIN_CELL_DAYS, monthlyByYear } from '../stats'
import { rampColor, textOn } from './colors'
import { toggleGroupHighlight } from './highlight'
import { clamp, formatValue, linePath, linearScale, niceDomain, niceTicks } from './svg'
import type { ChartProps } from './types'

const LABEL_W = 44
const HEAD_H = 26

// Mean per month for every year: as a table of coloured cells (default) or as
// one line per year (older years light, newer years dark). Months with fewer
// than ten values are hatched or drawn as open dots. Clicking a month or a year
// heading marks those days in all charts.
export default function YearCompareChart({ config, data, width, highlight, onHighlight }: ChartProps) {
  const y = config.y ?? 'no2'
  const lines = config.options.form === 'lines'
  const { engine } = data
  const station = data.stations[0]
  const patternId = useId().replace(/:/g, '')
  const [hover, setHover] = useState<[number, number] | null>(null)

  const table = useMemo(
    () => monthlyByYear(engine.input, engine.axis, data.mask, y, station),
    [engine, data.mask, y, station],
  )
  const { years, cells } = table

  let lo = Infinity
  let hi = -Infinity
  for (const row of cells) for (const cell of row) {
    if (cell.mean === null) continue
    lo = Math.min(lo, cell.mean)
    hi = Math.max(hi, cell.mean)
  }
  const norm = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5)
  const markedMonths = highlight?.kind === 'groups' && highlight.grouping === 'month' ? highlight.keys : []
  const markedYears = highlight?.kind === 'groups' && highlight.grouping === 'year' ? highlight.keys : []

  const toggle = (grouping: 'month' | 'year', key: string, additive: boolean) =>
    onHighlight(toggleGroupHighlight(highlight, grouping, key, additive))
  const heading = (grouping: 'month' | 'year', key: string) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: (event: MouseEvent) => toggle(grouping, key, event.shiftKey || event.metaKey || event.ctrlKey),
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggle(grouping, key, event.shiftKey)
      }
    },
  })

  const title = `${lines ? PGU.yearLines : PGU.yearGrid} · Ø ${VARIABLE_LABELS[y]} je Monat`

  if (lines) {
    const height = Math.round(clamp(width * 0.55, 240, 340))
    const left = 52
    const right = Math.max(left + 40, width - 12)
    const plotH = height - 12 - 34
    const [d0, d1] = hi > lo || hi === lo ? niceDomain(Math.min(0, lo), hi) : [0, 1]
    const sx = linearScale(0, 11, left + 16, right - 16)
    const sy = linearScale(d0, d1, 12 + plotH, 12)
    return (
      <div className="pgx-plot">
        <div className="pgx-caption">{title}</div>
        <div className="pgx-legend" aria-hidden="true">
          <span>{years[0]}</span>
          <span className="pgx-ramp" style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})` }} />
          <span>{years[years.length - 1]}</span>
        </div>
        <svg width={width} height={height} role="img" aria-label={title}>
          {niceTicks(d0, d1, 5).map((tick) => (
            <g key={tick}>
              <line className="pgx-grid" x1={left} x2={right} y1={sy(tick)} y2={sy(tick)} />
              <text className="pgx-tick" x={left - 8} y={sy(tick)} dy="0.32em" textAnchor="end">
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {MONTH_SHORT.map((name, m) => (
            <text key={name} className={`pgx-tick pgx-heading${markedMonths.includes(String(m + 1)) ? ' pgx-heading-on' : ''}`} x={sx(m)} y={12 + plotH + 20} textAnchor="middle" {...heading('month', String(m + 1))}>
              {name}
            </text>
          ))}
          {years.map((year, yi) => {
            const color = rampColor(years.length > 1 ? yi / (years.length - 1) : 1)
            return (
              <g key={year}>
                <path d={linePath(cells[yi].map((c, m) => ({ x: sx(m), y: c.mean === null ? null : sy(c.mean) })))} fill="none" stroke={color} strokeWidth={markedYears.includes(String(year)) ? 3 : 1.5} />
                {cells[yi].map((c, m) =>
                  c.mean !== null && c.low ? <circle key={m} cx={sx(m)} cy={sy(c.mean)} r={3} fill="#ffffff" stroke={color} strokeWidth={1.5} /> : null,
                )}
              </g>
            )
          })}
        </svg>
        <p className="pgx-muted pgx-small">
          {PGU.yearLinesNote(MIN_CELL_DAYS)} {PGU.singleStation(station)}
        </p>
        <YearTable years={years} cells={cells} />
      </div>
    )
  }

  const cellW = clamp((width - LABEL_W - 8) / 12, 22, 64)
  const cellH = 22
  const svgW = LABEL_W + cellW * 12 + 8
  const svgH = HEAD_H + cellH * years.length + 6
  const tip = hover ? cells[hover[0]][hover[1]] : null
  const tipLeft = hover ? clamp(LABEL_W + cellW * (hover[1] + 0.5), 124, Math.max(124, width - 124)) : 0

  return (
    <div className="pgx-plot">
      <div className="pgx-caption">{title}</div>
      <div className="pgx-scrollx">
        <svg width={svgW} height={svgH} role="img" aria-label={title}>
          <defs>
            <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2" height="6" fill="#ffffff" fillOpacity={0.55} />
            </pattern>
          </defs>
          {MONTH_SHORT.map((name, m) => (
            <text key={name} className={`pgx-tick pgx-heading${markedMonths.includes(String(m + 1)) ? ' pgx-heading-on' : ''}`} x={LABEL_W + cellW * (m + 0.5)} y={HEAD_H - 8} textAnchor="middle" {...heading('month', String(m + 1))}>
              {name}
            </text>
          ))}
          {years.map((year, yi) => (
            <g key={year}>
              <text className={`pgx-tick pgx-heading${markedYears.includes(String(year)) ? ' pgx-heading-on' : ''}`} x={LABEL_W - 8} y={HEAD_H + cellH * (yi + 0.5)} dy="0.32em" textAnchor="end" {...heading('year', String(year))}>
                {year}
              </text>
              {cells[yi].map((cell, m) => {
                const fill = cell.mean === null ? '#f0efec' : rampColor(norm(cell.mean))
                const x = LABEL_W + cellW * m
                const yy = HEAD_H + cellH * yi
                return (
                  <g key={m} onPointerEnter={() => setHover([yi, m])} onPointerLeave={() => setHover(null)}>
                    <rect x={x + 1} y={yy + 1} width={cellW - 2} height={cellH - 2} rx={3} fill={fill} />
                    {cell.low && cell.mean !== null && <rect x={x + 1} y={yy + 1} width={cellW - 2} height={cellH - 2} rx={3} fill={`url(#${patternId})`} />}
                    {cellW >= 30 && cell.mean !== null && (
                      <text x={x + cellW / 2} y={yy + cellH / 2} dy="0.32em" textAnchor="middle" fontSize={10} fill={textOn(fill)}>
                        {formatValue(cell.mean)}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
      </div>

      {tip && hover && (
        <div className="pgx-tip" style={{ left: tipLeft, top: HEAD_H + 10 }} role="status">
          <strong>
            {MONTH_SHORT[tip.month - 1]} {tip.year}
          </strong>
          <div>
            {tip.mean === null ? PGU.distNoValues : `Ø ${formatValue(tip.mean)}`} · n = {tip.n.toLocaleString('de-DE')}
            {tip.low && <span className="pgx-small"> ({PGU.smallWarning})</span>}
          </div>
        </div>
      )}

      <p className="pgx-muted pgx-small">
        {PGU.yearGridNote(MIN_CELL_DAYS)} {PGU.singleStation(station)}
      </p>
      <YearTable years={years} cells={cells} />
    </div>
  )
}

function YearTable({ years, cells }: { years: number[]; cells: ReturnType<typeof monthlyByYear>['cells'] }) {
  return (
    <table className="pgx-sr">
      <caption>{PGU.yearGrid}</caption>
      <thead>
        <tr>
          <th scope="col">Jahr</th>
          {MONTH_SHORT.map((m) => (
            <th key={m} scope="col">
              {m}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {years.map((year, yi) => (
          <tr key={year}>
            <th scope="row">{year}</th>
            {cells[yi].map((c, m) => (
              <td key={m}>{c.mean === null ? '–' : `${formatValue(c.mean)} (n = ${c.n})`}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
