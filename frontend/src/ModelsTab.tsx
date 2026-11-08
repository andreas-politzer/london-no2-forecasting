import { useEffect, useState } from 'react'
import InfoPopover from './InfoPopover'
import {
  MODEL_INFO,
  TERMS,
  UI,
  cellTip,
  horizonLabel,
  naTip,
  noStrictBody,
} from './texts'

type CvRow = {
  model: string
  horizon: number
  evaluable: boolean | null
  folds_total: number | null
  folds_counted: number | null
  share: number | null
  mae_mean: number | null
}

type FinalRow = {
  model: string
  horizon: number
  evaluable: boolean | null
  reason: string | null
  mae: number | null
}

type RuleBlock = { cv: CvRow[]; final: FinalRow[] }

type StationData = {
  station: string
  rules: { streng: RuleBlock; gelockert: RuleBlock }
}

type Meta = { models: string[]; horizons: number[] }

type Cell = {
  model: string
  horizon: number
  mae: number | null
  tipTitle: string
  tipShort: string
  tipMore?: string
}

const BASE = import.meta.env.BASE_URL
const numberFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

async function getJson<T>(file: string): Promise<T> {
  const response = await fetch(`${BASE}data/${file}`)
  if (!response.ok) throw new Error(file)
  return (await response.json()) as T
}

let metaPromise: Promise<Meta> | null = null
function loadMeta(): Promise<Meta> {
  metaPromise ??= getJson<Meta>('meta.json')
  return metaPromise
}

function cvCells(rows: CvRow[]): Cell[] {
  return rows.map((r) => {
    const counted = r.folds_counted ?? 0
    const total = r.folds_total ?? 0
    const ok = r.evaluable === true && r.mae_mean !== null
    return {
      model: r.model,
      horizon: r.horizon,
      mae: ok ? r.mae_mean : null,
      tipTitle: ok ? UI.modelColumn : TERMS.na.title,
      tipShort: ok ? cellTip(counted, total) : naTip(counted, total),
      tipMore: ok ? undefined : TERMS.na.short,
    }
  })
}

function finalCells(rows: FinalRow[]): Cell[] {
  return rows.map((r) => {
    const ok = r.evaluable === true && r.mae !== null
    return {
      model: r.model,
      horizon: r.horizon,
      mae: ok ? r.mae : null,
      tipTitle: TERMS.na.title,
      tipShort: r.reason ?? TERMS.na.short,
    }
  })
}

