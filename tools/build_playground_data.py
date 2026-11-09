"""Build the data files for the NO2 Playground.

Writes to frontend/public/data/playground/:
  no2_<CODE>.json       daily NO2 per station (same day rule as the engine)
  weather.json          daily weather for London (ERA5 via Open-Meteo)
  calendar.json         weekday, bank holidays (England), Corona and ULEZ phases
  playground_meta.json  sources, checksums, counts

All five stations share one ERA5 grid cell, so the weather is stored once.
The script checks that the five raw weather files really are identical.
Everything is built in a temporary folder first and swapped in at the end,
so a failed run never destroys the last good data.

Corona coding (simplified, documented in playground_meta.json):
  0 no restrictions
  1 period with Corona restrictions, 2020-03-23 .. 2021-07-19 (simplified)
  2 national lockdown, dated after the English Wikipedia article
    "COVID-19 pandemic in England" (boundaries differ slightly between sources)

Run from the project root, with the virtual environment active:
  python tools/build_playground_data.py
"""

from __future__ import annotations

import hashlib
import json
import shutil
import statistics
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import holidays  # noqa: E402
from forecast_lab import data  # noqa: E402

CSV = ROOT / "data" / "raw" / "london_air_quality_2010_2026_top5_sites.csv"
WEATHER_DIR = ROOT / "data" / "raw" / "weather"
OUT = ROOT / "frontend" / "public" / "data" / "playground"
TMP = OUT.with_name("playground.tmp")

FIRST = date.fromisoformat(data.FIRST_DAY)
LAST = date.fromisoformat(data.LAST_DAY)

CORONA_PERIOD = (date(2020, 3, 23), date(2021, 7, 19))
LOCKDOWNS = [
    (date(2020, 3, 23), date(2020, 6, 1)),
    (date(2020, 11, 5), date(2020, 12, 2)),
    (date(2021, 1, 4), date(2021, 3, 8)),
]
ULEZ_STARTS = [date(2019, 4, 8), date(2021, 10, 25), date(2023, 8, 29)]
# Variables that Open-Meteo adjusts for the elevation of each point (maximum
# allowed difference between stations). All other weather variables must be
# exactly identical across the five stations.
ADJUSTED = {
    "temperature_2m_mean": 0.3,
    "temperature_2m_max": 0.3,
    "temperature_2m_min": 0.3,
    "relative_humidity_2m_mean": 2.0,
}
MUST_HAVE = {
    date(2011, 4, 29): "royal wedding",
    date(2012, 6, 5): "Diamond Jubilee",
    date(2022, 6, 3): "Platinum Jubilee",
    date(2022, 9, 19): "state funeral",
    date(2023, 5, 8): "coronation",
}


class BuildError(Exception):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, payload: object) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")


def english_holidays() -> tuple[object, str]:
    last_error: Exception | None = None
    for subdiv in ("ENG", "England"):
        try:
            found = holidays.country_holidays(
                "GB", subdiv=subdiv, years=range(FIRST.year, LAST.year + 1)
            )
            return found, subdiv
        except Exception as error:  # noqa: BLE001
            last_error = error
    raise BuildError(f"No England subdivision in holidays package: {last_error}")


def corona_code(day: date) -> int:
    if any(start <= day <= end for start, end in LOCKDOWNS):
        return 2
    if CORONA_PERIOD[0] <= day <= CORONA_PERIOD[1]:
        return 1
    return 0


