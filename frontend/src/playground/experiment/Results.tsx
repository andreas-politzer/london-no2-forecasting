import { useState } from 'react'
import InfoPopover from '../../InfoPopover'
import { formatNumber, formatValue } from '../charts/svg'
import { MONTH_SHORT, WEEKDAY_SHORT } from '../labels'
import type { Engine } from '../adapter'
import { FEATURE_LABELS, METHOD_LABELS, MODEL_KIND_LABELS, PGE } from './expLabels'
import { BarRows, ErrorDots, ErrorHistogram, SeriesPlot, type PlotLine } from './ResultCharts'
import { baselinesCoincide, errorsOf, germanDate, methodRows, type Done, type MethodKey } from './experimentLogic'

const MINUS = '−'
const signed = (value: number, digits = 1) =>
  value < 0 ? `${MINUS}${formatNumber(Math.abs(value), digits)}` : value > 0 ? `+${formatNumber(value, digits)}` : formatNumber(value, digits)

const COLORS: Record<MethodKey | 'actual', string> = {
  actual: 'var(--ink)',
  model: '#2a78d6',
  persistence: '#eb6834',
  naive: '#1baf7a',
  mean: '#eda100',
}
const BASELINES: MethodKey[] = ['persistence', 'naive', 'mean']

// Names of the single columns of a category, read against the left-out group.
function columnLabel(feature: string, name: string): string {
  const base = FEATURE_LABELS[feature] ?? feature
  if (name === feature) return base
  const suffix = name.slice(feature.length + 1)
  if (feature === 'weekday') return `${base}: ${WEEKDAY_SHORT[Number(suffix)] ?? suffix}`
  if (feature === 'month') return `${base}: ${MONTH_SHORT[Number(suffix) - 1] ?? suffix}`
  if (name.endsWith('_sin')) return `${base} (Sinus)`
  if (name.endsWith('_cos')) return `${base} (Kosinus)`
  return `${base}: ${suffix}`
}

type Props = {
  engine: Engine
  result: Done
  stale: boolean
}

