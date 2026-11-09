import { useMemo, useState, type KeyboardEvent } from 'react'
import { dayIndex } from '../engine'
import { PGU, VARIABLE_LABELS } from '../labels'
import { isoDay } from '../stats'
import { seriesColor } from './colors'
import { clamp, formatValue, linePath, linearInvert, linearScale, niceDomain, niceTicks } from './svg'
import { markedRuns, timelineSeries, toWindow, yearlyMeans } from './timelineData'
import type { ChartProps } from './types'
import { useBrush } from './useBrush'

const MARGIN = { top: 12, right: 12, bottom: 38, left: 52 }
const STRIP = 5
const NEUTRAL = '#1d2a4a'

function dateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })
}

// Values over the whole period, one line per station. Days outside the filter
// are gaps. Drag marks a period (shown in all charts); marked days from other
// charts appear as a dark strip at the bottom.
export default function TimelineChart({ config, data, width, highlight, onHighlight }: ChartProps) {
  const y = config.y ?? 'no2'
  const win = toWindow(config.options.window)
  const { engine } = data
  const { firstDay, days } = engine.input
  const isNo2 = y === 'no2'
  const [hover, setHover] = useState<number | null>(null)
  const [anchor, setAnchor] = useState<number | null>(null)

  const series = useMemo(
    () => timelineSeries(engine, y, win, data.mask, data.stations),
    [engine, y, win, data.mask, data.stations],
  )
  const yearly = useMemo(
    () => series.map((s) => yearlyMeans(engine.axis.year, s.raw)),
    [series, engine],
  )
  const runs = useMemo(() => (data.highlightMask ? markedRuns(data.highlightMask) : []), [data.highlightMask])

  const height = Math.round(clamp(width * 0.5, 220, 320))
  const left = MARGIN.left
  const right = Math.max(left + 40, width - MARGIN.right)
  const plotH = height - MARGIN.top - MARGIN.bottom
  const baseY = MARGIN.top + plotH

  const domain = useMemo<[number, number]>(() => {
    let min = Infinity
    let max = -Infinity
    for (const s of series) {
      for (const v of s.smooth) {
        if (v === null) continue
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    if (min === Infinity) return [0, 1]
    return niceDomain(min >= 0 ? 0 : min, max)
  }, [series])

  const paths = useMemo(() => {
    const sx = linearScale(0, Math.max(1, days - 1), left, right)
    const sy = linearScale(domain[0], domain[1], baseY, MARGIN.top)
    return series.map((s) => linePath(s.smooth.map((v, i) => ({ x: sx(i), y: v === null ? null : sy(v) }))))
  }, [series, days, left, right, domain, baseY])

  const scaleX = linearScale(0, Math.max(1, days - 1), left, right)
  const invertX = linearInvert(0, Math.max(1, days - 1), left, right)
  const scaleY = linearScale(domain[0], domain[1], baseY, MARGIN.top)
  const indexAt = (pixel: number) => clamp(Math.round(invertX(pixel)), 0, days - 1)

  function commit(a: number, b: number) {
    const [from, to] = a <= b ? [a, b] : [b, a]
    onHighlight({ kind: 'period', from: isoDay(firstDay, from), to: isoDay(firstDay, to) })
  }

  const { drag, handlers } = useBrush({
    left,
    right,
    onBrush: (from, to) => commit(indexAt(from), indexAt(to)),
    onClick: () => {
      if (highlight?.kind === 'period') onHighlight(null)
    },
    onMove: (pixel) => setHover(pixel === null ? null : indexAt(pixel)),
  })

  function onKey(event: KeyboardEvent<SVGRectElement>) {
    const jump = event.shiftKey ? 30 : 1
    const at = hover ?? Math.floor(days / 2)
    if (event.key === 'ArrowRight') setHover(clamp(at + jump, 0, days - 1))
    else if (event.key === 'ArrowLeft') setHover(clamp(at - jump, 0, days - 1))
    else if (event.key === 'Home') setHover(0)
    else if (event.key === 'End') setHover(days - 1)
    else if (event.key === 'Enter') {
      if (anchor === null) setAnchor(at)
      else {
        commit(anchor, at)
        setAnchor(null)
      }
    } else if (event.key === 'Escape' && anchor !== null) {
      event.stopPropagation()
      setAnchor(null)
    } else return
    event.preventDefault()
  }

  if (series.length === 0) return null

  const ticks = niceTicks(domain[0], domain[1], 5)
  const firstYear = engine.axis.year[0]
  const lastYear = engine.axis.year[days - 1]
  const yearCount = lastYear - firstYear + 1
  const yearStep = Math.max(1, Math.ceil(yearCount / Math.max(1, Math.floor((right - left) / 44))))
  const yearTicks: { year: number; x: number }[] = []
  for (let year = firstYear; year <= lastYear; year += 1) {
    const index = dayIndex(firstDay, `${year}-01-01`)
    if (index >= 0 && index < days && (year - firstYear) % yearStep === 0) {
      yearTicks.push({ year, x: scaleX(index) })
    }
  }

  const own = highlight?.kind === 'period' ? highlight : null
  const bandOf = (a: number, b: number) => ({ x: scaleX(Math.min(a, b)), w: Math.max(1, Math.abs(scaleX(b) - scaleX(a))) })
  const ownBand = own ? bandOf(dayIndex(firstDay, own.from), dayIndex(firstDay, own.to)) : null
  const anchorBand = anchor !== null && hover !== null ? bandOf(anchor, hover) : null
  const dragBand = drag ? { x: Math.min(drag[0], drag[1]), w: Math.abs(drag[1] - drag[0]) } : null

  const stripPath = runs
    .map(([a, b]) => {
      const x0 = scaleX(a) - 0.5
      return `M${x0.toFixed(1)} ${baseY + 3}h${Math.max(1, scaleX(b) - scaleX(a) + 1).toFixed(1)}v${STRIP}h-${Math.max(1, scaleX(b) - scaleX(a) + 1).toFixed(1)}z`
    })
    .join('')

  const colorOf = (code: string) => (isNo2 ? seriesColor(data.allStations.indexOf(code)) : NEUTRAL)
  const tipLeft = hover === null ? 0 : clamp(scaleX(hover), 124, Math.max(124, width - 124))
  const caption = `${VARIABLE_LABELS[y]} · ${win === 1 ? PGU.timelineDaily : PGU.timelineSmoothed(win)}`

  return (
    <div className="pgx-plot">
      <div className="pgx-caption">{caption}</div>
      {series.length > 1 && (
        <ul className="pgx-legend" aria-label={PGU.stations}>
          {series.map((s) => (
            <li key={s.code}>
              <span className="pgx-swatch" style={{ background: colorOf(s.code) }} />
              {s.code}
            </li>
          ))}
        </ul>
      )}
      <svg width={width} height={height} role="img" aria-label={`Zeitverlauf: ${VARIABLE_LABELS[y]}`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="pgx-grid" x1={left} x2={right} y1={scaleY(tick)} y2={scaleY(tick)} />
            <text className="pgx-tick" x={left - 8} y={scaleY(tick)} dy="0.32em" textAnchor="end">
              {formatValue(tick)}
            </text>
          </g>
        ))}
        <line className="pgx-axis" x1={left} x2={right} y1={baseY} y2={baseY} />
        {yearTicks.map((tick) => (
          <g key={tick.year}>
            <line className="pgx-axis" x1={tick.x} x2={tick.x} y1={baseY} y2={baseY + 4} />
            <text className="pgx-tick" x={tick.x} y={baseY + STRIP + 22} textAnchor="middle">
              {tick.year}
            </text>
          </g>
        ))}

        {ownBand && <rect className="pgx-marked" x={ownBand.x} y={MARGIN.top} width={ownBand.w} height={plotH} />}
        {anchorBand && <rect className="pgx-brushband" x={anchorBand.x} y={MARGIN.top} width={anchorBand.w} height={plotH} />}
        {dragBand && <rect className="pgx-brushband" x={dragBand.x} y={MARGIN.top} width={dragBand.w} height={plotH} />}

        {series.map((s, i) => (
          <path key={s.code} d={paths[i]} fill="none" stroke={colorOf(s.code)} strokeWidth={win === 1 ? 1 : 1.75} strokeLinejoin="round" />
        ))}
        {stripPath && <path className="pgx-strip" d={stripPath} />}

        {hover !== null && (
          <g pointerEvents="none">
            <line className="pgx-cross" x1={scaleX(hover)} x2={scaleX(hover)} y1={MARGIN.top} y2={baseY} />
            {series.map((s) => {
              const v = s.smooth[hover]
              return v === null ? null : (
                <circle key={s.code} cx={scaleX(hover)} cy={scaleY(v)} r={3.5} fill={colorOf(s.code)} stroke="#ffffff" strokeWidth={2} />
              )
            })}
          </g>
        )}

        <rect
          className="pgx-brush"
          x={left}
          y={MARGIN.top}
          width={right - left}
          height={plotH + STRIP + 4}
          fill="transparent"
          tabIndex={0}
          role="group"
          aria-label={`${PGU.timelineHint}`}
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
          <strong>{dateLabel(isoDay(firstDay, hover))}</strong>
          {series.map((s) => {
            const smooth = s.smooth[hover]
            const raw = s.raw[hover]
            return (
              <div key={s.code}>
                {isNo2 ? `${s.code}: ` : ''}
                {smooth === null && raw === null
                  ? PGU.timelineOutside
                  : win === 1
                    ? formatValue(raw as number)
                    : `${smooth === null ? PGU.timelineOutside : `${PGU.timelineAverage(win)}: ${formatValue(smooth)}`}${raw === null ? '' : ` · ${PGU.timelineDay}: ${formatValue(raw)}`}`}
              </div>
            )
          })}
        </div>
      )}

      <p className="pgx-muted pgx-small">
        {anchor !== null ? PGU.timelineAnchor : PGU.timelineHint} {PGU.timelineGaps}
        {runs.length > 0 && ` ${PGU.timelineMarkedStrip}`}
      </p>

      <table className="pgx-sr">
        <caption>
          {VARIABLE_LABELS[y]}: {PGU.timelineYearly}
        </caption>
        <thead>
          <tr>
            <th scope="col">Jahr</th>
            {series.map((s) => (
              <th key={s.code} scope="col">
                {isNo2 ? s.code : PGU.timelineYearly}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {yearly[0].map((row, r) => (
            <tr key={row.year}>
              <th scope="row">{row.year}</th>
              {yearly.map((list, i) => (
                <td key={series[i].code}>{list[r].mean === null ? 'keine Werte' : `${formatValue(list[r].mean)} (n = ${list[r].n})`}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
