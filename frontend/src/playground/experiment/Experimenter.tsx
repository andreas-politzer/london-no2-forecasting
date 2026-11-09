import { useMemo, useState } from 'react'
import InfoPopover from '../../InfoPopover'
import type { Engine } from '../adapter'
import { runExperiment, type ExperimentResult } from '../modelcore/experiment'
import { featureStatus, lockedFeatures, setMode, toSpec, toggleFeature } from '../modelcore/config'
import { HORIZONS, PARAM_LIMITS, RIDGE_CHOICES, MODEL_KINDS, effectiveHorizon } from '../modelcore/types'
import { defaultModelConfig, type ModelConfig, type StateContext } from '../state'
import type { PlaygroundSession } from '../useSession'
import { FEATURE_GROUPS, FEATURE_LABELS, MODEL_KIND_LABELS, PGE, errorText, problemText } from './expLabels'
import { periodProblem, spanShare } from './experimentLogic'
import Results from './Results'
import { clamp } from '../charts/svg'

type Props = {
  engine: Engine
  session: PlaygroundSession
  ctx: StateContext
  stationList: { code: string; place: string }[]
}

type Outcome = { key: string; result: ExperimentResult }

function PeriodBar({ ctx, train, test }: { ctx: StateContext; train: [string, string]; test: [string, string] }) {
  const t = spanShare(ctx.firstDay, ctx.lastDay, train[0], train[1])
  const e = spanShare(ctx.firstDay, ctx.lastDay, test[0], test[1])
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`
  return (
    <div className="pge-bar" aria-hidden="true">
      <span className="pge-bar-train" style={{ left: pct(t[0]), width: pct(Math.max(0.004, t[1] - t[0])) }} />
      <span className="pge-bar-test" style={{ left: pct(e[0]), width: pct(Math.max(0.004, e[1] - e[0])) }} />
    </div>
  )
}

// "Experimentieren": build a small model, run it, read the result. The mode
// (explain / forecast) decides what the calculation may use; the person's
// selection is never changed by it.
export default function Experimenter({ engine, session, ctx, stationList }: Props) {
  const { state, update } = session
  const config: ModelConfig = state.model ?? defaultModelConfig(ctx)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)

  const station = config.station ?? state.stations[0] ?? ctx.defaultStation
  const horizon = effectiveHorizon(config)
  const spec = useMemo(() => toSpec(config, station), [config, station])
  const specKey = useMemo(() => JSON.stringify(spec), [spec])
  const status = useMemo(() => featureStatus(config), [config])
  const locked = lockedFeatures(config)
  const activeCount = spec.features.length
  const problem = periodProblem(config.trainPeriod, config.testPeriod)

  const change = (patch: Partial<ModelConfig>) =>
    update((previous) => ({ ...previous, model: { ...(previous.model ?? defaultModelConfig(ctx)), ...patch } }))
  const setPeriod = (which: 'trainPeriod' | 'testPeriod', index: 0 | 1, value: string) => {
    if (!value) return
    const next: [string, string] = [...config[which]]
    next[index] = value < ctx.firstDay ? ctx.firstDay : value > ctx.lastDay ? ctx.lastDay : value
    change({ [which]: next })
  }

  const run = () => {
    setBusy(true)
    window.setTimeout(() => {
      setOutcome({ key: specKey, result: runExperiment(engine, spec) })
      setBusy(false)
    }, 30)
  }

  const canRun = !busy && problem === null && activeCount > 0
  const done = outcome && outcome.result.ok ? outcome.result : null

  return (
    <div className="pge">
      <p className="pgx-hint">
        {PGE.intro}{' '}
        <InfoPopover title={PGE.taskTitle} short={PGE.taskShort} more={PGE.taskMore} />
      </p>
      <p className="pgx-hint pgc-nocause">
        <strong>{PGE.noCause}</strong> {PGE.topNote}
      </p>

      <fieldset className="pgx-fieldset">
        <legend>{PGE.modeTitle}</legend>
        <div className="pge-modes" role="group" aria-label={PGE.modeTitle}>
          <button
            type="button"
            className="pge-mode pge-mode-explain"
            aria-pressed={config.mode === 'explain'}
            onClick={() => change(setMode(config, 'explain'))}
          >
            <strong>{PGE.explain}</strong>
            <span>{PGE.explainText}</span>
          </button>
          <button
            type="button"
            className="pge-mode pge-mode-forecast"
            aria-pressed={config.mode === 'forecast'}
            onClick={() => change(setMode(config, 'forecast'))}
          >
            <strong>{PGE.forecast}</strong>
            <span>{PGE.forecastText}</span>
          </button>
        </div>
      </fieldset>

      <div className="pge-grid">
        <label className="pgx-field">
          <span className="pgx-field-label">{PGE.stationLabel}</span>
          <select value={station} onChange={(event) => change({ station: event.target.value })}>
            {stationList.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}, {s.place}
              </option>
            ))}
          </select>
        </label>
        <label className="pgx-field">
          <span className="pgx-field-label">{PGE.kindLabel}</span>
          <select value={config.kind} onChange={(event) => change({ kind: event.target.value as ModelConfig['kind'] })}>
            {MODEL_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {MODEL_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <div className="pgx-field">
          <span className="pgx-field-label">{PGE.horizonLabel}</span>
          {config.mode === 'explain' ? (
            <span className="pgx-note">{PGE.horizonExplain}</span>
          ) : (
            <div className="pgx-chips" role="group" aria-label={PGE.horizonLabel}>
              {HORIZONS.map((h) => (
                <button key={h} type="button" className="pgx-chip" aria-pressed={config.horizon === h} onClick={() => change({ horizon: h })}>
                  {PGE.horizonDays(h)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <fieldset className="pgx-fieldset">
        <legend>{PGE.paramsTitle}</legend>
        {config.kind === 'linear' ? (
          <label className="pgx-field">
            <span className="pgx-field-label">{PGE.ridge}</span>
            <select value={config.params.ridge} onChange={(event) => change({ params: { ...config.params, ridge: Number(event.target.value) } })}>
              {RIDGE_CHOICES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <span className="pgx-note">{PGE.ridgeHint}</span>
          </label>
        ) : (
          <div className="pge-grid">
            {(
              [
                ['trees', PGE.trees, 1],
                ['depth', PGE.depth, 1],
                ['rate', PGE.rate, 0.01],
              ] as const
            ).map(([key, label, step]) => (
              <label key={key} className="pgx-field">
                <span className="pgx-field-label">{label}</span>
                <input
                  type="number"
                  className="pge-number"
                  min={PARAM_LIMITS[key][0]}
                  max={PARAM_LIMITS[key][1]}
                  step={step}
                  value={config.params[key]}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    if (!Number.isFinite(value)) return
                    change({ params: { ...config.params, [key]: clamp(value, PARAM_LIMITS[key][0], PARAM_LIMITS[key][1]) } })
                  }}
                />
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="pgx-fieldset">
        <legend>{PGE.featuresTitle}</legend>
        <p className="pgx-note">{PGE.featuresHint}</p>
        {FEATURE_GROUPS.map((group) => (
          <div key={group.title} className="pge-group">
            <span className="pgc-row-label">{group.title}</span>
            <div className="pgx-chips">
              {group.features.map((feature) => {
                const item = status.find((entry) => entry.feature === feature)
                if (!item) return null
                const lockedNow = item.problem !== null
                return (
                  <button
                    key={feature}
                    type="button"
                    className={`pgx-chip${lockedNow ? ' pge-chip-locked' : ''}`}
                    aria-pressed={item.selected}
                    aria-disabled={lockedNow}
                    disabled={lockedNow}
                    title={item.problem ? problemText(item.problem, horizon) : undefined}
                    onClick={() => change(toggleFeature(config, feature))}
                  >
                    {FEATURE_LABELS[feature] ?? feature}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <p className="pgx-hint">{PGE.activeCount(activeCount)}</p>
        <div className="pge-locked" role="status">
          <strong>{PGE.lockedTitle}</strong>
          {locked.length === 0 ? (
            <span className="pgx-note">{PGE.lockedNone}</span>
          ) : (
            <ul>
              {locked.map((entry) => (
                <li key={entry.feature}>
                  <strong>{FEATURE_LABELS[entry.feature] ?? entry.feature}:</strong> {problemText(entry.problem, horizon)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </fieldset>

      <fieldset className="pgx-fieldset">
        <legend>{PGE.periodsTitle}</legend>
        <p className="pgx-note">{PGE.periodHint}</p>
        <div className="pge-grid">
          {(
            [
              ['trainPeriod', PGE.train, 'pge-key-train'],
              ['testPeriod', PGE.test, 'pge-key-test'],
            ] as const
          ).map(([which, label, keyClass]) => (
            <div key={which} className="pgx-field">
              <span className="pgx-field-label">
                <span className={`pge-key ${keyClass}`} aria-hidden="true" />
                {label}
              </span>
              <div className="pge-dates">
                <label>
                  <span className="pgx-note">{PGE.from}</span>{' '}
                  <input type="date" min={ctx.firstDay} max={ctx.lastDay} value={config[which][0]} onChange={(event) => setPeriod(which, 0, event.target.value)} />
                </label>
                <label>
                  <span className="pgx-note">{PGE.to}</span>{' '}
                  <input type="date" min={ctx.firstDay} max={ctx.lastDay} value={config[which][1]} onChange={(event) => setPeriod(which, 1, event.target.value)} />
                </label>
              </div>
            </div>
          ))}
        </div>
        <PeriodBar ctx={ctx} train={config.trainPeriod} test={config.testPeriod} />
        {problem && (
          <p className="pgx-hint pge-warn" role="alert">
            {problem === 'order' ? PGE.periodOrder : PGE.periodOverlap}
          </p>
        )}
      </fieldset>

      <div className="pge-run">
        <button type="button" className="pgx-btn pgx-btn-primary" disabled={!canRun} onClick={run}>
          {busy ? PGE.running : PGE.run}
        </button>
        {activeCount === 0 && <span className="pgx-note">{errorText({ code: 'no-features' })}</span>}
      </div>

      {outcome === null && <p className="pgx-note">{PGE.notRunYet}</p>}
      {outcome && !outcome.result.ok && (
        <p className="pgx-hint pge-warn" role="alert">
          {errorText(outcome.result.error)}
        </p>
      )}
      {done && <Results engine={engine} result={done} stale={outcome?.key !== specKey} />}
    </div>
  )
}
