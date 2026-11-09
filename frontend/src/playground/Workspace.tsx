import { useMemo, useState } from 'react'
import { PLAYGROUND, playgroundDays, playgroundMeasured } from '../texts'
import { buildEngine } from './adapter'
import { toggleStation } from './charts/chartActions'
import Combiner from './compare/Combiner'
import Experimenter from './experiment/Experimenter'
import { EXAMPLES, applyExample } from './examples'
import type { PlaygroundData } from './data'
import Explorer from './Explorer'
import { PGU, repairLabel } from './labels'
import SessionBar from './SessionBar'
import { MODES, type StateContext } from './state'
import type { Notice } from './useSession'
import { usePlaygroundSession } from './useSession'
import './playground.css'

type Props = {
  data: PlaygroundData
  stationList: { code: string; place: string }[]
  initialStation: string
}

function noticeText(notice: Notice): string {
  if (notice.kind === 'share-broken') return PGU.noticeBroken
  if (notice.kind === 'share-version') return PGU.noticeVersion
  return PGU.noticeRepaired(notice.repairs.map(repairLabel).join(', '))
}

// Everything inside the window once the data is loaded: session, engine,
// station switch, the three modes.
export default function Workspace({ data, stationList, initialStation }: Props) {
  const ctx = useMemo<StateContext>(
    () => ({
      stations: stationList.map((s) => s.code),
      defaultStation: initialStation,
      firstDay: data.meta.first_day,
      lastDay: data.meta.last_day,
    }),
    [stationList, initialStation, data.meta.first_day, data.meta.last_day],
  )
  const session = usePlaygroundSession(ctx)
  const engine = useMemo(() => buildEngine(data), [data])
  const { state, update } = session
  const [loaded, setLoaded] = useState<string | null>(null)

  return (
    <>
      {session.notice && (
        <div className="pgx-notice" role="status">
          <span>{noticeText(session.notice)}</span>
          <button type="button" className="pgx-btn" onClick={session.dismissNotice}>
            {PGU.noticeClose}
          </button>
        </div>
      )}

      <SessionBar session={session} />

      <div className="pgw-bar">
        <span className="legend">{PLAYGROUND.stationsLabel}</span>
        <div className="pgw-stations" role="group" aria-label={PLAYGROUND.stationsLabel}>
          {stationList.map((s) => (
            <button
              key={s.code}
              type="button"
              className="pgw-chip"
              aria-pressed={state.stations.includes(s.code)}
              title={s.place}
              onClick={() =>
                update((previous) => ({
                  ...previous,
                  stations: toggleStation(previous.stations, s.code, ctx.stations),
                }))
              }
            >
              {s.code}
            </button>
          ))}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {MODES.map((id) => (
          <button
            key={id}
            type="button"
            className="tab"
            role="tab"
            aria-selected={state.mode === id}
            onClick={() => update((previous) => ({ ...previous, mode: id }))}
          >
            {PLAYGROUND.sections[id]}
          </button>
        ))}
      </div>

      {state.mode === 'explore' ? (
        <Explorer engine={engine} session={session} ctx={ctx} stationList={stationList} />
      ) : state.mode === 'combine' ? (
        <Combiner engine={engine} session={session} ctx={ctx} stationList={stationList} />
      ) : (
        <Experimenter engine={engine} session={session} ctx={ctx} stationList={stationList} />
      )}

      <section>
        <h3 className="block-title">{PLAYGROUND.examplesTitle}</h3>
        <p className="pgx-note">{PLAYGROUND.examplesNote}</p>
        <ul className="pgw-examples">
          {EXAMPLES.map((example) => (
            <li key={example.id} className="pgw-card">
              <h4>{example.title}</h4>
              <p>{example.text}</p>
              <button
                type="button"
                className="pgx-btn"
                onClick={() => {
                  session.replace(applyExample(ctx, example))
                  setLoaded(example.title)
                }}
              >
                {PLAYGROUND.examplesLoad}
              </button>
            </li>
          ))}
        </ul>
        {loaded && (
          <p className="pgx-hint" role="status">
            {PLAYGROUND.examplesLoaded(loaded)}
          </p>
        )}
      </section>

      <section>
        <h3 className="block-title">{PLAYGROUND.dataTitle}</h3>
        <div className="pgw-data">
          <div>{playgroundDays(data.meta.days, data.meta.first_day, data.meta.last_day)}</div>
          {state.stations.map((code) => (
            <div key={code}>
              {playgroundMeasured(code, data.meta.measured_days[code] ?? 0, data.meta.days)}
            </div>
          ))}
          <div>{PLAYGROUND.holidaysLine(data.meta.holidays.count)}</div>
          <details className="pgw-weather">
            <summary>{PLAYGROUND.weatherNote}</summary>
            <p>
              {PLAYGROUND.weatherMore(
                data.weather.grid_cell,
                data.meta.weather_station_spread.temperature_2m_mean ?? 0,
                data.meta.weather_station_spread.relative_humidity_2m_mean ?? 0,
              )}
            </p>
          </details>
        </div>
      </section>
    </>
  )
}
