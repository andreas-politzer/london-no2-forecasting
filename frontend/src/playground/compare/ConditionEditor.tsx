import type { Thresholds } from '../data'
import { groupLabel } from '../labels'
import { CONDITION_GROUPINGS, CONDITION_KEYS, type Condition } from '../state'
import { conditionGroupingLabel, keyHint, toggleKey } from './compareLogic'

type Props = {
  title: string
  swatch: string
  condition: Condition
  thresholds: Thresholds
  onChange: (condition: Condition) => void
}

// The switches of one group: a row of chips per class family. A click adds or
// removes a class; nothing chosen in a row means "any".
export default function ConditionEditor({ title, swatch, condition, thresholds, onChange }: Props) {
  return (
    <fieldset className="pgx-fieldset pgc-editor">
      <legend>
        <span className="pgx-swatch" style={{ background: swatch }} aria-hidden="true" /> {title}
      </legend>
      {CONDITION_GROUPINGS.map((grouping) => (
        <div className="pgc-row" key={grouping}>
          <span className="pgc-row-label">{conditionGroupingLabel(grouping)}</span>
          <div className="pgx-chips">
            {CONDITION_KEYS[grouping].map((key) => (
              <button
                key={key}
                type="button"
                className="pgx-chip"
                aria-pressed={condition[grouping]?.includes(key) ?? false}
                title={keyHint(grouping, key, thresholds)}
                onClick={() => onChange(toggleKey(condition, grouping, key))}
              >
                {groupLabel(grouping, key)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  )
}
