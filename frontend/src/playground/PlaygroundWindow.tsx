import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { PLAYGROUND, UI } from '../texts'
import { usePlayground } from './data'
import { buildIntro } from './intro/introContent'
import { introFactsFrom } from './intro/introFacts'
import IntroDialog from './intro/IntroDialog'
import Workspace from './Workspace'

type Props = {
  stations: { code: string; place: string }[]
  initialStation: string
  onClose: () => void
}

// The dialog frame: focus handling and closing. Everything else lives in
// Workspace, which only mounts once the data of all stations is loaded.
export default function PlaygroundWindow({ stations, initialStation, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const infoRef = useRef<HTMLButtonElement>(null)
  const [introOpen, setIntroOpen] = useState(false)
  const codes = useMemo(() => stations.map((s) => s.code), [stations])
  const state = usePlayground(codes)
  const intro = useMemo(
    () => (state.status === 'ready' ? buildIntro(introFactsFrom(state.data, stations.length)) : null),
    [state, stations.length],
  )

  function closeIntro() {
    setIntroOpen(false)
    infoRef.current?.focus()
  }

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => opener?.focus()
  }, [])

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      // An open info popover closes itself first.
      if (rootRef.current?.querySelector('.info-panel')) return
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !rootRef.current) return
    const focusable = rootRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
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
          <div className="pgw-titlerow">
            <h2 id="pgw-title" className="panel-title">
              {PLAYGROUND.title}
            </h2>
            <button
              ref={infoRef}
              type="button"
              className="pgw-info"
              aria-haspopup="dialog"
              aria-label={PLAYGROUND.introOpen}
              disabled={intro === null}
              onClick={() => setIntroOpen(true)}
            >
              <span className="pgw-info-i" aria-hidden="true">
                i
              </span>
              <span className="pgw-info-text">{PLAYGROUND.introButton}</span>
            </button>
          </div>
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

      {introOpen && intro && <IntroDialog intro={intro} onClose={closeIntro} />}

      <div className="pgw-body">
        {state.status === 'loading' && <p className="tab-note">{UI.loading}</p>}
        {state.status === 'error' && <p className="tab-note">{PLAYGROUND.loadError}</p>}
        {state.status === 'ready' && (
          <Workspace data={state.data} stationList={stations} initialStation={initialStation} />
        )}
      </div>
    </div>
  )
}
