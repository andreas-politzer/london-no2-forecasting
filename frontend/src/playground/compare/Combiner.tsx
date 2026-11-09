import { useMemo } from 'react'
import type { Engine } from '../adapter'
import InfoPopover from '../../InfoPopover'
import { selectDays } from '../engine'
import { countSelected } from '../filter/filterLogic'
import FilterPanel from '../filter/FilterPanel'
import { PGC, PGU } from '../labels'
import {
  defaultCompare,
  defaultSelection,
  type CompareConfig,
  type DaySelection,
  type StateContext,
} from '../state'
import type { PlaygroundSession } from '../useSession'
import CompareResult from './CompareResult'
import { GROUP_COLORS, compareStats, conditionToSelection, describeCondition, splitGroups } from './compareLogic'
import ConditionEditor from './ConditionEditor'
import { MIN_CELL_DAYS } from '../stats'

type Props = {
  engine: Engine
  session: PlaygroundSession
  ctx: StateContext
  stationList: { code: string; place: string }[]
}

// "Kombinieren": the day filter next to two groups of days built from
// switches, and the comparison of their NO2.
export default function Combiner({ engine, session, ctx, stationList }: Props) {
  const { state, update } = session
  const compare: CompareConfig = state.compare ?? defaultCompare()
  const thresholds = engine.input.thresholds

  const mask = useMemo(
    () => selectDays(engine.input, state.selection, state.stations, engine.axis),
    [engine, state.selection, state.stations],
  )
  const split = useMemo(() => splitGroups(engine, mask, compare), [engine, mask, compare])
  const results = useMemo(
    () => compareStats(engine, split, state.stations),
    [engine, split, state.stations],
  )
  const places = useMemo(
    () => Object.fromEntries(stationList.map((s) => [s.code, s.place])),
    [stationList],
  )
  const asSelection = useMemo(
    () => conditionToSelection(state.selection, compare.a, thresholds),
    [state.selection, compare.a, thresholds],
  )

  const setCompare = (next: CompareConfig) => update((previous) => ({ ...previous, compare: next }))
  const changeSelection = (selection: DaySelection) =>
    update((previous) => ({ ...previous, selection }))

  const selectedDays = countSelected(mask)

  return (
    <div className="pgx-explorer">
      <FilterPanel
        selection={state.selection}
        limits={{ first: ctx.firstDay, last: ctx.lastDay }}
        selectedDays={selectedDays}
        totalDays={engine.input.days}
        onChange={changeSelection}
        onReset={() => changeSelection(defaultSelection(ctx))}
      />

      <div className="pgx-area">
        <p className="pgx-hint">
          {PGC.intro}{' '}
          <InfoPopover title={PGC.caveatTitle} short={PGC.caveatShort} more={PGC.caveatMore} />
        </p>
        <p className="pgx-note">{PGC.switchHint}</p>
        <p className="pgx-hint pgc-nocause">
          <strong>{PGC.noCause}</strong> {PGC.noCauseText}
        </p>

        <div className="pgc-groups">
          <ConditionEditor
            title={PGC.groupA}
            swatch={GROUP_COLORS.a}
            condition={compare.a}
            thresholds={thresholds}
            onChange={(a) => setCompare({ ...compare, a })}
          />
          <div className="pgc-b">
            <div className="pgx-chips" role="group" aria-label={PGC.bLabel}>
              <span className="pgx-field-label">{PGC.bLabel}</span>
              <button
                type="button"
                className="pgx-chip"
                aria-pressed={compare.b === null}
                onClick={() => setCompare({ ...compare, b: null })}
              >
                {PGC.bRest}
              </button>
              <button
                type="button"
                className="pgx-chip"
                aria-pressed={compare.b !== null}
                onClick={() => setCompare({ ...compare, b: compare.b ?? {} })}
              >
                {PGC.bOwn}
              </button>
            </div>
            {compare.b !== null && (
              <ConditionEditor
                title={PGC.groupB}
                swatch={GROUP_COLORS.b}
                condition={compare.b}
                thresholds={thresholds}
                onChange={(b) => setCompare({ ...compare, b })}
              />
            )}
          </div>
        </div>

        <p className="pgx-marking">
          <span>
            <strong>{PGC.groupA}:</strong> {describeCondition(compare.a)}
          </span>
          <span>
            <strong>{PGC.groupB}:</strong>{' '}
            {compare.b === null ? PGC.bRest : describeCondition(compare.b)}
          </span>
        </p>
        <p className="pgx-note">
          {PGC.scope(selectedDays, engine.input.days)}{' '}
          {PGC.groupDays(PGC.groupA, countSelected(split.a))}, {PGC.groupDays(PGC.groupB, countSelected(split.b))}.
        </p>
        {split.overlap > 0 && <p className="pgx-note">{PGC.overlap(split.overlap)}</p>}

        <div className="pgx-marking">
          <button
            type="button"
            className="pgx-btn"
            disabled={asSelection === null || countSelected(mask) === 0}
            title={PGC.applyHint}
            onClick={() => {
              if (!asSelection) return
              update((previous) => ({ ...previous, selection: asSelection, mode: 'explore' }))
            }}
          >
            {PGC.apply}
          </button>
          {asSelection === null ? (
            <span className="pgx-note">{PGC.applyCannot}</span>
          ) : (
            <span className="pgx-note">{PGC.applyKeeps}</span>
          )}
        </div>

        {state.stations.length === 0 ? (
          <p className="pgx-note">{PGC.noStations}</p>
        ) : selectedDays === 0 ? (
          <p className="pgx-count-empty">{PGU.noDays}</p>
        ) : (
          <CompareResult results={results} places={places} minValues={MIN_CELL_DAYS} />
        )}
      </div>
    </div>
  )
}
