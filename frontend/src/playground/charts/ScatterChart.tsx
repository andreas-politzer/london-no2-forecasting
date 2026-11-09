import { useMemo } from 'react'
import { PGU, VARIABLE_LABELS } from '../labels'
import type { NumericVariable } from '../state'
import { hexbin } from '../stats'
import { rampColor, seriesColor, textOn } from './colors'
import { roundBound } from './distributionData'
import { dotsPath, scatterSeries } from './scatterData'
import { clamp, formatNumber, formatValue, linearInvert, linearScale, niceDomain, niceTicks } from './svg'
import type { ChartProps } from './types'
import { useBrush2D } from './useBrush2D'

const MARGIN = { top: 12, right: 12, bottom: 44, left: 52 }
const NEUTRAL = '#1d2a4a'

// Every selected day as a dot (x against y), or as hexagons coloured by the
// number of days. The line is an ordinary least-squares fit with its R². Drag
// marks a rectangle (a value range on both axes).
export default function ScatterChart({ config, data, width, highlight, onHighlight }: ChartProps) {
  const x: NumericVariable = config.x ?? 'temperature_2m_mean'
  const y: NumericVariable = config.y ?? 'no2'
  const hex = config.options.form === 'hexbin'
  const { engine } = data
  const usesNo2 = x === 'no2' || y === 'no2'

  const series = useMemo(
    () => scatterSeries(engine, data.mask, x, y, data.stations),
    [engine, data.mask, x, y, data.stations],
  )

  const height = Math.round(clamp(width * 0.65, 260, 380))
  const left = MARGIN.left
  const right = Math.max(left + 40, width - MARGIN.right)
  const top = MARGIN.top
  const bottom = height - MARGIN.bottom
  const plotW = right - left
  const plotH = bottom - top

  const domains = useMemo(() => {
    const range = (pick: (s: (typeof series)[number]) => number[]): [number, number] => {
      let min = Infinity
      let max = -Infinity
      for (const s of series) for (const v of pick(s)) {
        if (v < min) min = v
        if (v > max) max = v
      }
      return min === Infinity ? [0, 1] : niceDomain(min, max)
    }
    return { x: range((s) => s.pairs.x), y: range((s) => s.pairs.y) }
  }, [series])

  const scaleX = linearScale(domains.x[0], domains.x[1], left, right)
  const scaleY = linearScale(domains.y[0], domains.y[1], bottom, top)
  const invertX = linearInvert(domains.x[0], domains.x[1], left, right)
  const invertY = linearInvert(domains.y[0], domains.y[1], bottom, top)

  const dots = useMemo(
    () =>
      series.map((s) => ({
        main: dotsPath(s.pairs.x.map((v, i) => [scaleX(v), scaleY(s.pairs.y[i])] as [number, number])),
        marked: data.highlightMask
          ? dotsPath(
              s.pairs.index.flatMap((day, i) =>
                (data.highlightMask as boolean[])[day] ? [[scaleX(s.pairs.x[i]), scaleY(s.pairs.y[i])] as [number, number]] : [],
              ),
            )
          : '',
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, data.highlightMask, domains, left, right, top, bottom],
  )

  const radius = Math.max(7, plotW / 28)
  const bins = useMemo(() => {
    if (!hex || series.length === 0) return []
    const s = series[0]
    return hexbin(s.pairs.x.map((v, i) => [scaleX(v) - left, scaleY(s.pairs.y[i]) - top] as [number, number]), radius)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex, series, domains, left, right, top, bottom, radius])
  const maxCount = bins.reduce((m, b) => Math.max(m, b.count), 1)

  const own =
    highlight?.kind === 'ranges' && Object.keys(highlight.ranges).length === 2 && highlight.ranges[x] && highlight.ranges[y]
      ? highlight.ranges
      : null

  const { drag, handlers } = useBrush2D({
    plot: { left, right, top, bottom },
    onBrush: (x0, x1, y0, y1) =>
      onHighlight({
        kind: 'ranges',
        ranges: {
          [x]: [roundBound(invertX(x0)), roundBound(invertX(x1))],
          [y]: [roundBound(invertY(y1)), roundBound(invertY(y0))],
        },
      }),
    onClick: () => {
      if (own) onHighlight(null)
    },
  })

  if (series.length === 0) return null

  const colorOf = (code: string) => (usesNo2 ? seriesColor(data.allStations.indexOf(code)) : NEUTRAL)
  const xTicks = niceTicks(domains.x[0], domains.x[1], Math.max(3, Math.floor(plotW / 70)))
  const yTicks = niceTicks(domains.y[0], domains.y[1], 5)
  const ownBand = own
    ? (() => {
        const rx = own[x] as [number | null, number | null]
        const ry = own[y] as [number | null, number | null]
        const xa = scaleX(clamp(rx[0] ?? domains.x[0], domains.x[0], domains.x[1]))
        const xb = scaleX(clamp(rx[1] ?? domains.x[1], domains.x[0], domains.x[1]))
        const ya = scaleY(clamp(ry[1] ?? domains.y[1], domains.y[0], domains.y[1]))
        const yb = scaleY(clamp(ry[0] ?? domains.y[0], domains.y[0], domains.y[1]))
        return { x: xa, y: ya, w: Math.max(1, xb - xa), h: Math.max(1, yb - ya) }
      })()
    : null
  const dragBand = drag ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) } : null
  const fitText = (s: (typeof series)[number]) =>
    s.fit
      ? `R² = ${s.fit.r2 === null ? '–' : formatNumber(s.fit.r2, 2)} · n = ${s.fit.n.toLocaleString('de-DE')}`
      : `n = ${s.pairs.x.length.toLocaleString('de-DE')}`
  const hexPath = (cx: number, cy: number) =>
    Array.from({ length: 6 }, (_, k) => {
      const angle = (Math.PI / 180) * (60 * k - 30)
      return `${k === 0 ? 'M' : 'L'}${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`
    }).join('') + 'Z'
  const clipId = `clip-${Math.abs(Math.round(plotW * 7 + plotH))}`

  return (
    <div className="pgx-plot">
      <div className="pgx-caption">
        {VARIABLE_LABELS[y]} · {PGU.scatterAgainst} {VARIABLE_LABELS[x]}
      </div>
      <ul className="pgx-legend" aria-label={PGU.stations}>
        {series.map((s) => (
          <li key={s.code}>
            <span className="pgx-swatch" style={{ background: colorOf(s.code) }} />
            {usesNo2 ? `${s.code}: ` : ''}
            {fitText(s)}
          </li>
        ))}
      </ul>
      <svg width={width} height={height} role="img" aria-label={`${PGU.scatterTitle}: ${VARIABLE_LABELS[y]} gegen ${VARIABLE_LABELS[x]}`}>
        <defs>
          <clipPath id={clipId}>
            <rect x={left} y={top} width={plotW} height={plotH} />
          </clipPath>
        </defs>
        {yTicks.map((tick) => (
          <g key={`y${tick}`}>
            <line className="pgx-grid" x1={left} x2={right} y1={scaleY(tick)} y2={scaleY(tick)} />
            <text className="pgx-tick" x={left - 8} y={scaleY(tick)} dy="0.32em" textAnchor="end">
              {formatValue(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={`x${tick}`} className="pgx-tick" x={scaleX(tick)} y={bottom + 18} textAnchor="middle">
            {formatValue(tick)}
          </text>
        ))}
        <line className="pgx-axis" x1={left} x2={right} y1={bottom} y2={bottom} />
        <line className="pgx-axis" x1={left} x2={left} y1={top} y2={bottom} />
        <text className="pgx-tick" x={(left + right) / 2} y={height - 6} textAnchor="middle">
          {VARIABLE_LABELS[x]}
        </text>

        {ownBand && <rect className="pgx-marked" x={ownBand.x} y={ownBand.y} width={ownBand.w} height={ownBand.h} />}
        <g clipPath={`url(#${clipId})`}>
          {hex
            ? bins.map((b) => {
                const fill = rampColor(Math.sqrt(b.count / maxCount))
                return <path key={`${b.q},${b.r}`} d={hexPath(left + b.cx, top + b.cy)} fill={fill} stroke="#ffffff" strokeWidth={0.5} />
              })
            : series.map((s, i) => (
                <path key={s.code} d={dots[i].main} stroke={colorOf(s.code)} strokeOpacity={0.4} strokeWidth={3.5} strokeLinecap="round" fill="none" />
              ))}
          {!hex &&
            dots.map((d, i) =>
              d.marked ? <path key={`m${series[i].code}`} d={d.marked} stroke={NEUTRAL} strokeOpacity={0.9} strokeWidth={3.5} strokeLinecap="round" fill="none" /> : null,
            )}
          {(hex ? series.slice(0, 1) : series).map((s) => {
            if (!s.fit) return null
            const xs = s.pairs.x
            const lo = Math.min(...xs)
            const hi = Math.max(...xs)
            const f = s.fit
            return (
              <line
                key={`fit${s.code}`}
                x1={scaleX(lo)}
                x2={scaleX(hi)}
                y1={scaleY(f.intercept + f.slope * lo)}
                y2={scaleY(f.intercept + f.slope * hi)}
                stroke={hex ? NEUTRAL : colorOf(s.code)}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            )
          })}
        </g>
        {dragBand && <rect className="pgx-brushband" x={dragBand.x} y={dragBand.y} width={dragBand.w} height={dragBand.h} />}
        <rect className="pgx-brush" x={left} y={top} width={plotW} height={plotH} fill="transparent" {...handlers} />
      </svg>

      {hex && (
        <div className="pgx-legend" aria-hidden="true">
          <span>{PGU.scatterFewDays}</span>
          <span className="pgx-ramp" style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})` }} />
          <span style={{ color: textOn('#ffffff') }}>{PGU.scatterManyDays(maxCount)}</span>
        </div>
      )}

      <p className="pgx-muted pgx-small">
        {PGU.scatterHint}
        {hex && series.length > 1 && ` ${PGU.singleStation(series[0].code)}`}
        {usesNo2 && data.stations.length > 1 && ` ${PGU.scatterRangeNote}`}
      </p>

      <table className="pgx-sr">
        <caption>
          {PGU.scatterTitle}: {VARIABLE_LABELS[y]} gegen {VARIABLE_LABELS[x]}
        </caption>
        <thead>
          <tr>
            <th scope="col">Station</th>
            <th scope="col">Tage</th>
            <th scope="col">Steigung</th>
            <th scope="col">R²</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.code}>
              <th scope="row">{usesNo2 ? s.code : PGU.scatterAll}</th>
              <td>{s.pairs.x.length}</td>
              <td>{s.fit ? formatNumber(s.fit.slope, 3) : '–'}</td>
              <td>{s.fit?.r2 == null ? '–' : formatNumber(s.fit.r2, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