function ScoreTable({
  cells,
  models,
  horizons,
  withTips,
}: {
  cells: Cell[]
  models: string[]
  horizons: number[]
  withTips: boolean
}) {
  const find = (model: string, horizon: number) =>
    cells.find((c) => c.model === model && c.horizon === horizon)

  const best = new Map<number, number>()
  for (const horizon of horizons) {
    const values = cells
      .filter((c) => c.horizon === horizon && c.mae !== null)
      .map((c) => c.mae as number)
    if (values.length > 0) best.set(horizon, Math.min(...values))
  }

  return (
    <div className="table-wrap">
      <table className="score-table">
        <thead>
          <tr>
            <th scope="col">{UI.modelColumn}</th>
            {horizons.map((h) => (
              <th scope="col" key={h}>
                {horizonLabel(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((model) => {
            const info = MODEL_INFO[model]
            return (
              <tr key={model}>
                <th scope="row">
                  <span className="model-name">{info?.label ?? model}</span>
                  {info && (
                    <InfoPopover
                      title={info.label}
                      short={info.short}
                      more={info.more}
                    />
                  )}
                </th>
                {horizons.map((horizon) => {
                  const cell = find(model, horizon)
                  if (!cell) return <td key={horizon} />
                  if (cell.mae === null) {
                    return (
                      <td key={horizon} className="na">
                        <InfoPopover
                          title={cell.tipTitle}
                          short={cell.tipShort}
                          more={cell.tipMore}
                          align="right"
                        >
                          {UI.naCell}
                        </InfoPopover>
                      </td>
                    )
                  }
                  // Only the multi-start comparison highlights a best value;
                  // the single final period (withTips = false) never does.
                  const isBest = withTips && cell.mae === best.get(horizon)
                  const text = numberFormat.format(cell.mae)
                  return (
                    <td key={horizon} className={isBest ? 'best' : undefined}>
                      {withTips ? (
                        <InfoPopover
                          short={cell.tipShort}
                          align="right"
                          ariaLabel={`${text} µg/m³`}
                        >
                          {text}
                        </InfoPopover>
                      ) : (
                        text
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ModelsTab({ code }: { code: string }) {
  const [state, setState] = useState<{
    code: string
    station?: StationData
    meta?: Meta
    failed?: boolean
  } | null>(null)
  const [showRelaxed, setShowRelaxed] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getJson<StationData>(`station_${code}.json`),
      loadMeta(),
    ])
      .then(([station, meta]) => {
        if (!cancelled) setState({ code, station, meta })
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
  if (current.failed || !current.station || !current.meta) {
    return <p className="tab-note">{UI.loadError}</p>
  }

  const { station, meta } = current
  const strict = station.rules.streng
  const relaxed = station.rules.gelockert
  const strictCells = cvCells(strict.cv)
  const anyStrict = strictCells.some((c) => c.mae !== null)
  const maxShare = Math.max(0, ...strict.cv.map((r) => r.share ?? 0))

  return (
    <div className="models-tab">
      <p className="unit-line">
        {UI.unitLine}
        <InfoPopover {...TERMS.mae} />
        <InfoPopover {...TERMS.horizon} ariaLabel={TERMS.horizon.title} />
      </p>
      <p className="method-line">
        <InfoPopover {...TERMS.method}>{TERMS.method.title}</InfoPopover>
      </p>

      <h3 className="block-title">
        {UI.strictTitle}
        <InfoPopover {...TERMS.strict} />
      </h3>
      {anyStrict ? (
        <ScoreTable
          cells={strictCells}
          models={meta.models}
          horizons={meta.horizons}
          withTips
        />
      ) : (
        <div className="notice">
          <strong>{UI.noStrictTitle}</strong>
          <p>{noStrictBody(Math.floor(maxShare * 100))}</p>
          <p>{UI.noStrictHint}</p>
          <p>{UI.noStrictFinal}</p>
        </div>
      )}
      <p className="legend">
        {UI.legendBest} {UI.legendNa}
        <InfoPopover {...TERMS.best} />
      </p>

      <label className="relaxed-switch">
        <input
          type="checkbox"
          checked={showRelaxed}
          onChange={(event) => setShowRelaxed(event.target.checked)}
        />
        <span>
          {UI.toggleLabel}
          <small>{UI.toggleHint}</small>
        </span>
      </label>

      {showRelaxed && (
        <section className="relaxed-block">
          <h3 className="block-title">
            {UI.relaxedTitle}
            <InfoPopover {...TERMS.relaxed} />
          </h3>
          <p className="warning">{UI.relaxedWarning}</p>
          <ScoreTable
            cells={cvCells(relaxed.cv)}
            models={meta.models}
            horizons={meta.horizons}
            withTips
          />
        </section>
      )}

      <details className="final-block">
        <summary>
          <span className="final-title">{UI.finalTitle}</span>
          <span className="final-sub">{UI.finalSubtitle}</span>
        </summary>
        <p className="final-text">
          {TERMS.final.short}
          <InfoPopover {...TERMS.final} />
        </p>
        <ScoreTable
          cells={finalCells(strict.final)}
          models={meta.models}
          horizons={meta.horizons}
          withTips={false}
        />
        {showRelaxed && (
          <>
            <p className="warning">{UI.relaxedWarning}</p>
            <ScoreTable
              cells={finalCells(relaxed.final)}
              models={meta.models}
              horizons={meta.horizons}
              withTips={false}
            />
          </>
        )}
      </details>
    </div>
  )
}