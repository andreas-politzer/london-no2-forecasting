import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import './App.css'
import HistoryTab from './HistoryTab'
import ModelsTab from './ModelsTab'
import { UI } from './texts'

const MAP_W = 3000
const MAP_H = 1998
const SAFE_H = 1620
const SAFE_CY = 910

type Station = {
  code: string
  place: string
  authority: string
  type: string
  lat: number
  lon: number
  x: number
  y: number
}

type Tab = 'history' | 'models'

const STATIONS: Station[] = [
  {
    code: 'EA6',
    place: 'Hanger Lane Gyratory',
    authority: 'Ealing',
    type: 'Roadside',
    lat: 51.5309,
    lon: -0.2925,
    x: 265,
    y: 350,
  },
  {
    code: 'KC1',
    place: 'North Kensington',
    authority: 'Kensington and Chelsea',
    type: 'Urban Background',
    lat: 51.521,
    lon: -0.2135,
    x: 1435,
    y: 585,
  },
  {
    code: 'MY1',
    place: 'Marylebone Road',
    authority: 'Westminster',
    type: 'Kerbside',
    lat: 51.5225,
    lon: -0.1546,
    x: 2307,
    y: 549,
  },
  {
    code: 'BL0',
    place: 'Bloomsbury',
    authority: 'Camden',
    type: 'Urban Background',
    lat: 51.5223,
    lon: -0.1258,
    x: 2733,
    y: 554,
  },
  {
    code: 'RI2',
    place: 'Barnes Wetlands',
    authority: 'Richmond upon Thames',
    type: 'Suburban',
    lat: 51.4762,
    lon: -0.2304,
    x: 1185,
    y: 1651,
  },
]

const TABS: { id: Tab; label: string }[] = [
  { id: 'models', label: UI.tabModels },
  { id: 'history', label: UI.tabHistory },
]

function viewBoxFor(aspect: number): string {
  let w: number
  let h: number
  if (aspect >= MAP_W / SAFE_H) {
    h = SAFE_H
    w = h * aspect
  } else {
    w = MAP_W
    h = w / aspect
  }
  let y = SAFE_CY - h / 2
  if (h <= MAP_H) y = Math.min(Math.max(y, 0), MAP_H - h)
  const x = (MAP_W - w) / 2
  return `${x} ${y} ${w} ${h}`
}

function useAspect(ref: RefObject<HTMLElement | null>): number {
  const [aspect, setAspect] = useState(16 / 9)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      if (el.clientHeight > 0) setAspect(el.clientWidth / el.clientHeight)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return aspect
}

export default function App() {
  const [selected, setSelected] = useState<Station | null>(null)
  const [tab, setTab] = useState<Tab>('models')
  const [showSources, setShowSources] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const aspect = useAspect(mapRef)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
        setShowSources(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app${selected ? ' open' : ''}`}>
      <div className="map-area" ref={mapRef}>
        <svg
          className="board"
          viewBox={viewBoxFor(aspect)}
          role="img"
          aria-label="Karte des Londoner Zentrums mit fünf Luftmessstationen"
        >
          <image
            href={`${import.meta.env.BASE_URL}london_map.svg`}
            x={0}
            y={0}
            width={MAP_W}
            height={MAP_H}
          />
          {STATIONS.map((s) => (
            <g
              key={s.code}
              className={`station${selected?.code === s.code ? ' selected' : ''}`}
              transform={`translate(${s.x} ${s.y})`}
              role="button"
              tabIndex={0}
              aria-label={`Station ${s.code}, ${s.place}`}
              onClick={() => setSelected(s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setSelected(s)
              }}
            >
              <ellipse
                className="ring"
                cx={0}
                cy={-4}
                rx={78}
                ry={26}
                fill="none"
                stroke="#c23b2e"
                strokeWidth={9}
                opacity={0}
              />
              <ellipse cx={6} cy={4} rx={52} ry={14} fill="rgba(0,0,0,0.3)" />
              <g className="lift">
                <g transform="scale(1.55)">
                  <path
                    className="pawn-fill"
                    d="M-26 0C-26 -16 -14 -26 -9 -52H9C14 -26 26 -16 26 0Z"
                    stroke="#ffffff"
                    strokeWidth={3}
                  />
                  <ellipse cx={0} cy={-52} rx={16} ry={5} fill="#ffffff" />
                  <circle
                    className="pawn-fill"
                    cx={0}
                    cy={-70}
                    r={19}
                    stroke="#ffffff"
                    strokeWidth={3}
                  />
                  <rect
                    x={-34}
                    y={-128}
                    width={68}
                    height={34}
                    rx={8}
                    fill="#ffffff"
                    stroke="#1d2a4a"
                    strokeWidth={3}
                  />
                  <text
                    x={0}
                    y={-104}
                    textAnchor="middle"
                    fontFamily="'Barlow Semi Condensed', 'Arial Narrow', sans-serif"
                    fontWeight={700}
                    fontSize={25}
                    fill="#1d2a4a"
                  >
                    {s.code}
                  </text>
                </g>
              </g>
            </g>
          ))}
        </svg>

        <div className="sign" aria-hidden="true">
          <div className="pc">NW1 · Air quality</div>
          <div className="nm">
            London NO₂
            <br />
            Forecasting
          </div>
        </div>

        <button
          type="button"
          className="attr-btn"
          aria-expanded={showSources}
          onClick={() => setShowSources((open) => !open)}
        >
          Rechtliches &amp; Quellen
        </button>
        <div className="attr" hidden={!showSources}>
          Map ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap contributors
          </a>{' '}
          (ODbL). This information has been obtained from the{' '}
          <a
            href="https://www.imperial.ac.uk/school-public-health/environmental-research-group/"
            target="_blank"
            rel="noreferrer"
          >
            Environmental Research Group of Imperial College London
          </a>
          , using data from the{' '}
          <a href="https://www.londonair.org.uk" target="_blank" rel="noreferrer">
            London Air Quality Network
          </a>
          . This information is licensed under the terms of the{' '}
          <a
            href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/2/"
            target="_blank"
            rel="noreferrer"
          >
            Open Government Licence
          </a>
          .
          <span className="attr-legal">
            <a
              href={`${import.meta.env.BASE_URL}rechtliches.html#impressum`}
            >
              Impressum
            </a>
            {' · '}
            <a
              href={`${import.meta.env.BASE_URL}rechtliches.html#datenschutz`}
            >
              Datenschutz
            </a>
          </span>
        </div>
      </div>

      <aside className="panel" aria-label="Stationsdetails">
        {selected && (
          <>
            <header className="panel-head">
              <div>
                <h2 className="panel-title">
                  {selected.code} · {selected.place}
                </h2>
                <p className="panel-sub">
                  {selected.authority} · {selected.type}
                </p>
              </div>
              <button
                className="panel-close"
                onClick={() => setSelected(null)}
                aria-label="Stationsdetails schließen"
              >
                ×
              </button>
            </header>

            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className="tab"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="panel-body">
              {tab === 'models' ? (
                <ModelsTab code={selected.code} />
              ) : (
                <HistoryTab key={selected.code} code={selected.code} />
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}