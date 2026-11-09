import { useEffect, useState } from 'react'

export type Values = (number | null)[]

export type WeatherKey =
  | 'temperature_2m_mean'
  | 'temperature_2m_max'
  | 'temperature_2m_min'
  | 'wind_speed_10m_max'
  | 'wind_speed_10m_mean'
  | 'wind_direction_10m_dominant'
  | 'precipitation_sum'
  | 'snowfall_sum'
  | 'relative_humidity_2m_mean'

export type Calendar = {
  first_day: string
  n: number
  weekday: number[]
  holiday: number[]
  holiday_names: Record<string, string>
  corona: number[]
  ulez: number[]
  events: {
    corona_period: [string, string]
    lockdowns: [string, string][]
    ulez_starts: string[]
  }
}

export type WeatherFile = {
  first_day: string
  n: number
  source: string
  note: string
  grid_cell: [number, number]
  units: Record<string, string>
  series: Record<WeatherKey, number[]>
}

export type PlaygroundMeta = {
  days: number
  first_day: string
  last_day: string
  measured_days: Record<string, number>
  holidays: { package: string; subdivision: string; count: number }
  weather_station_spread: Record<string, number>
}

type StationFile = {
  station: string
  first_day: string
  n: number
  no2: Values
}

export type PlaygroundData = {
  dates: string[]
  calendar: Calendar
  weather: WeatherFile
  meta: PlaygroundMeta
  no2: Record<string, Values>
}

export type PlaygroundState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: PlaygroundData }

const BASE = import.meta.env.BASE_URL
const cache = new Map<string, Promise<unknown>>()

function cached<T>(file: string): Promise<T> {
  let promise = cache.get(file)
  if (!promise) {
    promise = fetch(`${BASE}data/playground/${file}`).then((response) => {
      if (!response.ok) throw new Error(file)
      return response.json() as Promise<unknown>
    })
    cache.set(file, promise)
    promise.catch(() => cache.delete(file))
  }
  return promise as Promise<T>
}

export function dayList(first: string, n: number): string[] {
  const start = Date.UTC(
    Number(first.slice(0, 4)),
    Number(first.slice(5, 7)) - 1,
    Number(first.slice(8, 10)),
  )
  return Array.from({ length: n }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10),
  )
}

export async function loadPlayground(codes: string[]): Promise<PlaygroundData> {
  const [calendar, weather, meta] = await Promise.all([
    cached<Calendar>('calendar.json'),
    cached<WeatherFile>('weather.json'),
    cached<PlaygroundMeta>('playground_meta.json'),
  ])
  const files = await Promise.all(
    codes.map((code) => cached<StationFile>(`no2_${code}.json`)),
  )
  const n = calendar.n
  if (weather.n !== n || meta.days !== n) throw new Error('axis mismatch')
  const no2: Record<string, Values> = {}
  for (const file of files) {
    if (file.n !== n || file.no2.length !== n) throw new Error('axis mismatch')
    no2[file.station] = file.no2
  }
  return { dates: dayList(calendar.first_day, n), calendar, weather, meta, no2 }
}

export function usePlayground(codes: string[]): PlaygroundState {
  const key = codes.join(',')
  const [state, setState] = useState<{
    key: string
    result: PlaygroundState
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadPlayground(key.split(','))
      .then((data) => {
        if (!cancelled) setState({ key, result: { status: 'ready', data } })
      })
      .catch(() => {
        if (!cancelled) setState({ key, result: { status: 'error' } })
      })
    return () => {
      cancelled = true
    }
  }, [key])

  return state && state.key === key ? state.result : { status: 'loading' }
}