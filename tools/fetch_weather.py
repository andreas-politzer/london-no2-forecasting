"""Download daily weather per station from the Open-Meteo archive API.

One request per station, using the station coordinates. Daily values are
in GMT, matching the GMT days of the air-quality data. The raw responses
are stored unchanged in data/raw/weather/ (git-ignored) together with a
manifest that records the grid cell actually used for each station.

Data: Open-Meteo (CC BY 4.0), based on Copernicus ERA5 reanalysis.
Standard library only. Run from the project root:
  python tools/fetch_weather.py
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIONS = ROOT / "frontend" / "public" / "data" / "stations.json"
OUT = ROOT / "data" / "raw" / "weather"

START = date(2010, 1, 1)
END = date(2026, 10, 31)
URL = "https://archive-api.open-meteo.com/v1/archive"
MODEL = "era5"

DAILY_UNITS = {
    "temperature_2m_mean": "°C",
    "temperature_2m_max": "°C",
    "temperature_2m_min": "°C",
    "wind_speed_10m_max": "km/h",
    "wind_speed_10m_mean": "km/h",
    "wind_direction_10m_dominant": "°",
    "precipitation_sum": "mm",
    "snowfall_sum": "cm",
    "relative_humidity_2m_mean": "%",
}


class FetchError(Exception):
    pass


def request(lat: float, lon: float) -> bytes:
    query = urllib.parse.urlencode({
        "latitude": f"{lat:.5f}",
        "longitude": f"{lon:.5f}",
        "start_date": START.isoformat(),
        "end_date": END.isoformat(),
        "daily": ",".join(DAILY_UNITS),
        "models": MODEL,
        "timezone": "GMT",
    })
    req = urllib.request.Request(
        f"{URL}?{query}",
        headers={"User-Agent": "london-no2-forecasting-student-project"},
    )
    last_error: Exception | None = None
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", "replace")[:300]
            if error.code == 429:
                print("Rate limit reached, waiting 65 seconds ...")
                time.sleep(65)
                continue
            raise FetchError(f"HTTP {error.code}: {body}") from error
        except (urllib.error.URLError, TimeoutError) as error:
            last_error = error
            time.sleep(3 * (attempt + 1))
    raise FetchError(f"Network problem: {last_error}")


def check(code: str, payload: dict) -> dict:
    daily = payload.get("daily")
    units = payload.get("daily_units")
    if not isinstance(daily, dict) or not isinstance(units, dict):
        raise FetchError(f"{code}: response has no daily block")
    days = daily.get("time", [])
    expected = (END - START).days + 1
    if len(days) != expected:
        raise FetchError(f"{code}: {len(days)} days, expected {expected}")
    if days[0] != START.isoformat() or days[-1] != END.isoformat():
        raise FetchError(f"{code}: period {days[0]}..{days[-1]} is wrong")
    if payload.get("timezone") != "GMT" or payload.get("utc_offset_seconds") != 0:
        raise FetchError(
            f"{code}: timezone {payload.get('timezone')!r}, "
            f"offset {payload.get('utc_offset_seconds')!r}, expected GMT / 0"
        )
    parsed = [date.fromisoformat(d) for d in days]
    if any((b - a).days != 1 for a, b in zip(parsed, parsed[1:])):
        raise FetchError(f"{code}: day sequence has gaps or is not ordered")
    wrong = {
        k: (units.get(k), want)
        for k, want in DAILY_UNITS.items()
        if units.get(k) != want
    }
    if wrong:
        raise FetchError(f"{code}: unexpected units (found, expected): {wrong}")
    nulls = {}
    for key in DAILY_UNITS:
        values = daily.get(key)
        if not isinstance(values, list) or len(values) != expected:
            raise FetchError(f"{code}: variable {key} missing or wrong length")
        nulls[key] = sum(v is None for v in values)
        if nulls[key] == expected:
            raise FetchError(f"{code}: variable {key} has no values at all")
    return nulls


def main() -> None:
    stations = json.loads(STATIONS.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "downloaded": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": URL,
        "period": [START.isoformat(), END.isoformat()],
        "timezone": "GMT",
        "model": MODEL,
        "units": DAILY_UNITS,
        "stations": {},
    }
    for station in stations:
        code = station["code"]
        raw = request(station["lat"], station["lon"])
        payload = json.loads(raw)
        nulls = check(code, payload)
        (OUT / f"weather_{code}.json").write_bytes(raw)
        manifest["stations"][code] = {
            "requested": [station["lat"], station["lon"]],
            "grid_cell": [payload.get("latitude"), payload.get("longitude")],
            "elevation": payload.get("elevation"),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "missing_values": nulls,
        }
        cell = manifest["stations"][code]["grid_cell"]
        total = sum(nulls.values())
        print(f"{code}: grid cell {cell}, missing values in total: {total}")
        time.sleep(1)
    (OUT / "weather_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    cells = {tuple(s["grid_cell"]) for s in manifest["stations"].values()}
    print(f"Distinct grid cells: {len(cells)}")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    try:
        main()
    except FetchError as error:
        sys.exit(f"Fetch failed: {error}")