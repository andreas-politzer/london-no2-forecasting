import { useState } from 'react'
import { formatNumber, formatValue, linePath, linearScale, niceDomain, niceTicks, roundedTopBar } from '../charts/svg'
import { useElementWidth } from '../charts/useElementWidth'
import { PGE } from './expLabels'
import { germanDate, histogram, isoOfDay, pointsWithGaps, timeTicks } from './experimentLogic'

const MINUS = '−'
const signed = (value: number, digits = 1) =>
  value < 0 ? `${MINUS}${formatNumber(Math.abs(value), digits)}` : formatNumber(value, digits)

export type PlotLine = {
  key: string
  name: string
  color: string
  values: ArrayLike<number>
  dash?: string
  width?: number
  flagBelowZero?: boolean // mark the days under zero in red
}

type SeriesProps = {
  firstDay: string
  days: number[]
  lines: PlotLine[]
  label: string
}

const M = { top: 8, right: 14, bottom: 30, left: 46 }
const HEIGHT = 260

// Lines over time with a readout of the day under the pointer (or keyboard).
export function SeriesPlot({ firstDay, days, lines, label }: SeriesProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const w = Math.max(240, width)
  const all = lines.flatMap((line) => Array.from(line.values))
  const domain = niceDomain(Math.min(0, ...all), Math.max(1, ...all), 5)
  const x = linearScale(days[0], days[days.length - 1], M.left, w - M.right)
  const y = linearScale(domain[0], domain[1], HEIGHT - M.bottom, M.top)
  const yTicks = niceTicks(domain[0], domain[1], 5)
  const xTicks = timeTicks(firstDay, days[0], days[days.length - 1])

  const nearest = (clientX: number, left: number) => {
    const target = days[0] + ((clientX - left - M.left) / (w - M.left - M.right)) * (days[days.length - 1] - days[0])
    let best = 0
    for (let i = 0; i < days.length; i += 1) if (Math.abs(days[i] - target) < Math.abs(days[best] - target)) best = i
    return best
  }

  return (
    <div ref={ref} className="pge-plot">
      <p className="pge-readout" aria-live="polite">
        {hover === null
          ? ' '
          : `${germanDate(isoOfDay(firstDay, days[hover]))}: ` +
            lines.map((line) => `${line.name} ${formatValue(line.values[hover])}`).join(' · ')}
      </p>
      {width > 0 && (
        <svg
          width={w}
          height={HEIGHT}
          className="pgx-plot"
          role="img"
          aria-label={label}
          onPointerMove={(event) => setHover(nearest(event.clientX, event.currentTarget.getBoundingClientRect().left))}
          onPointerLeave={() => setHover(null)}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line className="pgx-grid" x1={M.left} x2={w - M.right} y1={y(tick)} y2={y(tick)} />
              <text className="pgx-tick" x={M.left - 6} y={y(tick) + 4} textAnchor="end">
                {formatNumber(tick, 1)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <text key={tick.index} className="pgx-tick" x={x(tick.index)} y={HEIGHT - 10} textAnchor="middle">
              {tick.label}
            </text>
          ))}
          <text className="pgx-caption" x={M.left} y={M.top + 2} dy="-0.1em">
            {PGE.axisValue}
          </text>
          {domain[0] < 0 && <line x1={M.left} x2={w - M.right} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth={1} />}
          {lines.map((line) => (
            <path
              key={line.key}
              d={linePath(pointsWithGaps(days, line.values, x, y))}
              fill="none"
              stroke={line.color}
              strokeWidth={line.width ?? 1.6}
              strokeDasharray={line.dash}
              strokeLinejoin="round"
            />
          ))}
          {lines.map((line) =>
            line.flagBelowZero
              ? days.map((day, i) =>
                  line.values[i] < 0 ? <circle key={`${line.key}-${day}`} cx={x(day)} cy={y(line.values[i])} r={2.4} fill="#c62828" /> : null,
                )
              : null,
          )}
          {hover !== null && (
            <g>
              <line x1={x(days[hover])} x2={x(days[hover])} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--muted)" strokeDasharray="3 3" />
              {lines.map((line) => (
                <circle key={line.key} cx={x(days[hover])} cy={y(line.values[hover])} r={3.5} fill={line.color} stroke="var(--bg)" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
      )}
    </div>
  )
}

type DotsProps = { firstDay: string; days: number[]; errors: number[]; label: string; color: string }

// The errors of the days, with the zero line.
export function ErrorDots({ firstDay, days, errors, label, color }: DotsProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const w = Math.max(240, width)
  const limit = Math.max(1, ...errors.map((e) => Math.abs(e)))
  const [low, high] = niceDomain(-limit, limit, 4)
  const x = linearScale(days[0], days[days.length - 1], M.left, w - M.right)
  const y = linearScale(low, high, HEIGHT - M.bottom, M.top)
  const yTicks = niceTicks(low, high, 4)
  const xTicks = timeTicks(firstDay, days[0], days[days.length - 1])
  return (
    <div ref={ref} className="pge-plot">
      {width > 0 && (
        <svg width={w} height={HEIGHT} className="pgx-plot" role="img" aria-label={label}>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line className="pgx-grid" x1={M.left} x2={w - M.right} y1={y(tick)} y2={y(tick)} />
              <text className="pgx-tick" x={M.left - 6} y={y(tick) + 4} textAnchor="end">
                {signed(tick, 0)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <text key={tick.index} className="pgx-tick" x={x(tick.index)} y={HEIGHT - 10} textAnchor="middle">
              {tick.label}
            </text>
          ))}
          <line x1={M.left} x2={w - M.right} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth={1.5} />
          <text className="pgx-caption" x={M.left} y={M.top + 2} dy="-0.1em">
            {PGE.axisError}
          </text>
          {days.map((day, i) => (
            <circle key={day} cx={x(day)} cy={y(errors[i])} r={1.8} fill={color} fillOpacity={0.55} />
          ))}
        </svg>
      )}
    </div>
  )
}

