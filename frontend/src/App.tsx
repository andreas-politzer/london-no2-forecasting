import { useState } from 'react'
import './App.css'

const MAP_W = 3000
const MAP_H = 1998

type Station = {
  code: string
  lat: number
  lon: number
  x: number
  y: number
}

const STATIONS: Station[] = [
  { code: 'EA6', lat: 51.5309, lon: -0.2925, x: 265, y: 350 },
  { code: 'KC1', lat: 51.521, lon: -0.2135, x: 1435, y: 585 },
  { code: 'MY1', lat: 51.5225, lon: -0.1546, x: 2307, y: 549 },
  { code: 'BL0', lat: 51.5223, lon: -0.1258, x: 2733, y: 554 },
  { code: 'RI2', lat: 51.4762, lon: -0.2304, x: 1185, y: 1651 },
]

export default function App() {
  const [selected, setSelected] = useState<Station | null>(null)

  return (
    <div className="app">
      <header className="bar">
        <h1 className="title">London NO₂ Forecasting</h1>
        <p className="info">
          {selected
            ? `Station ${selected.code} · ${selected.lat.toFixed(4)}° N, ${Math.abs(selected.lon).toFixed(4)}° W`
            : 'Click a station'}
        </p>
      </header>
      <main className="stage-wrap">
        <div className="stage">
          <img
            className="map"
            src="/london_map.svg"
            alt="Map of central London with five air-quality stations"
          />
          <svg className="layer" viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
            {STATIONS.map((s) => (
              <g
                key={s.code}
                className={`station${selected?.code === s.code ? ' selected' : ''}`}
                transform={`translate(${s.x} ${s.y})`}
                role="button"
                tabIndex={0}
                aria-label={`Station ${s.code}`}
                onClick={() => setSelected(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelected(s)
                }}
              >
                <g className="pin">
                  <circle className="dot" r={34} />
                  <text className="code" y={-58}>
                    {s.code}
                  </text>
                </g>
              </g>
            ))}
          </svg>
        </div>
      </main>
    </div>
  )
}