export default function Results({ engine, result, stale }: Props) {
  const [shown, setShown] = useState<Record<string, boolean>>({ persistence: true, naive: false, mean: false })
  const first = engine.input.firstDay
  const spec = result.spec
  const c = result.counts
  const rows = methodRows(result)
  const days = result.test.day
  const errors = errorsOf(result.test.model, result.test.actual)
  const lines: PlotLine[] = [
    { key: 'actual', name: PGE.actual, color: COLORS.actual, values: result.test.actual, width: 1.4 },
    { key: 'model', name: METHOD_LABELS.model, color: COLORS.model, values: result.test.model, width: 1.8 },
    ...BASELINES.filter((key) => shown[key]).map((key) => ({
      key,
      name: METHOD_LABELS[key].split(' (')[0],
      color: COLORS[key],
      values: result.test[key],
      dash: '4 3',
    })),
  ]
  const modeLabel = spec.mode === 'explain' ? PGE.explain : PGE.forecast
  const importance = result.importance.map((item) => ({
    key: item.feature,
    label: FEATURE_LABELS[item.feature] ?? item.feature,
    value: item.increase,
  }))
  const coefficients = (result.coefficients?.items ?? [])
    .map((item) => ({ key: item.name, label: columnLabel(item.feature, item.name), value: item.standardized }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 14)

  return (
    <section className={`pge-results${stale ? ' pge-stale' : ''}`} aria-labelledby="pge-result-title">
      <h3 id="pge-result-title" className="block-title">
        {PGE.resultTitle}
      </h3>
      <p className="pgx-hint">
        <strong>
          {PGE.resultHead(spec.station, modeLabel, result.horizon, MODEL_KIND_LABELS[spec.kind])}
        </strong>
      </p>
      {stale && (
        <p className="pgx-hint pge-warn" role="status">
          {PGE.stale}
        </p>
      )}
      <p className="pgx-note">
        {PGE.trainLine(c.trainDays, c.trainMeasured, c.trainRows, germanDate(spec.trainPeriod[0]), germanDate(spec.trainPeriod[1]))}
      </p>
      <p className="pgx-note">
        {PGE.testLine(c.testDays, c.testMeasured, c.testRows, germanDate(spec.testPeriod[0]), germanDate(spec.testPeriod[1]))}
      </p>
      {result.warnings.includes('test-small') && <p className="pgx-hint pge-warn">{PGE.testSmall}</p>}
      {result.warnings.includes('stabilised') && <p className="pgx-hint pge-warn">{PGE.stabilised}</p>}

      <div className="pgx-chart">
        <h4 className="pge-h">{PGE.compareTitle}</h4>
        <p className="pgx-note">{PGE.compareIntro}</p>
        <div className="pge-table-wrap">
          <table className="pgc-table">
            <caption className="pgx-sr">{PGE.tableCaption(PGE.compareTitle)}</caption>
            <thead>
              <tr>
                <th scope="col">{PGE.colMethod}</th>
                <th scope="col">{PGE.colMae}</th>
                <th scope="col">{PGE.colRmse}</th>
                <th scope="col">{PGE.colBias}</th>
                <th scope="col">{PGE.colVs}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={row.key === 'model' ? 'pge-row-model' : undefined}>
                  <th scope="row">
                    <span className="pge-swatch" style={{ background: COLORS[row.key] }} aria-hidden="true" />
                    {row.key === 'model' ? `${METHOD_LABELS.model}: ${MODEL_KIND_LABELS[spec.kind]}` : METHOD_LABELS[row.key]}
                  </th>
                  <td>{formatValue(row.mae)}</td>
                  <td>{formatValue(row.rmse)}</td>
                  <td>{signed(row.bias, 2)}</td>
                  <td>{row.key === 'persistence' || row.versusPersistence === null ? '–' : `${signed(row.versusPersistence, 0)} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pgx-note">
          {PGE.biasHint} {PGE.rmseHint}
        </p>
        {baselinesCoincide(result) && <p className="pgx-note">{PGE.coincide}</p>}
        {spec.mode === 'explain' && <p className="pgx-note">{PGE.explainBaselines}</p>}
      </div>

      <div className="pgx-chart">
        <h4 className="pge-h">{PGE.trainTestTitle}</h4>
        <p className="pgx-hint">
          {PGE.trainTestText(formatValue(result.scores.modelTrain.mae), formatValue(result.scores.model.mae))}
        </p>
      </div>

      <div className="pgx-chart">
        <h4 className="pge-h">{PGE.actualTitle}</h4>
        <div className="pgx-chips" role="group" aria-label={PGE.seriesToggle}>
          <span className="pgx-field-label">{PGE.seriesToggle}</span>
          {BASELINES.map((key) => (
            <button
              key={key}
              type="button"
              className="pgx-chip"
              aria-pressed={shown[key]}
              onClick={() => setShown((previous) => ({ ...previous, [key]: !previous[key] }))}
            >
              <span className="pge-swatch" style={{ background: COLORS[key] }} aria-hidden="true" />
              {METHOD_LABELS[key].split(' (')[0]}
            </button>
          ))}
        </div>
        <SeriesPlot firstDay={first} days={days} lines={lines} label={PGE.actualLabel(spec.station)} />
      </div>

      <div className="pgx-chart">
        <h4 className="pge-h">{PGE.residualsTitle}</h4>
        <p className="pgx-note">{PGE.residualsText}</p>
        <ErrorDots firstDay={first} days={days} errors={errors} label={PGE.residualsLabel} color={COLORS.model} />
      </div>

      <div className="pgx-chart">
        <h4 className="pge-h">{PGE.histTitle}</h4>
        <p className="pgx-note">{PGE.histText}</p>
        <ErrorHistogram errors={errors} label={PGE.histLabel} color={COLORS.model} />
      </div>

      {coefficients.length > 0 && (
        <div className="pgx-chart">
          <h4 className="pge-h">{PGE.coefTitle}</h4>
          <p className="pgx-note">{PGE.coefText}</p>
          <BarRows items={coefficients} label={PGE.coefTitle} color="#2a78d6" negativeColor="#eb6834" unit="µg/m³" signedValues />
        </div>
      )}

      <div className="pgx-chart">
        <h4 className="pge-h">
          {PGE.importanceTitle}{' '}
          <InfoPopover title={PGE.importanceCaveatTitle} short={PGE.importanceShort} more={PGE.importanceMore} />
        </h4>
        <p className="pgx-hint pgc-nocause">
          <strong>{PGE.noCause}</strong> {PGE.importanceNote}
        </p>
        <BarRows items={importance} label={PGE.importanceTitle} color="#6250d6" unit={PGE.importanceAxis} />
      </div>

      <p className="pgx-note">
        <strong>{PGE.limitsTitle}:</strong> {PGE.limitsShort}{' '}
        <InfoPopover title={PGE.limitsTitle} short={PGE.limitsShort} more={PGE.limitsMore} />
      </p>
    </section>
  )
}
