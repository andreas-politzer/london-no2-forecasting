import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  MODEL_INFO,
  PG,
  UI,
  coverageNote,
  formatDay,
  horizonDays,
  outlookIntro,
  weekdayDate,
} from './texts'

type Values = (number | null)[]
type Entry = { o: string; final: boolean; truth: Values; f: Record<string, Values> }
type Backtest = { station: string; horizons: Record<string, Entry[]> }
type Future = {
  station: string
  origin: string
  data_until: string
  available: boolean
  reason?: string
  recent?: { start: string; values: Values }
  f?: Record<string, Values>
}
type Meta = { models: string[]; horizons: number[] }
type Mode = 'outlook' | 'backtest'

type ChartData = {
  startDate: string
  length: number
  truth: Values
  series: Record<string, Values>
  originIndex: number | null
}

const BASE = import.meta.env.BASE_URL
const W = 640
const H = 320
const ML = 40
const MR = 10
const MT = 14
const MB = 26
const PW = W - ML - MR
const PH = H - MT - MB
const INK = '#0f172a'

// Fixed colour per model (validated categorical palette, first six slots).
const COLORS: Record<string, string> = {
  Mean: '#2a78d6',
  'Seasonal Naive (7)': '#eb6834',
  SARIMA: '#1baf7a',
  'Prophet (Woche + Jahr explizit)': '#eda100',
  'GBM rekursiv': '#e87ba4',
  'GBM Kalender': '#008300',
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
const oneDecimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const cache = new Map<string, Promise<unknown>>()
function getJson<T>(file: string): Promise<T> {
  let promise = cache.get(file)
  if (!promise) {
    promise = fetch(`${BASE}data/${file}`)
      .then((response) => {
        if (!response.ok) throw new Error(file)
        return response.json()
      })
      .catch((error: unknown) => {
        cache.delete(file)
        throw error
      })
    cache.set(file, promise)
  }
  return promise as Promise<T>
}

function dateAt(start: string, offset: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86400000)
    .toISOString()
    .slice(0, 10)
}

function tickLabel(iso: string, long: boolean): string {
  const [year, month, day] = iso.split('-')
  return long ? `${SHORT_MONTHS[Number(month) - 1]} ${year.slice(2)}` : `${day}.${month}.`
}

