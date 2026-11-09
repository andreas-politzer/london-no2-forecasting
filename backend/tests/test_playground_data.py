"""Pruefungen fuer die Playground-Daten (frontend/public/data/playground).

Start im Ordner backend: python -m pytest tests -q
Die Kontrollzahlen wurden am 09.11.2026 mit dem Datenstand vom 08.11.2026 gesetzt.
"""
import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np
import pytest

from forecast_lab import data

ROOT = Path(__file__).resolve().parents[2]
PG = ROOT / "frontend" / "public" / "data" / "playground"
CSV = ROOT / "data" / "raw" / "london_air_quality_2010_2026_top5_sites.csv"
WEATHER_RAW = ROOT / "data" / "raw" / "weather"


def load(name: str) -> dict:
    return json.loads((PG / name).read_text(encoding="utf-8"))


CAL = load("calendar.json")
WEATHER = load("weather.json")
NO2 = {st: load(f"no2_{st}.json") for st in data.STATIONS}
META = load("playground_meta.json")

FIRST = date.fromisoformat(data.FIRST_DAY)
LAST = date.fromisoformat(data.LAST_DAY)
N = (LAST - FIRST).days + 1

MEASURED_DAYS = {"BL0": 5096, "EA6": 5414, "KC1": 5964, "MY1": 5826, "RI2": 5493}


def idx(day: str) -> int:
    return (date.fromisoformat(day) - FIRST).days


def at(key: str, day: str) -> int:
    return CAL[key][idx(day)]


def test_all_files_share_one_day_axis():
    assert N == 6148
    for part in [CAL, WEATHER, *NO2.values()]:
        assert part["n"] == N
        assert part["first_day"] == data.FIRST_DAY
    for key in ("weekday", "holiday", "corona", "ulez"):
        assert len(CAL[key]) == N, key
    for key, values in WEATHER["series"].items():
        assert len(values) == N, key
    for station, payload in NO2.items():
        assert len(payload["no2"]) == N, station


def test_weekday_matches_every_date():
    for i, weekday in enumerate(CAL["weekday"]):
        day = date.fromordinal(FIRST.toordinal() + i)
        assert weekday == day.weekday(), day


def test_no2_files_equal_the_engine_day_by_day():
    if not CSV.exists():
        pytest.skip("raw CSV not available")
    raw = data.load_raw(str(CSV))
    for station in data.STATIONS:
        want = data.daily_series(raw, station).to_numpy()
        have = NO2[station]["no2"]
        for i, (a, b) in enumerate(zip(want, have)):
            if np.isnan(a):
                assert b is None, (station, i)
            else:
                assert b is not None and abs(a - b) <= 0.005 + 1e-9, (station, i)


def test_measured_days_pinned():
    for station, expected in MEASURED_DAYS.items():
        got = sum(v is not None for v in NO2[station]["no2"])
        assert got == expected, station
        assert META["measured_days"][station] == expected


def test_corona_phase_boundaries():
    assert at("corona", "2020-03-22") == 0
    assert at("corona", "2020-03-23") == 2
    assert at("corona", "2020-06-01") == 2
    assert at("corona", "2020-06-02") == 1
    assert at("corona", "2020-11-04") == 1
    assert at("corona", "2020-11-05") == 2
    assert at("corona", "2020-12-02") == 2
    assert at("corona", "2020-12-03") == 1
    assert at("corona", "2021-01-03") == 1
    assert at("corona", "2021-01-04") == 2
    assert at("corona", "2021-03-08") == 2
    assert at("corona", "2021-03-09") == 1
    assert at("corona", "2021-07-19") == 1
    assert at("corona", "2021-07-20") == 0
    assert at("corona", data.LAST_DAY) == 0


def test_ulez_phase_boundaries():
    assert at("ulez", "2019-04-07") == 0
    assert at("ulez", "2019-04-08") == 1
    assert at("ulez", "2021-10-24") == 1
    assert at("ulez", "2021-10-25") == 2
    assert at("ulez", "2023-08-28") == 2
    assert at("ulez", "2023-08-29") == 3
    assert at("ulez", data.LAST_DAY) == 3
    assert at("ulez", data.FIRST_DAY) == 0


def test_bank_holidays():
    flags = CAL["holiday"]
    names = CAL["holiday_names"]
    assert sum(flags) == len(names)
    assert all(flags[idx(day)] == 1 for day in names)
    for day in ("2015-01-01", "2022-09-19", "2023-05-08", "2024-12-25",
                "2024-12-26", "2026-05-04", "2026-05-25"):
        assert at("holiday", day) == 1, day
    assert at("holiday", "2024-12-24") == 0
    assert sum(flags[idx("2019-01-01"): idx("2019-12-31") + 1]) == 8


def test_weather_is_plausible():
    s = WEATHER["series"]
    for values in s.values():
        assert all(v is not None for v in values)
    assert all(0 <= v < 360 or v == 360 for v in s["wind_direction_10m_dominant"])
    assert all(v >= 0 for v in s["precipitation_sum"])
    assert all(v >= 0 for v in s["snowfall_sum"])
    assert all(0 <= v <= 100 for v in s["relative_humidity_2m_mean"])
    assert all(-20 < v < 45 for v in s["temperature_2m_max"])
    for i in range(N):
        assert s["temperature_2m_max"][i] + 0.11 >= s["temperature_2m_mean"][i]
        assert s["temperature_2m_mean"][i] + 0.11 >= s["temperature_2m_min"][i]
        assert s["wind_speed_10m_max"][i] >= s["wind_speed_10m_mean"][i]
    tmax = s["temperature_2m_max"]
    hottest = date.fromordinal(FIRST.toordinal() + int(np.argmax(tmax))).isoformat()
    assert hottest in {"2019-07-25", "2022-07-18", "2022-07-19"}, hottest
    assert max(tmax) > 33


def test_weather_matches_raw_downloads():
    if not (WEATHER_RAW / "weather_BL0.json").exists():
        pytest.skip("raw weather not available")
    raw = {
        c: json.loads((WEATHER_RAW / f"weather_{c}.json").read_text())["daily"]
        for c in data.STATIONS
    }
    s = WEATHER["series"]
    for key in ("wind_speed_10m_max", "wind_speed_10m_mean",
                "wind_direction_10m_dominant", "precipitation_sum", "snowfall_sum"):
        assert s[key] == raw["BL0"][key], key
    for key in ("temperature_2m_mean", "temperature_2m_max",
                "temperature_2m_min", "relative_humidity_2m_mean"):
        mean = [
            sum(raw[c][key][i] for c in data.STATIONS) / len(data.STATIONS)
            for i in range(N)
        ]
        assert np.allclose(s[key], mean, atol=0.051), key


def test_checksums_in_meta_match_files():
    assert META["files"]
    for name, digest in META["files"].items():
        got = hashlib.sha256((PG / name).read_bytes()).hexdigest()
        assert got == digest, name