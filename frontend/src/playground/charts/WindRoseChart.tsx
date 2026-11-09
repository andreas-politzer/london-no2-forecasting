import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { PGU, SECTOR_SHORT, VARIABLE_LABELS } from '../labels'
import { windRose } from '../stats'
import { SEQUENTIAL } from './colors'
import { toggleGroupHighlight } from './highlight'
import { clamp, formatNumber, formatValue } from './svg'
import type { ChartProps } from './types'

const NEUTRAL = '#1d2a4a'
const SPEED_COLORS = [SEQUENTIAL[2], SEQUENTIAL[6], SEQUENTIAL[11]] as const

// Pie-slice path of one sector between two radii; angle 0 is north, clockwise.
function sectorPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const point = (r: number, a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]
  const [x0, y0] = point(r1, a0)
  const [x1, y1] = point(r1, a1)
  if (r0 <= 0) return `M${cx} ${cy}L${x0.toFixed(1)} ${y0.toFixed(1)}A${r1} ${r1} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}Z`
  const [x2, y2] = point(r0, a1)
  const [x3, y3] = point(r0, a0)
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r1} ${r1} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}A${r0} ${r0} 0 0 0 ${x3.toFixed(1)} ${y3.toFixed(1)}Z`
}

// Wind rose: how often the wind comes from each of eight directions (stacked by
// speed), or the mean NO2 on days with that direction. A click on a slice marks
// its days in all charts.
export default function WindRoseChart({ config, data, width, highlight, onHighlight }: ChartProps) {
  const showNo2 = config.options.show === 'no2'
  const { engine } = data
  const station = data.stations[0]
  const [hover, setHover] = useState<number | null>(null)

  const rose = useMemo(
    () => windRose(engine.input, engine.axis, data.mask, station),
    [engine, data.mask, station],
  )
  const roseMarked = useMemo(
    () => (data.highlightMask ? windRose(engine.input, engine.axis, data.highlightMask, station) : null),
    [engine, data.highlightMask, station],
  )

  const size = Math.round(clamp(width, 240, 380))
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 34
  const own = highlight?.kind === 'groups' && highlight.grouping === 'windSector' ? highlight.keys : []

  const share = (days: number) => (rose.total > 0 ? (days / rose.total) * 100 : 0)
  const markedShare = (days: number) => (roseMarked && roseMarked.total > 0 ? (days / roseMarked.total) * 100 : 0)
  const values = rose.sectors.map((s) => (showNo2 ? (s.no2.mean ?? 0) : share(s.days)))
  const markValues = roseMarked ? roseMarked.sectors.map((s) => (showNo2 ? (s.no2.mean ?? 0) : markedShare(s.days))) : null
  const top = Math.max(1e-9, ...values, ...(markValues ?? []))
  const rings = [0.25, 0.5, 0.75, 1]
  const scaleR = (value: number) => (value / top) * radius

  function toggle(sector: number, additive: boolean) {
    onHighlight(toggleGroupHighlight(highlight, 'windSector', String(sector), additive))
  }

  return (
    <div className="pgx-plot">
      <div className="pgx-caption">{showNo2 ? `${PGU.roseNo2} · ${VARIABLE_LABELS.no2}` : PGU.roseDays}</div>
      {!showNo2 && (
        <ul className="pgx-legend" aria-label={PGU.roseSpeed}>
          {PGU.roseSpeedNames.map((name, i) => (
            <li key={name}>
              <span className="pgx-swatch" style={{ background: SPEED_COLORS[i] }} />
              {name}
            </li>
          ))}
        </ul>
      )}
      <svg width={size} height={size} role="img" aria-label={PGU.roseTitle}>
        {rings.map((ring) => (
          <g key={ring}>
            <circle cx={cx} cy={cy} r={radius * ring} className="pgx-ring" />
            <text className="pgx-tick" x={cx + 3} y={cy - radius * ring - 2}>
              {formatNumber(top * ring, top >= 10 ? 0 : 1)}
              {showNo2 ? '' : ' %'}
            </text>
          </g>
        ))}
        {rose.sectors.map((sector, s) => {
          const a0 = ((s - 0.5) * Math.PI) / 4 + 0.02
          const a1 = ((s + 0.5) * Math.PI) / 4 - 0.02
          let inner = 0
          const slices = showNo2
            ? [{ from: 0, to: values[s], color: SEQUENTIAL[7] }]
            : sector.speedDays.map((days, k) => {
                const from = inner
                inner += share(days)
                return { from, to: inner, color: SPEED_COLORS[k] }
              })
          return (
            <g key={sector.name}>
              {own.includes(String(s)) && <path className="pgx-marked" d={sectorPath(cx, cy, 0, radius + 4, a0 - 0.02, a1 + 0.02)} />}
              {slices.map((slice, k) =>
                slice.to > slice.from ? <path key={k} d={sectorPath(cx, cy, scaleR(slice.from), scaleR(slice.to), a0, a1)} fill={slice.color} stroke="#ffffff" strokeWidth={1} /> : null,
              )}
              {markValues && markValues[s] > 0 && (
                <path d={sectorPath(cx, cy, scaleR(markValues[s]) - 1.5, scaleR(markValues[s]) + 1.5, a0, a1)} fill={NEUTRAL} />
              )}
              <text className="pgx-tick pgx-heading" x={cx + (radius + 18) * Math.sin(s * Math.PI / 4)} y={cy - (radius + 18) * Math.cos(s * Math.PI / 4)} dy="0.32em" textAnchor="middle">
                {SECTOR_SHORT[s]}
              </text>
              <path
                className="pgx-hit"
                d={sectorPath(cx, cy, 0, radius + 4, a0, a1)}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-pressed={own.includes(String(s))}
                aria-label={`${SECTOR_SHORT[s]}: ${sector.days} Tage, ${formatShareLabel(share(sector.days))}`}
                onPointerEnter={() => setHover(s)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(s)}
                onBlur={() => setHover(null)}
                onClick={(event: MouseEvent) => toggle(s, event.shiftKey || event.metaKey || event.ctrlKey)}
                onKeyDown={(event: KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggle(s, event.shiftKey)
                  }
                }}
              />
            </g>
          )
        })}
      </svg>

      {hover !== null && (
        <div className="pgx-tip" style={{ left: cx, top: 40 }} role="status">
          <strong>{SECTOR_SHORT[hover]}</strong>
          <div>
            {rose.sectors[hover].days.toLocaleString('de-DE')} Tage · {formatShareLabel(share(rose.sectors[hover].days))}
          </div>
          {!showNo2 &&
            PGU.roseSpeedNames.map((name, k) => (
              <div key={name}>
                {name}: {rose.sectors[hover].speedDays[k].toLocaleString('de-DE')} Tage
              </div>
            ))}
          {showNo2 && (
            <div>
              {station}: {rose.sectors[hover].no2.mean === null ? PGU.distNoValues : `Ø ${formatValue(rose.sectors[hover].no2.mean as number)}`} · n = {rose.sectors[hover].no2.n.toLocaleString('de-DE')}
              {rose.sectors[hover].no2.n < engine.input.thresholds.min_days_per_group && <span className="pgx-small"> ({PGU.smallWarning})</span>}
            </div>
          )}
        </div>
      )}

      <p className="pgx-muted pgx-small">
        {showNo2 ? PGU.roseNo2Note : PGU.roseDaysNote(rose.total)} {showNo2 ? PGU.singleStation(station) : ''}
      </p>

      <table className="pgx-sr">
        <caption>{PGU.roseTitle}</caption>
        <thead>
          <tr>
            <th scope="col">Richtung</th>
            <th scope="col">Tage</th>
            <th scope="col">Anteil</th>
            <th scope="col">NO₂ Ø</th>
          </tr>
        </thead>
        <tbody>
          {rose.sectors.map((s, i) => (
            <tr key={s.name}>
              <th scope="row">{SECTOR_SHORT[i]}</th>
              <td>{s.days}</td>
              <td>{formatShareLabel(share(s.days))}</td>
              <td>{s.no2.mean === null ? '–' : formatValue(s.no2.mean)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatShareLabel(percent: number): string {
  return `${formatNumber(percent, 1)} %`
}
