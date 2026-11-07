import { useEffect, useState } from 'react'
import './App.css'

const MAP_W = 3000
const MAP_H = 1998
const SAFE_H = 1560
const SAFE_CY = 980

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

function useAspect(): number {
  const [aspect, setAspect] = useState(
    () => window.innerWidth / window.innerHeight,
  )
  useEffect(() => {
    const onResize = () => setAspect(window.innerWidth / window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return aspect
}

export default function App() {
  const [selected, setSelected] = useState<Station | null>(null)
  const aspect = useAspect()

  return (
    <div className="app">
      <svg
        className="board"
        viewBox={viewBoxFor(aspect)}
        role="img"
        aria-label="Map of central London with five air-quality stations"
      >
        <image href="/london_map.svg" x={0} y={0} width={MAP_W} height={MAP_H} />
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

      <div className="sign" aria-hidden="true">
        <div className="pc">N1 · Air quality</div>
        <div className="nm">
          London NO₂
          <br />
          Forecasting
        </div>
      </div>

      <div className="attr">
        Map © OpenStreetMap contributors (ODbL) · Data: London Air Quality
        Network, Imperial College London
      </div>
    </div>
  )
}