function pathOf(values: Values, x: (i: number) => number, y: (v: number) => number): string {
  let path = ''
  let pen = false
  values.forEach((value, i) => {
    if (value === null) {
      pen = false
      return
    }
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`
    pen = true
  })
  return path
}

function mae(truth: Values, forecast: Values): number | null {
  let sum = 0
  let count = 0
  truth.forEach((t, i) => {
    const f = forecast[i]
    if (t !== null && f !== null && f !== undefined) {
      sum += Math.abs(t - f)
      count += 1
    }
  })
  return count === 0 ? null : sum / count
}

function mean(values: Values): number | null {
  const valid = values.filter((v): v is number => v !== null)
  return valid.length === 0 ? null : valid.reduce((a, b) => a + b, 0) / valid.length
}

function labelOf(model: string): string {
  return MODEL_INFO[model]?.label ?? model
}

function Plot({
  data,
  models,
  enabled,
  onToggle,
}: {
  data: ChartData
  models: string[]
  enabled: Set<string>
  onToggle: (model: string) => void
}) {
  const [active, setActive] = useState<number | null>(null)
  const shown = active === null ? null : Math.min(active, data.length - 1)

  const visible: number[] = []
  data.truth.forEach((v) => {
    if (v !== null) visible.push(v)
  })
  for (const model of models) {
    if (!enabled.has(model)) continue
    data.series[model]?.forEach((v) => {
      if (v !== null) visible.push(v)
    })
  }
  const yMin = Math.min(0, Math.floor(Math.min(0, ...visible) / 10) * 10)
  const yMax = Math.ceil(Math.max(20, ...visible) / 10) * 10
  const step = yMax - yMin <= 60 ? 10 : yMax - yMin <= 120 ? 20 : 50
  const yTicks: number[] = []
  for (let v = yMin; v <= yMax; v += step) yTicks.push(v)

  const x = (i: number) => ML + (i / (data.length - 1)) * PW
  const y = (v: number) => MT + PH * (1 - (v - yMin) / (yMax - yMin))
  const long = data.length > 100
  const xTicks = [0, 1, 2, 3, 4].map((k) => Math.round((k * (data.length - 1)) / 4))

  function onPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * W
    const index = Math.round(((px - ML) / PW) * (data.length - 1))
    setActive(Math.min(data.length - 1, Math.max(0, index)))
  }

  return (
    <>
      <div className="pg-chips" role="group" aria-label={PG.modelsLabel}>
        {models.map((model) => (
          <button
            key={model}
            type="button"
            className={`pg-chip${enabled.has(model) ? ' on' : ''}`}
            aria-pressed={enabled.has(model)}
            onClick={() => onToggle(model)}
          >
            <span className="pg-swatch" style={{ background: COLORS[model] ?? INK }} />
            {labelOf(model)}
          </button>
        ))}
      </div>

      <svg
        className="hist-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Prognose-Grafik, ${data.length} Tage ab ${data.startDate}`}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line className="hist-grid" x1={ML} x2={ML + PW} y1={y(v)} y2={y(v)} />
            <text className="hist-tick" x={ML - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {xTicks.map((i, k) => (
          <text
            key={i}
            className="hist-tick"
            x={x(i)}
            y={H - 8}
            textAnchor={k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}
          >
            {tickLabel(dateAt(data.startDate, i), long)}
          </text>
        ))}

        {data.originIndex !== null && data.originIndex > 0 && (
          <g>
            <line
              className="hist-guide"
              x1={x(data.originIndex)}
              x2={x(data.originIndex)}
              y1={MT}
              y2={MT + PH}
            />
            <text className="hist-band-label" x={x(data.originIndex) + 4} y={MT + 12}>
              {PG.startLabel}
            </text>
          </g>
        )}

        {models.map((model) =>
          enabled.has(model) && data.series[model] ? (
            <path
              key={model}
              className="pg-line"
              d={pathOf(data.series[model], x, y)}
              style={{ stroke: COLORS[model] ?? INK }}
            />
          ) : null,
        )}
        <path className="pg-truth" d={pathOf(data.truth, x, y)} />

        {shown !== null && (
          <line className="hist-guide" x1={x(shown)} x2={x(shown)} y1={MT} y2={MT + PH} />
        )}
      </svg>

      <div className="pg-readout" aria-live="polite">
        {shown === null ? (
          <p className="legend">{PG.hint}</p>
        ) : (
          <>
            <strong>{weekdayDate(dateAt(data.startDate, shown))}</strong>
            <ul>
              <li>
                <span className="pg-swatch" style={{ background: INK }} />
                {PG.measured}:{' '}
                {data.truth[shown] === null ? 'keine Messung' : oneDecimal.format(data.truth[shown])}
              </li>
              {models.map((model) => {
                const value = data.series[model]?.[shown]
                if (!enabled.has(model) || value === null || value === undefined) return null
                return (
                  <li key={model}>
                    <span className="pg-swatch" style={{ background: COLORS[model] ?? INK }} />
                    {labelOf(model)}: {oneDecimal.format(value)}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </>
  )
}

function ValueTable({
  title,
  note,
  rows,
  lowestIsBest,
}: {
  title: string
  note: string
  rows: { model: string; value: number | null }[]
  lowestIsBest: boolean
}) {
  const numbers = rows.flatMap((r) => (r.value === null ? [] : [r.value]))
  const best = numbers.length > 0 ? Math.round(Math.min(...numbers) * 10) : null
  return (
    <div className="table-wrap">
      <table className="score-table">
        <thead>
          <tr>
            <th scope="col">{PG.tableModel}</th>
            <th scope="col">{title}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ model, value }) => (
            <tr key={model}>
              <th scope="row">
                <span className="pg-swatch" style={{ background: COLORS[model] ?? INK }} />
                <span className="model-name">{labelOf(model)}</span>
              </th>
              <td
                className={
                  lowestIsBest && value !== null && best !== null && Math.round(value * 10) === best
                    ? 'best'
                    : value === null
                      ? 'na'
                      : undefined
                }
              >
                {value === null ? UI.naCell : oneDecimal.format(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legend">{note}</p>
    </div>
  )
}

export default function PrognoseTab({ code }: { code: string }) {
  const [state, setState] = useState<{
    code: string
    backtest?: Backtest
    future?: Future
    meta?: Meta
    failed?: boolean
  } | null>(null)
  const [modeChoice, setModeChoice] = useState<Mode | null>(null)
  const [horizon, setHorizon] = useState(30)
  const [index, setIndex] = useState<number | null>(null)
  const [enabled, setEnabled] = useState<Set<string>>(new Set(Object.keys(COLORS)))

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getJson<Backtest>(`forecast_${code}.json`),
      getJson<Future>(`future_${code}.json`),
      getJson<Meta>('meta.json'),
    ])
      .then(([backtest, future, meta]) => {
        if (!cancelled) setState({ code, backtest, future, meta })
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
  if (current.failed || !current.backtest || !current.future || !current.meta) {
    return <p className="tab-note">{UI.loadError}</p>
  }

  const { backtest, future, meta } = current
  const mode: Mode = modeChoice ?? (future.available ? 'outlook' : 'backtest')
  const models = meta.models
  const toggle = (model: string) =>
    setEnabled((previous) => {
      const next = new Set(previous)
      if (next.has(model)) next.delete(model)
      else next.add(model)
      return next
    })

  let body
  if (mode === 'outlook') {
    if (!future.available || !future.recent || !future.f) {
      body = (
        <div className="notice">
          <strong>{PG.unavailableTitle}</strong>
          <p>{future.reason ? `${future.reason}. ` : ''}{PG.unavailableBody}</p>
        </div>
      )
    } else {
      const recent = future.recent.values
      const horizonLength = Object.values(future.f)[0].length
      const total = recent.length + horizonLength
      const pad = (values: Values, before: number): Values => [
        ...Array<null>(before).fill(null),
        ...values,
        ...Array<null>(total - before - values.length).fill(null),
      ]
      const data: ChartData = {
        startDate: future.recent.start,
        length: total,
        truth: pad(recent, 0),
        series: Object.fromEntries(
          Object.entries(future.f).map(([model, values]) => [model, pad(values, recent.length)]),
        ),
        originIndex: recent.length,
      }
      body = (
        <>
          <h3 className="block-title">{PG.outlookTitle}</h3>
          <p className="unit-line">{outlookIntro(future.origin, future.data_until)}</p>
          <Plot data={data} models={models} enabled={enabled} onToggle={toggle} />
          <ValueTable
            title={PG.tableLevel}
            note={PG.tableLevelNote}
            lowestIsBest={false}
            rows={models
              .filter((m) => enabled.has(m) && future.f?.[m])
              .map((model) => ({ model, value: mean(future.f?.[model] ?? []) }))}
          />
          <p className="legend">{PG.outlookNote}</p>
        </>
      )
    }
  } else {
    const entries = backtest.horizons[String(horizon)] ?? []
    const at = entries.length === 0 ? 0 : Math.min(index ?? entries.length - 1, entries.length - 1)
    const entry = entries[at]
    body = (
      <>
        <h3 className="block-title">{PG.backtestTitle}</h3>
        <p className="unit-line">{PG.backtestIntro}</p>

        <div className="pg-chips" role="group" aria-label={PG.horizonLabel}>
          {meta.horizons.map((h) => (
            <button
              key={h}
              type="button"
              className={`pg-chip${h === horizon ? ' on' : ''}`}
              aria-pressed={h === horizon}
              onClick={() => {
                setHorizon(h)
                setIndex(null)
              }}
            >
              {horizonDays(h)}
            </button>
          ))}
        </div>

        {!entry ? (
          <p className="tab-note">{PG.noStarts}</p>
        ) : (
          <>
            <label className="pg-slider">
              <span>{PG.startLabel}</span>
              <input
                type="range"
                min={0}
                max={entries.length - 1}
                value={at}
                onChange={(event) => setIndex(Number(event.target.value))}
              />
            </label>
            <p className="pg-start">
              <strong>
                {formatDay(entry.o)} bis {formatDay(dateAt(entry.o, horizon - 1))}
              </strong>
              {entry.final && <span className="pg-badge">{PG.finalBadge}</span>}
            </p>
            <p className="legend">
              {coverageNote(entry.truth.filter((v) => v !== null).length, horizon)}
            </p>
            <Plot
              data={{
                startDate: entry.o,
                length: horizon,
                truth: entry.truth,
                series: entry.f,
                originIndex: null,
              }}
              models={models}
              enabled={enabled}
              onToggle={toggle}
            />
            <ValueTable
              title={PG.tableError}
              note={PG.tableErrorNote}
              lowestIsBest
              rows={models
                .filter((m) => enabled.has(m) && entry.f[m])
                .map((model) => ({ model, value: mae(entry.truth, entry.f[model]) }))}
            />
          </>
        )}
      </>
    )
  }

  return (
    <div className="models-tab pg-tab">
      <div className="pg-modes" role="group" aria-label="Ansicht">
        {(['outlook', 'backtest'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`pg-mode${mode === m ? ' on' : ''}`}
            aria-pressed={mode === m}
            onClick={() => setModeChoice(m)}
          >
            {m === 'outlook' ? PG.modeOutlook : PG.modeBacktest}
          </button>
        ))}
      </div>
      {body}
    </div>
  )
}