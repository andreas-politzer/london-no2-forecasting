import { PGC } from '../labels'
import { formatNumber, formatValue, linearScale, niceDomain, niceTicks } from '../charts/svg'
import { useElementWidth } from '../charts/useElementWidth'
import type { BoxStats } from '../stats'
import { GROUP_COLORS, type SideStat, type StationCompare } from './compareLogic'

const MINUS = '−'

function signed(value: number, digits = 1): string {
  const text = formatNumber(Math.abs(value), digits)
  return value < 0 ? `${MINUS}${text}` : value > 0 ? `+${text}` : text
}

type Props = {
  results: StationCompare[]
  places: Record<string, string>
  minValues: number
}

const MARGIN = { top: 6, right: 12, bottom: 34, left: 12 }
const ROW = 30

function Boxes({ result, domain }: { result: StationCompare; domain: [number, number] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const w = Math.max(160, width)
  const height = MARGIN.top + ROW * 2 + MARGIN.bottom
  const x = linearScale(domain[0], domain[1], MARGIN.left, w - MARGIN.right)
  const ticks = niceTicks(domain[0], domain[1], 5)
  const sides: { stat: SideStat; color: string; y: number }[] = [
    { stat: result.a, color: GROUP_COLORS.a, y: MARGIN.top + ROW / 2 },
    { stat: result.b, color: GROUP_COLORS.b, y: MARGIN.top + ROW * 1.5 },
  ]
  return (
    <div ref={ref} className="pgc-plot">
      {width > 0 && (
        <svg width={w} height={height} className="pgx-plot" role="img" aria-label={PGC.plotLabel(result.code)}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className="pgx-grid" x1={x(tick)} x2={x(tick)} y1={MARGIN.top} y2={MARGIN.top + ROW * 2} />
              <text className="pgx-tick" x={x(tick)} y={MARGIN.top + ROW * 2 + 14} textAnchor="middle">
                {formatNumber(tick, 1)}
              </text>
            </g>
          ))}
          <text className="pgx-caption" x={w - MARGIN.right} y={height - 4} textAnchor="end">
            {PGC.axis}
          </text>
          {sides.map(({ stat, color, y }) => {
            const box: BoxStats | null = stat.tooFew ? null : stat.box
            if (!box) return null
            const dash = stat.low ? '4 3' : undefined
            return (
              <g key={color}>
                <line x1={x(box.whiskerLow)} x2={x(box.whiskerHigh)} y1={y} y2={y} stroke={color} strokeWidth={2} strokeDasharray={dash} />
                <rect
                  x={x(box.q1)}
                  y={y - 9}
                  width={Math.max(1, x(box.q3) - x(box.q1))}
                  height={18}
                  rx={3}
                  fill={color}
                  fillOpacity={stat.low ? 0.18 : 0.4}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={dash}
                />
                <line x1={x(box.median)} x2={x(box.median)} y1={y - 9} y2={y + 9} stroke={color} strokeWidth={3} />
                <circle cx={x(box.mean)} cy={y} r={3.5} fill="var(--bg, #fff)" stroke={color} strokeWidth={2} />
                {box.outliers.slice(0, 60).map((value, k) => (
                  <circle key={k} cx={x(value)} cy={y} r={1.6} fill={color} fillOpacity={0.5} />
                ))}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

function Row({ label, color, stat }: { label: string; color: string; stat: SideStat }) {
  const hide = stat.tooFew
  const cell = (value: number | null) => (hide || value === null ? '–' : formatValue(value))
  return (
    <tr>
      <th scope="row">
        <span className="pgx-swatch" style={{ background: color }} aria-hidden="true" /> {label}
      </th>
      <td>{stat.days.toLocaleString('de-DE')}</td>
      <td>
        {stat.n.toLocaleString('de-DE')}
        {hide ? <span className="pgx-small-note"> ({PGC.tooFew})</span> : stat.low ? <span className="pgx-small-note"> ({PGC.fewDays})</span> : null}
      </td>
      <td>{(stat.days - stat.n).toLocaleString('de-DE')}</td>
      <td>{cell(stat.mean)}</td>
      <td>{cell(stat.median)}</td>
    </tr>
  )
}

export default function CompareResult({ results, places, minValues }: Props) {
  const lows: number[] = []
  const highs: number[] = []
  for (const result of results) {
    for (const stat of [result.a, result.b]) {
      if (stat.tooFew || !stat.box) continue
      lows.push(Math.min(stat.box.min, stat.box.whiskerLow))
      highs.push(Math.max(stat.box.max, stat.box.whiskerHigh))
    }
  }
  const domain: [number, number] = lows.length === 0 ? [0, 1] : niceDomain(Math.min(0, ...lows), Math.max(...highs))

  return (
    <div className="pgc-results">
      {results.map((result) => (
        <section key={result.code} className="pgx-chart" aria-label={PGC.stationTitle(result.code, places[result.code] ?? '')}>
          <h3 className="pgx-chart-title">{PGC.stationTitle(result.code, places[result.code] ?? '')}</h3>
          <div className="pgx-scrollx">
            <table className="pgc-table">
              <thead>
                <tr>
                  <th scope="col">{PGC.colGroup}</th>
                  <th scope="col">{PGC.colDays}</th>
                  <th scope="col">{PGC.colValues}</th>
                  <th scope="col">{PGC.colMissing}</th>
                  <th scope="col">{PGC.colMean}</th>
                  <th scope="col">{PGC.colMedian}</th>
                </tr>
              </thead>
              <tbody>
                <Row label={PGC.rowA} color={GROUP_COLORS.a} stat={result.a} />
                <Row label={PGC.rowB} color={GROUP_COLORS.b} stat={result.b} />
              </tbody>
            </table>
          </div>
          <p className="pgc-diff" role="status">
            <strong>{PGC.diffTitle}</strong>
            <br />
            {result.diff === null ? (
              PGC.notComparable(minValues)
            ) : (
              <>
                {PGC.diffMean(
                  signed(result.diff),
                  result.percent === null ? null : `${signed(result.percent, 0)} %`,
                )}
                {result.diffMedian !== null && (
                  <>
                    <br />
                    {PGC.diffMedian(signed(result.diffMedian))}
                  </>
                )}
              </>
            )}
          </p>
          <Boxes result={result} domain={domain} />
        </section>
      ))}
      <p className="pgx-note">{PGC.plotNote}</p>
    </div>
  )
}
