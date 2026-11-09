import { useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { GROUPING_LABELS, PGU, VARIABLE_LABELS, VARIABLE_SHORT, groupLabel } from '../labels'
import { NUMERIC_VARIABLES, type Grouping, type NumericVariable } from '../state'
import { correlationMatrix, crossStats, isLinearVariable } from '../stats'
import { divergingColor, rampColor, textOn } from './colors'
import { toggleGroupHighlight } from './highlight'
import { clamp, formatNumber, formatValue } from './svg'
import type { ChartProps } from './types'

const LABEL_W = 96
const HEAD_H = 36
const CORR_VARIABLES = NUMERIC_VARIABLES.filter(isLinearVariable)

// Two views of "which combination is high": the mean of one variable for
// every combination of two groupings (rows, columns), or the correlation of all
// variables with each other. Small cells are hatched, never hidden. Clicking a
// row or column heading marks those days in all charts.
export default function HeatmapChart({ config, data, width, highlight, onHighlight }: ChartProps) {
  const correlation = config.options.form === 'correlation'
  const method = config.options.method === 'pearson' ? 'pearson' : 'spearman'
  const y: NumericVariable = config.y ?? 'no2'
  const rowGrouping: Grouping = (config.options.rows as Grouping | undefined) ?? 'month'
  const colGrouping: Grouping = config.group ?? 'windClass'
  const { engine } = data
  const station = data.stations[0]
  const patternId = useId().replace(/:/g, '')
  const [hover, setHover] = useState<[number, number] | null>(null)

  const cross = useMemo(
    () => (correlation ? null : crossStats(engine.input, engine.axis, data.mask, rowGrouping, colGrouping, y, station)),
    [engine, data.mask, correlation, rowGrouping, colGrouping, y, station],
  )
  const corr = useMemo(
    () =>
      correlation
        ? correlationMatrix(
            CORR_VARIABLES.map((v) => ({
              key: v,
              values: v === 'no2' ? engine.input.no2[station] : engine.input.weather[v],
            })),
            data.mask,
            method,
          )
        : null,
    [engine, data.mask, correlation, method, station],
  )

  const rowKeys = cross ? cross.rowKeys : (corr?.keys ?? [])
  const colKeys = cross ? cross.colKeys : (corr?.keys ?? [])
  const cols = colKeys.length
  const rows = rowKeys.length
  if (cols === 0 || rows === 0) return null

  const cellW = clamp((width - LABEL_W - 8) / cols, 18, correlation ? 56 : 96)
  const cellH = correlation ? cellW : 26
  const svgW = LABEL_W + cellW * cols + 8
  const svgH = HEAD_H + cellH * rows + 6

  let lo = Infinity
  let hi = -Infinity
  if (cross) {
    for (const row of cross.cells) for (const cell of row) {
      if (cell.mean === null) continue
      lo = Math.min(lo, cell.mean)
      hi = Math.max(hi, cell.mean)
    }
  }
  const norm = (value: number) => (hi > lo ? (value - lo) / (hi - lo) : 0.5)

  const rowLabel = (key: string) => (correlation ? VARIABLE_SHORT[key as NumericVariable] : groupLabel(rowGrouping, key))
  const colLabel = (key: string) => (correlation ? VARIABLE_SHORT[key as NumericVariable] : groupLabel(colGrouping, key))
  const markedRows = highlight?.kind === 'groups' && highlight.grouping === rowGrouping ? highlight.keys : []
  const markedCols = highlight?.kind === 'groups' && highlight.grouping === colGrouping ? highlight.keys : []

  function toggle(grouping: Grouping, key: string, additive: boolean) {
    onHighlight(toggleGroupHighlight(highlight, grouping, key, additive))
  }
  const heading = (grouping: Grouping, key: string) => ({
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

  const tip = (() => {
    if (!hover) return null
    const [r, c] = hover
    if (corr) {
      const value = corr.r[r][c]
      return {
        title: `${VARIABLE_SHORT[corr.keys[r] as NumericVariable]} · ${VARIABLE_SHORT[corr.keys[c] as NumericVariable]}`,
        text: value === null ? PGU.distNoValues : `r = ${formatNumber(value, 2)} · n = ${corr.n[r][c].toLocaleString('de-DE')}`,
      }
    }
    const cell = (cross as NonNullable<typeof cross>).cells[r][c]
    return {
      title: `${rowLabel(rowKeys[r])} · ${colLabel(colKeys[c])}`,
      text: `${cell.mean === null ? PGU.distNoValues : `Ø ${formatValue(cell.mean)}`} · n = ${cell.n.toLocaleString('de-DE')}${cell.low ? ` (${PGU.smallWarning})` : ''}`,
    }
  })()
  const tipLeft = hover ? clamp(LABEL_W + cellW * (hover[1] + 0.5), 124, Math.max(124, width - 124)) : 0

  const title = correlation
    ? `${PGU.heatCorrelation} (${method === 'spearman' ? PGU.heatSpearman : PGU.heatPearson})`
    : `${PGU.heatCross}: Ø ${VARIABLE_LABELS[y]}`

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
          {colKeys.map((key, c) => (
            <text
              key={key}
              className={`pgx-tick${correlation ? '' : ' pgx-heading'}${markedCols.includes(key) ? ' pgx-heading-on' : ''}`}
              x={LABEL_W + cellW * (c + 0.5)}
              y={HEAD_H - 10}
              textAnchor="middle"
              {...(correlation ? {} : heading(colGrouping, key))}
            >
              {colLabel(key)}
            </text>
          ))}
          {rowKeys.map((key, r) => (
            <g key={key}>
              <text
                className={`pgx-tick${correlation ? '' : ' pgx-heading'}${markedRows.includes(key) ? ' pgx-heading-on' : ''}`}
                x={LABEL_W - 8}
                y={HEAD_H + cellH * (r + 0.5)}
                dy="0.32em"
                textAnchor="end"
                {...(correlation ? {} : heading(rowGrouping, key))}
              >
                {rowLabel(key)}
              </text>
              {colKeys.map((colKey, c) => {
                let fill = '#f0efec'
                let text = '–'
                let low = false
                if (corr) {
                  const value = corr.r[r][c]
                  if (value !== null) {
                    fill = divergingColor(value)
                    text = formatNumber(value, 2)
                  }
                } else if (cross) {
                  const cell = cross.cells[r][c]
                  low = cell.low
                  if (cell.mean !== null) {
                    fill = rampColor(norm(cell.mean))
                    text = formatValue(cell.mean)
                  }
                }
                const x = LABEL_W + cellW * c
                const yy = HEAD_H + cellH * r
                return (
                  <g key={colKey} onPointerEnter={() => setHover([r, c])} onPointerLeave={() => setHover(null)}>
                    <rect x={x + 1} y={yy + 1} width={cellW - 2} height={cellH - 2} rx={3} fill={fill} />
                    {low && <rect x={x + 1} y={yy + 1} width={cellW - 2} height={cellH - 2} rx={3} fill={`url(#${patternId})`} />}
                    {cellW >= 30 && (
                      <text x={x + cellW / 2} y={yy + cellH / 2} dy="0.32em" textAnchor="middle" fontSize={cellW < 40 ? 10 : 11} fill={textOn(fill)}>
                        {text}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
      </div>

      {tip && (
        <div className="pgx-tip" style={{ left: tipLeft, top: HEAD_H }} role="status">
          <strong>{tip.title}</strong>
          <div>{tip.text}</div>
        </div>
      )}

      <p className="pgx-muted pgx-small">
        {correlation ? PGU.heatCorrelationNote : `${PGU.heatCrossNote} ${PGU.heatHatched}`} {PGU.singleStation(station)}
      </p>

      <table className="pgx-sr">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{correlation ? '' : GROUPING_LABELS[rowGrouping]}</th>
            {colKeys.map((key) => (
              <th key={key} scope="col">
                {colLabel(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((key, r) => (
            <tr key={key}>
              <th scope="row">{rowLabel(key)}</th>
              {colKeys.map((colKey, c) => {
                if (corr) return <td key={colKey}>{corr.r[r][c] === null ? '–' : formatNumber(corr.r[r][c] as number, 2)}</td>
                const cell = (cross as NonNullable<typeof cross>).cells[r][c]
                return <td key={colKey}>{cell.mean === null ? '–' : `${formatValue(cell.mean)} (n = ${cell.n})`}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
