import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  PLAYGROUND,
  UI,
  playgroundDays,
  playgroundMeasured,
} from '../texts'
import { usePlayground } from './data'

type Section = 'explore' | 'combine' | 'experiment'
const SECTIONS: Section[] = ['explore', 'combine', 'experiment']

type Props = {
  stations: { code: string; place: string }[]
  initialStation: string
  onClose: () => void
}

export default function PlaygroundWindow({
  stations,
  initialStation,
  onClose,
}: Props) {
  const [codes, setCodes] = useState<string[]>([initialStation])
  const [section, setSection] = useState<Section>('explore')
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const state = usePlayground(codes)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => opener?.focus()
  }, [])

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !rootRef.current) return
    const focusable = rootRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function toggle(code: string) {
    setCodes((current) => {
      const next = current.includes(code)
        ? current.filter((c) => c !== code)
        : [...current, code]
      if (next.length === 0) return current
      return stations.map((s) => s.code).filter((c) => next.includes(c))
    })
  }

  return (
    <div
      className="pgw"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pgw-title"
      ref={rootRef}
      onKeyDown={onKeyDown}
    >
      <header className="pgw-head">
        <div>
          <h2 id="pgw-title" className="panel-title">
            {PLAYGROUND.title}
          </h2>
          <p className="panel-sub">{PLAYGROUND.tagline}</p>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="panel-close"
          onClick={onClose}
          aria-label={PLAYGROUND.close}
        >
          ×
        </button>
      </header>

      <div className="pgw-bar">
        <span className="legend">{PLAYGROUND.stationsLabel}</span>
        <div
          className="pgw-stations"
          role="group"
          aria-label={PLAYGROUND.stationsLabel}
        >
          {stations.map((s) => (
            <button
              key={s.code}
              type="button"
              className="pgw-chip"
              aria-pressed={codes.includes(s.code)}
              title={s.place}
              onClick={() => toggle(s.code)}
            >
              {s.code}
            </button>
          ))}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {SECTIONS.map((id) => (
          <button
            key={id}
            type="button"
            className="tab"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
          >
            {PLAYGROUND.sections[id]}
          </button>
        ))}
      </div>

      <div className="pgw-body">
        {state.status === 'loading' && (
          <p className="tab-note">{UI.loading}</p>
        )}
        {state.status === 'error' && (
          <p className="tab-note">{PLAYGROUND.loadError}</p>
        )}
        {state.status === 'ready' && (
          <>
            <p className="tab-note">{PLAYGROUND.soon}</p>

            <section>
              <h3 className="block-title">{PLAYGROUND.examplesTitle}</h3>
              <ul className="pgw-examples">
                {PLAYGROUND.examples.map((example) => (
                  <li key={example.title} className="pgw-card">
                    <h4>{example.title}</h4>
                    <p>{example.text}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="block-title">{PLAYGROUND.dataTitle}</h3>
              <div className="pgw-data">
                <div>
                  {playgroundDays(
                    state.data.meta.days,
                    state.data.meta.first_day,
                    state.data.meta.last_day,
                  )}
                </div>
                {codes.map((code) => (
                  <div key={code}>
                    {playgroundMeasured(
                      code,
                      state.data.meta.measured_days[code] ?? 0,
                      state.data.meta.days,
                    )}
                  </div>
                ))}
                <div>
                  {PLAYGROUND.holidaysLine(state.data.meta.holidays.count)}
                </div>
                <div>{PLAYGROUND.weatherNote}</div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}