def class_counts(series: dict, calendar: dict, no2: dict) -> dict:
    """Quartiles and day counts per class (all days and measured NO2 days)."""
    wind = series["wind_speed_10m_mean"]
    q1, _, q3 = statistics.quantiles(wind, n=4, method="inclusive")
    tmax, tmin = series["temperature_2m_max"], series["temperature_2m_min"]
    rain, snow = series["precipitation_sum"], series["snowfall_sum"]
    weekday, holiday = calendar["weekday"], calendar["holiday"]
    tests = {
        "wind_calm": lambda i: wind[i] <= q1,
        "wind_windy": lambda i: wind[i] >= q3,
        "rain_dry": lambda i: rain[i] < 1,
        "rain_wet": lambda i: rain[i] >= 1,
        "rain_very_wet": lambda i: rain[i] >= 10,
        "rain_extreme": lambda i: rain[i] >= 20,
        "snow_gt0": lambda i: snow[i] > 0,
        "snow_ge0.1": lambda i: snow[i] >= 0.1,
        "snow_ge0.5": lambda i: snow[i] >= 0.5,
        "snow_ge1": lambda i: snow[i] >= 1,
        "frost_day": lambda i: tmin[i] < 0,
        "ice_day": lambda i: tmax[i] < 0,
        "summer_day": lambda i: tmax[i] > 25,
        "bank_holiday": lambda i: holiday[i] == 1,
        "weekend": lambda i: holiday[i] == 0 and weekday[i] >= 5,
        "workday": lambda i: holiday[i] == 0 and weekday[i] < 5,
    }
    for k in range(3):
        tests[f"corona_{k}"] = lambda i, k=k: calendar["corona"][i] == k
    for k in range(4):
        tests[f"ulez_{k}"] = lambda i, k=k: calendar["ulez"][i] == k
    result = {
        "wind_quartiles_kmh": [round(q1, 2), round(q3, 2)],
        "thresholds": {
            "wind_calm_max_kmh": round(q1, 2),
            "wind_windy_min_kmh": round(q3, 2),
            "rain_wet_min_mm": 1,
            "rain_very_wet_min_mm": 10,
            "snow_day_min_cm": 0.5,
            "frost_day_tmin_below": 0,
            "summer_day_tmax_above": 25,
            "min_days_per_group": 30,
        },
        "all_days": {},
        "measured_days": {code: {} for code in no2},
    }
    for name, test in tests.items():
        flags = [bool(test(i)) for i in range(len(wind))]
        result["all_days"][name] = sum(flags)
        for code, values in no2.items():
            result["measured_days"][code][name] = sum(
                flag and value is not None for flag, value in zip(flags, values)
            )
    return result


