import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import InfoPopover from './InfoPopover'
import {
  EVENTS,
  EVENTS_INFO,
  TERMS,
  UI,
  historyCoverage,
  historyReadout,
} from './texts'

type Month = { m: string; mean: number | null; days: number; of: number }

type History = {
  station: string
  first_day: string
  last_day: string
  measured_days: number
  calendar_days: number
  months: Month[]
}

type Meta = { final_origin: string }

const BASE = import.meta.env.BASE_URL
const W = 640
const H = 300
const ML = 44
const MR = 12
const MT = 16
const MB = 28
const PW = W - ML - MR
const PH = H - MT - MB

async function getJson<T>(file: string): Promise<T> {
  const response = await fetch(`${BASE}data/${file}`)
  if (!response.ok) throw new Error(file)
  return (await response.json()) as T
}

function monthPosition(months: Month[], day: string): number | null {
  const index = months.findIndex((m) => m.m === day.slice(0, 7))
  return index < 0 ? null : index
}

function dmy(day: string): string {
  return day.split('-').reverse().join('.')
}

export default function HistoryTab({ code }: { code: string }) {
  const [state, setState] = useState<{
    code: string
    history?: History
    meta?: Meta
    failed?: boolean
  } | null>(null)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getJson<History>(`history_${code}.json`),
      getJson<Meta>('meta.json'),
    ])
      .then(([history, meta]) => {
        if (!cancelled) setState({ code, history, meta })
      })
      .catch(() => {
        if (!cancelled) setState({ code, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [code])

  const current = state?.code === code ? state : null
  if (!current) return <p className="tab-note">{UI.loading}</p>
  if (current.failed || !current.history || !current.meta) {
    return <p className="tab-note">{UI.loadError}</p>
  }

  const { history, meta } = current
  const months = history.months
  const n = months.length
  const values = months.flatMap((m) => (m.mean === null ? [] : [m.mean]))
  if (values.length === 0) return <p className="tab-note">{UI.historyEmpty}</p>

  const yMax = Math.max(20, Math.ceil(Math.max(...values) / 20) * 20)
  const step = yMax <= 60 ? 10 : 20
  const yTicks: number[] = []
  for (let v = 0; v <= yMax; v += step) yTicks.push(v)

  const x = (i: number) => ML + (i / (n - 1)) * PW
  const y = (v: number) => MT + PH * (1 - v / yMax)

  let path = ''
  let pen = false
  months.forEach((month, i) => {
    if (month.mean === null) {
      pen = false
      return
    }
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(month.mean).toFixed(1)}`
    pen = true
  })

  const finalIndex = months.findIndex(
    (m) => m.m === meta.final_origin.slice(0, 7),
  )
  const activeMonth = active === null ? null : months[active]

  function onPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * W
    const index = Math.round(((px - ML) / PW) * (n - 1))
    setActive(Math.min(n - 1, Math.max(0, index)))
  }

  return (
    <div className="models-tab history-tab">
      <h3 className="block-title">
        {UI.historyTitle}
        <InfoPopover {...TERMS.monthly} />
      </h3>
      <p className="unit-line">{UI.historyUnit}</p>

      <svg
        className="hist-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Monatsmittel der NO₂-Messwerte der Station ${code}, ${months[0].m} bis ${months[n - 1].m}`}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
      >
        {finalIndex >= 0 && (
          <g>
            <rect
              className="hist-band"
              x={x(finalIndex)}
              y={MT}
              width={ML + PW - x(finalIndex)}
              height={PH}
            />
            <text className="hist-band-label" x={ML + PW - 4} y={MT + 12} textAnchor="end">
              {UI.historyFinalBand}
            </text>
          </g>
        )}

        {yTicks.map((v) => (
          <g key={v}>
            <line className="hist-grid" x1={ML} x2={ML + PW} y1={y(v)} y2={y(v)} />
            <text className="hist-tick" x={ML - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}

        {months.map((month, i) =>
          month.m.endsWith('-01') && Number(month.m.slice(0, 4)) % 2 === 0 ? (
            <text
              key={month.m}
              className="hist-tick"
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
            >
              {month.m.slice(0, 4)}
            </text>
          ) : null,
        )}

        {EVENTS.map((event) => {
          const start = monthPosition(months, event.from)
          if (start === null) return null
          const end = event.to ? monthPosition(months, event.to) : null
          return (
            <g key={event.letter}>
              {end !== null ? (
                <rect
                  className="hist-event-band"
                  x={x(start)}
                  y={MT}
                  width={x(end) - x(start)}
                  height={PH}
                />
              ) : (
                <line
                  className="hist-event-line"
                  x1={x(start)}
                  x2={x(start)}
                  y1={MT}
                  y2={MT + PH}
                />
              )}
              <text className="hist-event-letter" x={x(start) + 3} y={MT + 11}>
                {event.letter}
              </text>
            </g>
          )
        })}

        <path className="hist-line" d={path} />

        {months.map((month, i) => {
          if (month.mean === null) return null
          const low = month.days / month.of < 0.5
          const isolated =
            months[i - 1]?.mean == null && months[i + 1]?.mean == null
          if (!low && !isolated) return null
          return (
            <circle
              key={month.m}
              className={low ? 'hist-dot hist-dot-low' : 'hist-dot'}
              cx={x(i)}
              cy={y(month.mean)}
              r={2.6}
            />
          )
        })}

        {active !== null && activeMonth && (
          <g>
            <line className="hist-guide" x1={x(active)} x2={x(active)} y1={MT} y2={MT + PH} />
            {activeMonth.mean !== null && (
              <circle className="hist-dot" cx={x(active)} cy={y(activeMonth.mean)} r={3.4} />
            )}
          </g>
        )}
      </svg>

      <p className="hist-readout" aria-live="polite">
        {activeMonth
          ? historyReadout(activeMonth.m, activeMonth.mean, activeMonth.days, activeMonth.of)
          : UI.historyHint}
      </p>
      <p className="legend">{UI.historyLegendGap}</p>
      <p className="legend hist-events-title">
        <strong>{EVENTS_INFO.title}</strong>
        <InfoPopover {...EVENTS_INFO} />
      </p>
      <ul className="hist-events">
        {EVENTS.map((event) => (
          <li key={event.letter}>
            <span className="hist-event-key">{event.letter}</span>
            {dmy(event.from)}
            {event.to ? ` bis ${dmy(event.to)}` : ''}: {event.text}
          </li>
        ))}
      </ul>
      <p className="legend">
        {historyCoverage(
          history.measured_days,
          history.calendar_days,
          history.first_day,
          history.last_day,
        )}
      </p>
    </div>
  )
}