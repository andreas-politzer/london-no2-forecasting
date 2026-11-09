import { useMemo, useState } from 'react'
import type { Engine } from './adapter'
import ChartArea from './charts/ChartArea'
import { highlightMask, type Highlight } from './charts/highlight'
import { selectDays } from './engine'
import { countSelected } from './filter/filterLogic'
import FilterPanel from './filter/FilterPanel'
import { defaultSelection, type DaySelection, type StateContext } from './state'
import type { PlaygroundSession } from './useSession'

type Props = {
  engine: Engine
  session: PlaygroundSession
  ctx: StateContext
  stationList: { code: string; place: string }[]
}

// "Erkunden": the day filter next to the charts. The highlight lives here: it
// is transient (never saved) and is dropped whenever the filter changes.
export default function Explorer({ engine, session, ctx, stationList }: Props) {
  const { state, update } = session
  const [highlight, setHighlight] = useState<Highlight | null>(null)

  const mask = useMemo(
    () => selectDays(engine.input, state.selection, state.stations, engine.axis),
    [engine, state.selection, state.stations],
  )
  const marked = useMemo(
    () => (highlight ? highlightMask(engine, state.selection, state.stations, highlight) : null),
    [engine, state.selection, state.stations, highlight],
  )

  function changeSelection(selection: DaySelection) {
    update((previous) => ({ ...previous, selection }))
    setHighlight(null)
  }

  return (
    <div className="pgx-explorer">
      <FilterPanel
        selection={state.selection}
        limits={{ first: ctx.firstDay, last: ctx.lastDay }}
        selectedDays={countSelected(mask)}
        totalDays={engine.input.days}
        onChange={changeSelection}
        onReset={() => changeSelection(defaultSelection(ctx))}
      />
      <ChartArea
        engine={engine}
        state={state}
        update={update}
        mask={mask}
        highlight={highlight}
        highlightMask={marked}
        onHighlight={setHighlight}
        onApplyHighlight={changeSelection}
        stationList={stationList}
      />
    </div>
  )
}