def build(payloads: dict[str, object], info: dict) -> None:
    days = [FIRST + timedelta(days=i) for i in range((LAST - FIRST).days + 1)]
    n = len(days)
    iso = [d.isoformat() for d in days]

    # Calendar: weekday, bank holidays, phases.
    found, subdiv = english_holidays()
    missing = [f"{d} ({what})" for d, what in MUST_HAVE.items() if d not in found]
    if missing:
        raise BuildError(f"Bank holidays missing in holidays package: {missing}")
    names = {d.isoformat(): found[d] for d in days if d in found}
    payloads["calendar.json"] = {
        "first_day": iso[0],
        "n": n,
        "weekday": [d.weekday() for d in days],
        "holiday": [1 if d in found else 0 for d in days],
        "holiday_names": names,
        "corona": [corona_code(d) for d in days],
        "ulez": [sum(d >= s for s in ULEZ_STARTS) for d in days],
        "events": {
            "corona_period": [d.isoformat() for d in CORONA_PERIOD],
            "lockdowns": [[a.isoformat(), b.isoformat()] for a, b in LOCKDOWNS],
            "ulez_starts": [s.isoformat() for s in ULEZ_STARTS],
        },
    }
    info["holidays"] = {
        "package": "holidays " + holidays.__version__,
        "subdivision": subdiv,
        "count": len(names),
    }

    # Weather: one file for London, after checking all five are identical.
    weather_manifest = json.loads(
        (WEATHER_DIR / "weather_manifest.json").read_text(encoding="utf-8")
    )
    raw_weather = {}
    for code in data.STATIONS:
        payload = json.loads(
            (WEATHER_DIR / f"weather_{code}.json").read_text(encoding="utf-8")
        )
        if payload["daily"]["time"] != iso:
            raise BuildError(f"{code}: weather days do not match the calendar")
        raw_weather[code] = payload
    reference = raw_weather[data.STATIONS[0]]
    cells = {(p["latitude"], p["longitude"]) for p in raw_weather.values()}
    if len(cells) != 1:
        raise BuildError(f"Weather grid cells differ: {sorted(cells)}")
    series = {}
    spread = {}
    for key in reference["daily"]:
        if key == "time":
            continue
        columns = [raw_weather[c]["daily"][key] for c in data.STATIONS]
        if any(v is None for column in columns for v in column):
            raise BuildError(f"{key}: missing values in the weather data")
        largest = max(max(values) - min(values) for values in zip(*columns))
        spread[key] = round(largest, 3)
        if key in ADJUSTED:
            if largest > ADJUSTED[key]:
                raise BuildError(
                    f"{key}: stations differ by {largest}, tolerance {ADJUSTED[key]}"
                )
            series[key] = [round(sum(v) / len(v), 1) for v in zip(*columns)]
        else:
            if largest != 0:
                raise BuildError(f"{key}: differs between stations ({largest})")
            series[key] = columns[0]
    info["weather_station_spread"] = spread
    payloads["weather.json"] = {
        "first_day": iso[0],
        "n": n,
        "source": "Open-Meteo archive API, ERA5 reanalysis",
        "note": "One ERA5 grid cell for all stations. Temperature and humidity are the mean of the five elevation-adjusted station values.",
        "grid_cell": [reference["latitude"], reference["longitude"]],
        "units": reference["daily_units"],
        "series": series,
    }
    info["weather_downloaded"] = weather_manifest["downloaded"]
    info["weather_sha256"] = {
        code: entry["sha256"]
        for code, entry in weather_manifest["stations"].items()
    }

    # NO2 per station, with the engine's day rule and a full calendar check.
    raw = data.load_raw(str(CSV))
    counts = {}
    for code in data.STATIONS:
        s = data.daily_series(raw, code)
        if [ts.date() for ts in s.index] != days:
            raise BuildError(f"{code}: engine calendar differs from the expected days")
        values = [None if v != v else round(float(v), 2) for v in s.to_numpy()]
        counts[code] = sum(v is not None for v in values)
        payloads[f"no2_{code}.json"] = {
            "station": code,
            "first_day": iso[0],
            "n": n,
            "no2": values,
        }
    info["days"] = n
    info["first_day"] = iso[0]
    info["last_day"] = iso[-1]
    info["measured_days"] = counts
    info["definitions"] = class_counts(
        series,
        payloads["calendar.json"],
        {c: payloads[f"no2_{c}.json"]["no2"] for c in data.STATIONS},
    )


def main() -> None:
    payloads: dict[str, object] = {}
    info: dict = {}
    build(payloads, info)

    if TMP.exists():
        shutil.rmtree(TMP)
    TMP.mkdir(parents=True)
    for name, payload in payloads.items():
        write_json(TMP / name, payload)

    info["inputs"] = {"csv": CSV.name, "csv_sha256": sha256(CSV)}
    info["corona_definition"] = {
        "0": "no restrictions",
        "1": "period with Corona restrictions 2020-03-23..2021-07-19 (simplified)",
        "2": "national lockdown, dated after English Wikipedia 'COVID-19 pandemic in England'",
    }
    info["files"] = {p.name: sha256(p) for p in sorted(TMP.glob("*.json"))}
    write_json(TMP / "playground_meta.json", info)

    if OUT.exists():
        shutil.rmtree(OUT)
    TMP.rename(OUT)

    print(f"Wrote {len(list(OUT.glob('*.json')))} files to {OUT}")
    print(
        f"Days: {info['days']} ({info['first_day']} .. {info['last_day']}), "
        f"bank holidays: {info['holidays']['count']} via {info['holidays']['subdivision']}"
    )
    for code, count in info["measured_days"].items():
        print(f"  {code}: {count} measured days")
    definitions = info["definitions"]
    print(f"Wind quartiles (km/h): {definitions['wind_quartiles_kmh']}")
    for name, count in definitions["all_days"].items():
        line = ", ".join(
            f"{c} {m[name]}" for c, m in definitions["measured_days"].items()
        )
        print(f"  {name:<14} all {count:5d} | measured: {line}")
    for path in sorted(OUT.glob("*.json")):
        print(f"  {path.name:<24} {path.stat().st_size / 1024:7.1f} KB")


if __name__ == "__main__":
    try:
        main()
    except BuildError as error:
        sys.exit(f"Build failed: {error}")