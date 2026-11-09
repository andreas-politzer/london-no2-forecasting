import { useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { GROUPING_LABELS, PGU, VARIABLE_LABELS, groupLabel } from '../labels'
import type { Grouping, NumericVariable } from '../state'
import { boxStats, kdeProfiles, type BoxStats } from '../stats'
import { cellValues } from './boxData'
import { seriesColor } from './colors'
import { toggleGroupHighlight } from './highlight'
import { bandScale, clamp, formatValue, linearScale, niceDomain, niceTicks } from './svg'
import type { ChartProps } from './types'

const MARGIN = { top: 12, right: 12, bottom: 44, left: 52 }
const NEUTRAL = '#1d2a4a'
const MAX_SLOT = 64

// Box plot or violin per group, one per station. Whiskers reach the last value
// within 1.5 times the box height, further values are drawn as dots. Small
// groups are drawn dashed. A click marks the group in all charts.
export default function BoxChart({ config, data, width, highlight, onHighlight }: ChartProps) {
  const y: NumericVariable = config.y ?? 'no2'
  const grouping: Grouping = config.group ?? 'windClass'
  const violin = config.options.form === 'violin'
  const [hover, setHover] = useState<number | null>(null)
  const { engine } = data
  const isNo2 = y === 'no2'
  const stations = isNo2 ? data.stations : data.stations.slice(0, 1)
  const minDays = engine.input.thresholds.min_days_per_group
  const baseId = useId()

  const ownHighlight = highlight?.kind === 'groups' && highlight.grouping === grouping
  const cells = useMemo(
    () => stations.map((code) => cellValues(engine, data.mask, y, grouping, code)),
    [engine, data.mask, y, grouping, stations],
  )
  const marks = useMemo(
    () =>
      data.highlightMask && !ownHighlight
        ? stations.map((code) => cellValues(engine, data.highlightMask as boolean[], y, grouping, code))
        : null,
    [engine, data.highlightMask, ownHighlight, y, grouping, stations],
  )
  const keys = cells[0]?.keys ?? []
  const boxes = useMemo(() => cells.map((c) => c.values.map((v) => boxStats(v))), [cells])
  const kde = useMemo(
    () => (violin ? kdeProfiles(cells.flatMap((c) => c.values), { points: 64 }) : null),
    [violin, cells],
  )
  const markMedians = useMemo(
    () => marks?.map((c) => c.values.map((v) => boxStats(v)?.median ?? null)) ?? null,
    [marks],
  )

  if (stations.length === 0 || keys.length === 0) return null

  const height = Math.round(clamp(width * 0.6, 250, 360))
  const plotW = Math.max(40, width - MARGIN.left - MARGIN.right)
  const plotH = height - MARGIN.top - MARGIN.bottom
  const lows: number[] = []
  const highs: number[] = []
  for (const list of boxes) {
    for (const box of list) {
      if (!box) continue
      lows.push(Math.min(box.min, box.whiskerLow))
      highs.push(Math.max(box.max, box.whiskerHigh))
    }
  }
  if (kde) {
    lows.push(kde.grid[0])
    highs.push(kde.grid[kde.grid.length - 1])
  }
  const [d0, d1] = lows.length === 0 ? [0, 1] : niceDomain(Math.min(0, ...lows), Math.max(...highs))
  const scaleY = linearScale(d0, d1, MARGIN.top + plotH, MARGIN.top)
  const band = bandScale(keys.length, MARGIN.left, MARGIN.left + plotW, 0.2)
  const slot = Math.min(band.width / stations.length, MAX_SLOT)
  const groupWidth = slot * stations.length
  const ticks = niceTicks(d0, d1, 5)
  const longest = Math.max(...keys.map((k) => groupLabel(grouping, k).length))
  const every = Math.max(1, Math.ceil((longest * 6.4 + 8) / band.step))
  const colorOf = (code: string) => (isNo2 ? seriesColor(data.allStations.indexOf(code)) : NEUTRAL)
  const peak = kde ? Math.max(...kde.curves.flatMap((c) => c ?? [0])) : 1
  const markedKeys = ownHighlight ? highlight.keys : []

  function toggle(key: string, additive: boolean) {
    onHighlight(toggleGroupHighlight(highlight, grouping, key, additive))
  }
  const onClick = (key: string, event: MouseEvent) => toggle(key, event.shiftKey || event.metaKey || event.ctrlKey)
  const onKey = (key: string, event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle(key, event.shiftKey)
    }
  }

  const describe = (box: BoxStats | null) =>
    box === null
      ? PGU.distNoValues
      : `n = ${box.n.toLocaleString('de-DE')}, Median ${formatValue(box.median)}, Box ${formatValue(box.q1)} bis ${formatValue(box.q3)}`

  const tipLeft = hover === null ? 0 : clamp(band.start(hover) + band.width / 2, 124, Math.max(124, width - 124))

  return (
    <div className="pgx-plot">
      <div className="pgx-caption">
        {violin ? PGU.boxViolin : PGU.boxBox} · {VARIABLE_LABELS[y]}
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
      <svg width={width} height={height} role="img" aria-label={`${violin ? PGU.boxViolin : PGU.boxBox}: ${VARIABLE_LABELS[y]} nach ${GROUPING_LABELS[grouping]}`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="pgx-grid" x1={MARGIN.left} x2={MARGIN.left + plotW} y1={scaleY(tick)} y2={scaleY(tick)} />
            <text className="pgx-tick" x={MARGIN.left - 8} y={scaleY(tick)} dy="0.32em" textAnchor="end">
              {formatValue(tick)}
            </text>
          </g>
        ))}
        {keys.map((key, gi) => {
          const slotStart = band.start(gi) + (band.width - groupWidth) / 2
          const marked = markedKeys.includes(key)
          const label = groupLabel(grouping, key)
          return (
            <g key={key}>
              {marked && (
                <rect className="pgx-marked" x={band.start(gi) - (band.step - band.width) / 2} y={MARGIN.top} width={band.step} height={plotH} />
              )}
              {stations.map((code, si) => {
                const box = boxes[si][gi]
                const values = cells[si].values[gi]
                if (!box) return null
                const cx = slotStart + si * slot + slot / 2
                const color = colorOf(code)
                const low = values.length < minDays
                const w = slot * 0.7
                if (violin && kde) {
                  const curve = kde.curves[si * keys.length + gi]
                  if (!curve) return null
                  const half = slot * 0.45
                  const right = curve.map((d, k) => `${k === 0 ? 'M' : 'L'}${(cx + (d / peak) * half).toFixed(1)} ${scaleY(kde.grid[k]).toFixed(1)}`).join('')
                  const back = [...curve].reverse().map((d, k) => `L${(cx - (d / peak) * half).toFixed(1)} ${scaleY(kde.grid[curve.length - 1 - k]).toFixed(1)}`).join('')
                  return (
                    <g key={code}>
                      <path d={`${right}${back}Z`} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={1.5} strokeDasharray={low ? '3 2' : undefined} />
                      <line x1={cx - w / 2} x2={cx + w / 2} y1={scaleY(box.median)} y2={scaleY(box.median)} stroke={NEUTRAL} strokeWidth={2} />
                    </g>
                  )
                }
                return (
                  <g key={code}>
                    <line x1={cx} x2={cx} y1={scaleY(box.whiskerHigh)} y2={scaleY(box.q3)} stroke={color} strokeWidth={1.5} />
                    <line x1={cx} x2={cx} y1={scaleY(box.q1)} y2={scaleY(box.whiskerLow)} stroke={color} strokeWidth={1.5} />
                    <line x1={cx - w / 4} x2={cx + w / 4} y1={scaleY(box.whiskerHigh)} y2={scaleY(box.whiskerHigh)} stroke={color} strokeWidth={1.5} />
                    <line x1={cx - w / 4} x2={cx + w / 4} y1={scaleY(box.whiskerLow)} y2={scaleY(box.whiskerLow)} stroke={color} strokeWidth={1.5} />
                    <rect
                      x={cx - w / 2}
                      y={scaleY(box.q3)}
                      width={w}
                      height={Math.max(1, scaleY(box.q1) - scaleY(box.q3))}
                      fill={color}
                      fillOpacity={0.3}
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray={low ? '3 2' : undefined}
                    />
                    <line x1={cx - w / 2} x2={cx + w / 2} y1={scaleY(box.median)} y2={scaleY(box.median)} stroke={color} strokeWidth={2.5} />
                    {box.outliers.map((v, k) => (
                      <circle key={`${baseId}-${k}`} cx={cx} cy={scaleY(v)} r={1.8} fill={color} fillOpacity={0.5} />
                    ))}
                  </g>
                )
              })}
              {markMedians &&
                stations.map((code, si) => {
                  const m = markMedians[si][gi]
                  if (m === null) return null
                  const cx = slotStart + si * slot + slot / 2
                  return <line key={code} className="pgx-marker" x1={cx - slot * 0.4} x2={cx + slot * 0.4} y1={scaleY(m)} y2={scaleY(m)} />
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
                aria-label={`${label}: ${stations.map((code, si) => `${code} ${describe(boxes[si][gi])}`).join('; ')}`}
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
            const box = boxes[si][hover]
            const n = cells[si].values[hover].length
            return (
              <div key={code}>
                {isNo2 ? `${code}: ` : ''}
                {box === null ? PGU.distNoValues : `Median ${formatValue(box.median)} · Box ${formatValue(box.q1)} bis ${formatValue(box.q3)}`} · n = {n.toLocaleString('de-DE')}
                {n < minDays && <span className="pgx-small"> ({PGU.smallWarning})</span>}
              </div>
            )
          })}
        </div>
      )}

      <p className="pgx-muted pgx-small">{violin ? PGU.boxHintViolin : PGU.boxHint}</p>

      <table className="pgx-sr">
        <caption>
          {PGU.boxBox}, {VARIABLE_LABELS[y]}, nach {GROUPING_LABELS[grouping]}
        </caption>
        <thead>
          <tr>
            <th scope="col">{GROUPING_LABELS[grouping]}</th>
            {stations.map((code) => (
              <th key={code} scope="col">
                {isNo2 ? code : PGU.boxBox}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((key, gi) => (
            <tr key={key}>
              <th scope="row">{groupLabel(grouping, key)}</th>
              {stations.map((code, si) => (
                <td key={code}>{describe(boxes[si][gi])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