type HistProps = { errors: number[]; label: string; color: string }

export function ErrorHistogram({ errors, label, color }: HistProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const w = Math.max(240, width)
  const { edges, counts } = histogram(errors, 24)
  const top = Math.max(1, ...counts)
  const [, high] = niceDomain(0, top, 4)
  const x = linearScale(edges[0], edges[edges.length - 1], M.left, w - M.right)
  const y = linearScale(0, high, HEIGHT - M.bottom, M.top)
  const yTicks = niceTicks(0, high, 4)
  const xTicks = niceTicks(edges[0], edges[edges.length - 1], 6)
  return (
    <div ref={ref} className="pge-plot">
      {width > 0 && (
        <svg width={w} height={HEIGHT} className="pgx-plot" role="img" aria-label={label}>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line className="pgx-grid" x1={M.left} x2={w - M.right} y1={y(tick)} y2={y(tick)} />
              <text className="pgx-tick" x={M.left - 6} y={y(tick) + 4} textAnchor="end">
                {formatNumber(tick, 0)}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <text key={tick} className="pgx-tick" x={x(tick)} y={HEIGHT - 10} textAnchor="middle">
              {signed(tick, 0)}
            </text>
          ))}
          {counts.map((count, k) => (
            <path
              key={k}
              d={roundedTopBar(x(edges[k]) + 1, y(count), Math.max(1, x(edges[k + 1]) - x(edges[k]) - 2), y(0) - y(count), 3)}
              fill={color}
              fillOpacity={0.75}
            >
              <title>{`${signed(edges[k])} bis ${signed(edges[k + 1])}: ${count} ${PGE.axisCount}`}</title>
            </path>
          ))}
          <line x1={x(0)} x2={x(0)} y1={M.top} y2={y(0)} stroke="var(--ink)" strokeWidth={1.5} />
          <text className="pgx-caption" x={M.left} y={M.top + 2} dy="-0.1em">
            {PGE.axisCount}
          </text>
          <text className="pgx-caption" x={w - M.right} y={HEIGHT - 0} textAnchor="end" dy="-0.2em">
            {PGE.axisError}
          </text>
        </svg>
      )}
    </div>
  )
}

export type BarItem = { key: string; label: string; value: number }

type BarsProps = { items: BarItem[]; label: string; color: string; negativeColor?: string; unit: string; signedValues?: boolean }

// Horizontal bars, one row per item. Negative values go left of the zero line.
export function BarRows({ items, label, color, negativeColor, unit, signedValues = false }: BarsProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const w = Math.max(260, width)
  const labelWidth = Math.min(210, Math.max(120, w * 0.4))
  const rowHeight = 26
  const height = items.length * rowHeight + 30
  const high = Math.max(1e-9, ...items.map((i) => i.value))
  const low = Math.min(0, ...items.map((i) => i.value))
  const hasNegative = low < 0
  const valueText = (value: number) => (signedValues ? signed(value, 2) : formatNumber(value, 2))
  const x = linearScale(low, high, labelWidth + 8, w - 64)
  return (
    <div ref={ref} className="pge-plot">
      {width > 0 && (
        <svg width={w} height={height} className="pgx-plot" role="img" aria-label={label}>
          {items.map((item, i) => {
            const y = 6 + i * rowHeight
            const from = x(Math.min(0, item.value))
            const to = x(Math.max(0, item.value))
            return (
              <g key={item.key}>
                <text className="pgx-tick pge-rowlabel" x={labelWidth} y={y + 15} textAnchor="end">
                  {item.label}
                </text>
                <rect x={from} y={y + 3} width={Math.max(1, to - from)} height={16} rx={3} fill={item.value < 0 && negativeColor ? negativeColor : color} fillOpacity={0.85}>
                  <title>{`${item.label}: ${signedValues ? signed(item.value, 2) : formatNumber(item.value, 2)} ${unit}`}</title>
                </rect>
                <text className="pgx-tick" x={w - 6} y={y + 15} textAnchor="end">
                  {valueText(item.value)}
                </text>
              </g>
            )
          })}
          {hasNegative && <line x1={x(0)} x2={x(0)} y1={2} y2={height - 24} stroke="var(--ink)" strokeWidth={1.5} />}
          <text className="pgx-caption" x={w - 6} y={height - 6} textAnchor="end">
            {unit}
          </text>
        </svg>
      )}
    </div>
  )
}
