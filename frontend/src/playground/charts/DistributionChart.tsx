import { useMemo, useState, type KeyboardEvent } from 'react'
import { PGU, VARIABLE_LABELS, GROUPING_LABELS } from '../labels'
import type { Grouping } from '../state'
import {
  NEUTRAL,
  distributionSeries,
  distributionShape,
  overlayOnShape,
  roundBound,
  type DistMode,
  type DistShape,
} from './distributionData'
import { MAX_SERIES } from './colors'
import { clamp, formatValue, linePath, linearInvert, linearScale, niceDomain, niceTicks } from './svg'
import type { ChartProps } from './types'
import { useBrush } from './useBrush'

const MARGIN = { top: 24, right: 12, bottom: 34, left: 52 }
const BANDWIDTH = { narrow: 0.5, normal: 1, wide: 2 } as const

// Share of days (histogram) or density (curve) of one variable. One series per
// station, or per group when a grouping is chosen. Drag marks a value range.
export default function DistributionChart({ config, data, width, highlight, onHighlight }: ChartProps) {
  const y = config.y ?? 'no2'
  const grouping: Grouping = config.group ?? 'none'
  const mode: DistMode = config.options.mode === 'density' ? 'density' : 'histogram'
  const bins = typeof config.options.bins === 'number' ? config.options.bins : undefined
  const factor = typeof config.options.bandwidth === 'number' ? config.options.bandwidth : BANDWIDTH.normal
  const { engine } = data
  const [hover, setHover] = useState<number | null>(null)
  const [anchor, setAnchor] = useState<number | null>(null)

  const own = highlight?.kind === 'ranges' && Object.keys(highlight.ranges).length === 1 && highlight.ranges[y] ? highlight.ranges[y] ?? null : null

  const built = useMemo(
    () => distributionSeries(engine, data.mask, y, grouping, data.stations, data.allStations),
    [engine, data.mask, y, grouping, data.stations, data.allStations],
  )
  const marksBuilt = useMemo(
    () =>
      data.highlightMask && !own
        ? distributionSeries(engine, data.highlightMask, y, grouping, data.stations, data.allStations)
        : null,
    [engine, data.highlightMask, own, y, grouping, data.stations, data.allStations],
  )
  const shape = useMemo<DistShape | null>(
    () => distributionShape(built.series.map((s) => s.values), mode, bins, factor),
    [built, mode, bins, factor],
  )
  const overlay = useMemo<DistShape | null>(
    () => (shape && marksBuilt ? overlayOnShape(shape, marksBuilt.series.map((s) => s.values)) : null),
    [shape, marksBuilt],
  )

  const height = Math.round(clamp(width * 0.5, 220, 320))
  const left = MARGIN.left
  const right = Math.max(left + 40, width - MARGIN.right)
  const plotH = height - MARGIN.top - MARGIN.bottom
  const baseY = MARGIN.top + plotH

  // x domain and the discrete steps used for hovering and the keyboard
  const x0 = shape ? (shape.kind === 'histogram' ? shape.edges[0] : shape.grid[0]) : 0
  const x1 = shape ? (shape.kind === 'histogram' ? shape.edges[shape.edges.length - 1] : shape.grid[shape.grid.length - 1]) : 1
  const steps = shape ? (shape.kind === 'histogram' ? shape.bars[0]?.length ?? 0 : shape.grid.length) : 0
  const scaleX = linearScale(x0, x1, left, right)
  const invertX = linearInvert(x0, x1, left, right)

  const stepOf = (pixel: number): number => {
    if (!shape || steps === 0) return 0
    const value = invertX(pixel)
    if (shape.kind === 'histogram') {
      const k = shape.edges.length - 1
      return clamp(Math.floor(((value - x0) / (x1 - x0 || 1)) * k), 0, k - 1)
    }
    return clamp(Math.round(((value - x0) / (x1 - x0 || 1)) * (steps - 1)), 0, steps - 1)
  }
  const stepFrom = (step: number): number => (shape ? (shape.kind === 'histogram' ? shape.edges[step] : shape.grid[step]) : 0)
  const stepTo = (step: number): number => (shape ? (shape.kind === 'histogram' ? shape.edges[step + 1] : shape.grid[step]) : 0)
  const stepCenter = (step: number): number => (stepFrom(step) + stepTo(step)) / 2

  function commitValues(lo: number, hi: number) {
    onHighlight({ kind: 'ranges', ranges: { [y]: [roundBound(lo), roundBound(hi)] } })
  }

  const { drag, handlers } = useBrush({
    left,
    right,
    onBrush: (a, b) => commitValues(invertX(a), invertX(b)),
    onClick: () => {
      if (own) onHighlight(null)
    },
    onMove: (pixel) => setHover(pixel === null ? null : stepOf(pixel)),
  })

  function onKey(event: KeyboardEvent<SVGRectElement>) {
    if (steps === 0) return
    const at = hover ?? Math.floor(steps / 2)
    const jump = event.shiftKey ? 5 : 1
    if (event.key === 'ArrowRight') setHover(clamp(at + jump, 0, steps - 1))
    else if (event.key === 'ArrowLeft') setHover(clamp(at - jump, 0, steps - 1))
    else if (event.key === 'Home') setHover(0)
    else if (event.key === 'End') setHover(steps - 1)
    else if (event.key === 'Enter') {
      if (anchor === null) setAnchor(at)
      else {
        const [a, b] = anchor <= at ? [anchor, at] : [at, anchor]
        commitValues(stepFrom(a), stepTo(b))
        setAnchor(null)
      }
    } else if (event.key === 'Escape' && anchor !== null) {
      event.stopPropagation()
      setAnchor(null)
    } else return
    event.preventDefault()
  }

  const axisLabel = mode === 'histogram' ? PGU.distAxisShare : PGU.distAxisDensity
  const caption = `${VARIABLE_LABELS[y]} · ${mode === 'histogram' ? PGU.distHistogram : PGU.distDensity}`

  if (!shape) {
    return (
      <div className="pgx-plot">
        <div className="pgx-caption">{caption}</div>
        <p className="pgx-note">{built.tooMany ? PGU.tooManyGroups(MAX_SERIES) : PGU.distNone}</p>
      </div>
    )
  }

  // heights in percent: share of days per class, or density times 100
  const heightsOf = (s: DistShape, index: number): number[] | null => {
    if (s.kind === 'histogram') return built.series[index].values.length === 0 ? null : s.bars[index].map((bar) => bar.share * 100)
    const curve = s.curves[index]
    return curve ? curve.map((v) => v * 100) : null
  }
  const mainHeights = built.series.map((_, i) => heightsOf(shape, i))
  const markHeights = overlay ? built.series.map((_, i) => heightsOf(overlay, i)) : null
  let top = 0
  for (const list of [...mainHeights, ...(markHeights ?? [])]) {
    if (list) for (const v of list) if (v > top) top = v
  }
  const [, d1] = niceDomain(0, top > 0 ? top : 1)
  const scaleY = linearScale(0, d1, baseY, MARGIN.top)
  const ticks = niceTicks(0, d1, 5)
  const xTicks = niceTicks(x0, x1, Math.max(3, Math.floor((right - left) / 70)))

  // outline of a series, closed down to the baseline
  const shapePath = (heights: number[], close: boolean): string => {
    if (shape.kind === 'histogram') {
      let d = ''
      heights.forEach((h, i) => {
        const xa = scaleX(shape.edges[i])
        const xb = scaleX(shape.edges[i + 1])
        d += `${i === 0 ? `M${xa.toFixed(1)} ${baseY}` : ''}L${xa.toFixed(1)} ${scaleY(h).toFixed(1)}L${xb.toFixed(1)} ${scaleY(h).toFixed(1)}`
      })
      const end = scaleX(shape.edges[shape.edges.length - 1])
      return close ? `${d}L${end.toFixed(1)} ${baseY}Z` : d.replace(/^M[^L]*/, 'M' + scaleX(shape.edges[0]).toFixed(1) + ' ' + scaleY(heights[0]).toFixed(1))
    }
    const line = linePath(heights.map((h, i) => ({ x: scaleX(shape.grid[i]), y: scaleY(h) })))
    return close ? `${line}L${right} ${baseY}L${left} ${baseY}Z` : line
  }

  const ownBand = own
    ? { x: scaleX(clamp(own[0] ?? x0, x0, x1)), w: Math.max(1, scaleX(clamp(own[1] ?? x1, x0, x1)) - scaleX(clamp(own[0] ?? x0, x0, x1))) }
    : null
  const dragBand = drag ? { x: Math.min(drag[0], drag[1]), w: Math.abs(drag[1] - drag[0]) } : null
  const anchorBand =
    anchor !== null && hover !== null
      ? { x: scaleX(stepFrom(Math.min(anchor, hover))), w: Math.max(1, scaleX(stepTo(Math.max(anchor, hover))) - scaleX(stepFrom(Math.min(anchor, hover)))) }
      : null

  const legend = built.series.length > 1 || markHeights !== null
  const tipLeft = hover === null ? 0 : clamp(scaleX(stepCenter(hover)), 124, Math.max(124, width - 124))
  const fmt = (v: number) => formatValue(roundBound(v))

  return (
    <div className="pgx-plot">
      <div className="pgx-caption">{caption}</div>
      {legend && (
        <ul className="pgx-legend" aria-label={PGU.stations}>
          {built.series.map((s) => (
            <li key={s.key}>
              <span className="pgx-swatch" style={{ background: s.color }} />
              {s.label}
              <span className="pgx-muted">
                {' '}
                {s.values.length === 0
                  ? `(${PGU.distNoValues})`
                  : `(n = ${s.values.length.toLocaleString('de-DE')}${s.low ? `, ${PGU.smallWarning}` : ''})`}
              </span>
            </li>
          ))}
          {markHeights && (
            <li>
              <span className="pgx-swatch" style={{ background: NEUTRAL }} />
              {PGU.distMarkedSeries}
            </li>
          )}
        </ul>
      )}
      <svg width={width} height={height} role="img" aria-label={`${caption}${grouping === 'none' ? '' : `, nach ${GROUPING_LABELS[grouping]}`}`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="pgx-grid" x1={left} x2={right} y1={scaleY(tick)} y2={scaleY(tick)} />
            <text className="pgx-tick" x={left - 8} y={scaleY(tick)} dy="0.32em" textAnchor="end">
              {formatValue(tick)}
            </text>
          </g>
        ))}
        <line className="pgx-axis" x1={left} x2={right} y1={baseY} y2={baseY} />
        {xTicks.map((tick) => (
          <text key={tick} className="pgx-tick" x={scaleX(tick)} y={baseY + 18} textAnchor="middle">
            {formatValue(tick)}
          </text>
        ))}
        <text className="pgx-tick" x={left} y={12} textAnchor="start">
          {axisLabel}
        </text>

        {ownBand && <rect className="pgx-marked" x={ownBand.x} y={MARGIN.top} width={ownBand.w} height={plotH} />}
        {anchorBand && <rect className="pgx-brushband" x={anchorBand.x} y={MARGIN.top} width={anchorBand.w} height={plotH} />}
        {dragBand && <rect className="pgx-brushband" x={dragBand.x} y={MARGIN.top} width={dragBand.w} height={plotH} />}

        {built.series.map((s, i) => {
          const heights = mainHeights[i]
          if (!heights) return null
          return (
            <g key={s.key}>
              <path d={shapePath(heights, true)} fill={s.color} fillOpacity={built.series.length > 1 ? 0.16 : 0.4} stroke="none" />
              <path d={shapePath(heights, false)} fill="none" stroke={s.color} strokeWidth={1.75} strokeDasharray={s.low ? '2 2' : undefined} strokeLinejoin="round" />
            </g>
          )
        })}
        {markHeights &&
          markHeights.map((heights, i) =>
            heights ? (
              <path key={built.series[i].key} d={shapePath(heights, false)} fill="none" stroke={NEUTRAL} strokeWidth={1.5} strokeDasharray="6 3" strokeLinejoin="round" />
            ) : null,
          )}

        {hover !== null && (
          <line className="pgx-cross" x1={scaleX(stepCenter(hover))} x2={scaleX(stepCenter(hover))} y1={MARGIN.top} y2={baseY} pointerEvents="none" />
        )}

        <rect
          className="pgx-brush"
          x={left}
          y={MARGIN.top}
          width={right - left}
          height={plotH + 8}
          fill="transparent"
          tabIndex={0}
          role="group"
          aria-label={PGU.distHint}
          onKeyDown={onKey}
          onBlur={() => {
            setHover(null)
            setAnchor(null)
          }}
          {...handlers}
        />
      </svg>

      {hover !== null && (
        <div className="pgx-tip" style={{ left: tipLeft, top: MARGIN.top + 28 }} role="status">
          <strong>{shape.kind === 'histogram' ? PGU.distBin(fmt(stepFrom(hover)), fmt(stepTo(hover))) : fmt(stepCenter(hover))}</strong>
          {built.series.map((s, i) => {
            const heights = mainHeights[i]
            if (!heights) return null
            const count = shape.kind === 'histogram' ? shape.bars[i][hover].count : null
            return (
              <div key={s.key}>
                {s.label}: {formatValue(heights[hover])} %{count !== null && ` · ${count.toLocaleString('de-DE')} Tage`}
              </div>
            )
          })}
        </div>
      )}

      <p className="pgx-muted pgx-small">
        {anchor !== null ? PGU.timelineAnchor : PGU.distHint}
        {built.station && ` ${PGU.distFirstStation(built.station)}`}
      </p>

      <table className="pgx-sr">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Reihe</th>
            <th scope="col">Tage mit Wert</th>
          </tr>
        </thead>
        <tbody>
          {built.series.map((s) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td>{s.values.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
