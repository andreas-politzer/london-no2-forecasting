import { useId, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { groupStats, type GroupStat } from '../engine'
import { GROUPING_LABELS, PGU, VARIABLE_LABELS, groupLabel } from '../labels'
import type { Grouping, NumericVariable } from '../state'
import { seriesColor } from './colors'
import { toggleGroupHighlight } from './highlight'
import {
  bandScale,
  clamp,
  formatValue,
  linearScale,
  niceDomain,
  niceTicks,
  roundedTopBar,
} from './svg'
import type { ChartProps } from './types'

const MARGIN = { top: 12, right: 12, bottom: 44, left: 52 }
const NEUTRAL = '#1d2a4a'
const MAX_BAR = 56

// Mean or median per group, one bar per station. Small groups get hatched bars
// (a warning, never hidden). Clicking a group marks its days in all charts;
// days marked elsewhere show up as a dark tick on each bar.
export default function BarsChart({ config, data, width, highlight, onHighlight }: ChartProps) {
  const y: NumericVariable = config.y ?? 'no2'
  const grouping: Grouping = config.group ?? 'windClass'
  const stat = config.options.stat === 'median' ? 'median' : 'mean'
  const patternBase = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)

  const { engine } = data
  const isNo2 = y === 'no2'
  const stations = isNo2 ? data.stations : data.stations.slice(0, 1)
  if (stations.length === 0) return null

  const compute = (mask: boolean[]): GroupStat[][] =>
    stations.map((code) => groupStats(engine.input, engine.axis, mask, grouping, y, code))
  const cells = compute(data.mask)
  const ownHighlight = highlight?.kind === 'groups' && highlight.grouping === grouping
  const marks = data.highlightMask && !ownHighlight ? compute(data.highlightMask) : null
  const keys = cells[0].map((cell) => cell.key)
  const markedKeys = ownHighlight ? highlight.keys : []

  const height = Math.round(clamp(width * 0.55, 230, 340))
  const plotW = Math.max(40, width - MARGIN.left - MARGIN.right)
  const plotH = height - MARGIN.top - MARGIN.bottom

  const values: number[] = []
  for (const list of [...cells, ...(marks ?? [])]) {
    for (const cell of list) {
      const value = cell[stat]
      if (value !== null) values.push(value)
    }
  }
  const [d0, d1] =
    values.length === 0
      ? [0, 1]
      : niceDomain(Math.min(0, ...values), Math.max(0, ...values))
  const scaleY = linearScale(d0, d1, MARGIN.top + plotH, MARGIN.top)
  const baseY = scaleY(0)
  const band = bandScale(keys.length, MARGIN.left, MARGIN.left + plotW, 0.25)
  const slot = Math.min(band.width / stations.length, MAX_BAR)
  const groupWidth = slot * stations.length
  const gap = stations.length > 1 ? 2 : 0
  const ticks = niceTicks(d0, d1, 5)

  const longest = Math.max(...keys.map((key) => groupLabel(grouping, key).length))
  const every = Math.max(1, Math.ceil((longest * 6.4 + 8) / band.step))

  const colorOf = (code: string) => (isNo2 ? seriesColor(data.allStations.indexOf(code)) : NEUTRAL)

  function toggle(key: string, additive: boolean) {
    onHighlight(toggleGroupHighlight(highlight, grouping, key, additive))
  }
  function onClick(key: string, event: MouseEvent) {
    toggle(key, event.shiftKey || event.metaKey || event.ctrlKey)
  }
  function onKey(key: string, event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle(key, event.shiftKey)
    }
  }

  const statLabel = stat === 'median' ? PGU.statMedian : PGU.statMean
  const tipLeft = hover === null ? 0 : clamp(band.start(hover) + band.width / 2, 96, Math.max(96, width - 96))

  return (
    <div className="pgx-plot">
      <div className="pgx-caption">
        {statLabel} · {VARIABLE_LABELS[y]}
      </div>
      {stations.length > 1 && (
        <ul className="pgx-legend" aria-label={PGU.stations}>
          {stations.map((code) => (
            <li key={code}>
              <span className="pgx-swatch" style={{ background: colorOf(code) }} />
              {code}
            </li>
          ))}
        </ul>
      )}
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Balkendiagramm: ${VARIABLE_LABELS[y]} nach ${GROUPING_LABELS[grouping]}`}
      >
        <defs>
          {stations.map((code, si) => (
            <pattern
              key={code}
              id={`${patternBase}-${si}`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="#ffffff" />
              <rect width="3" height="6" fill={colorOf(code)} />
            </pattern>
          ))}
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line className="pgx-grid" x1={MARGIN.left} x2={MARGIN.left + plotW} y1={scaleY(tick)} y2={scaleY(tick)} />
            <text className="pgx-tick" x={MARGIN.left - 8} y={scaleY(tick)} dy="0.32em" textAnchor="end">
              {formatValue(tick)}
            </text>
          </g>
        ))}
        <line className="pgx-axis" x1={MARGIN.left} x2={MARGIN.left + plotW} y1={baseY} y2={baseY} />

        {keys.map((key, gi) => {
          const slotStart = band.start(gi) + (band.width - groupWidth) / 2
          const marked = markedKeys.includes(key)
          const label = groupLabel(grouping, key)
          return (
            <g key={key}>
              {marked && (
                <rect
                  className="pgx-marked"
                  x={band.start(gi) - (band.step - band.width) / 2}
                  y={MARGIN.top}
                  width={band.step}
                  height={plotH}
                />
              )}
              {stations.map((code, si) => {
                const cell = cells[si][gi]
                const value = cell[stat]
                if (value === null) return null
                const x = slotStart + si * slot
                const w = slot - gap
                const top = Math.min(scaleY(value), baseY)
                const barHeight = Math.abs(scaleY(value) - baseY)
                const fill = cell.low ? `url(#${patternBase}-${si})` : colorOf(code)
                return value >= 0 ? (
                  <path
                    key={code}
                    d={roundedTopBar(x, top, w, barHeight)}
                    fill={fill}
                    stroke={cell.low ? colorOf(code) : 'none'}
                    strokeWidth={1.5}
                  />
                ) : (
                  <rect
                    key={code}
                    x={x}
                    y={top}
                    width={w}
                    height={barHeight}
                    fill={fill}
                    stroke={cell.low ? colorOf(code) : 'none'}
                    strokeWidth={1.5}
                  />
                )
              })}
              {marks &&
                stations.map((code, si) => {
                  const mark = marks[si][gi]
                  const value = mark[stat]
                  if (value === null || mark.n === 0) return null
                  const x = slotStart + si * slot
                  return (
                    <line
                      key={code}
                      className="pgx-marker"
                      x1={x}
                      x2={x + slot - gap}
                      y1={scaleY(value)}
                      y2={scaleY(value)}
                    />
                  )
                })}
              {gi % every === 0 && (
                <text className="pgx-tick" x={band.start(gi) + band.width / 2} y={MARGIN.top + plotH + 18} textAnchor="middle">
                  {label}
                </text>
              )}
              <rect
                className="pgx-hit"
                x={band.start(gi) - (band.step - band.width) / 2}
                y={MARGIN.top}
                width={band.step}
                height={plotH + MARGIN.bottom - 6}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-pressed={marked}
                aria-label={`${label}: ${cells
                  .map((list, si) => `${stations[si]} ${list[gi][stat] === null ? 'keine Werte' : formatValue(list[gi][stat] as number)}, n = ${list[gi].n}`)
                  .join('; ')}`}
                onPointerEnter={() => setHover(gi)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(gi)}
                onBlur={() => setHover(null)}
                onClick={(event) => onClick(key, event)}
                onKeyDown={(event) => onKey(key, event)}
              />
            </g>
          )
        })}
      </svg>

      {hover !== null && (
        <div className="pgx-tip" style={{ left: tipLeft, top: MARGIN.top + 28 }} role="status">
          <strong>{groupLabel(grouping, keys[hover])}</strong>
          {stations.map((code, si) => {
            const cell = cells[si][hover]
            const value = cell[stat]
            const mark = marks?.[si][hover]
            return (
              <div key={code}>
                {isNo2 ? `${code}: ` : ''}
                {value === null ? 'keine Werte' : formatValue(value)} · n = {cell.n.toLocaleString('de-DE')}
                {cell.low && <span className="pgx-small"> ({PGU.smallWarning})</span>}
                {mark && mark.n > 0 && mark[stat] !== null && (
                  <div className="pgx-tip-mark">
                    {PGU.highlightTitle}: {formatValue(mark[stat] as number)} · n = {mark.n.toLocaleString('de-DE')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <table className="pgx-sr">
        <caption>
          {statLabel}, {VARIABLE_LABELS[y]}, nach {GROUPING_LABELS[grouping]}
        </caption>
        <thead>
          <tr>
            <th scope="col">{GROUPING_LABELS[grouping]}</th>
            {stations.map((code) => (
              <th key={code} scope="col">
                {isNo2 ? code : statLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((key, gi) => (
            <tr key={key}>
              <th scope="row">{groupLabel(grouping, key)}</th>
              {stations.map((code, si) => {
                const cell = cells[si][gi]
                const value = cell[stat]
                return (
                  <td key={code}>
                    {value === null ? 'keine Werte' : formatValue(value)} (n = {cell.n})
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
