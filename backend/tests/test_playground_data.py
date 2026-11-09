"""Pruefungen fuer die Playground-Daten (frontend/public/data/playground).

Start im Ordner backend: python -m pytest tests -q
Die Kontrollzahlen wurden am 09.11.2026 mit dem Datenstand vom 08.11.2026 gesetzt.
"""
import hashlib
import json
import statistics
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


def test_thresholds_in_meta():
    definitions = META["definitions"]
    t = definitions["thresholds"]
    wind = WEATHER["series"]["wind_speed_10m_mean"]
    q1, _, q3 = statistics.quantiles(wind, n=4, method="inclusive")
    assert t["wind_calm_max_kmh"] == round(q1, 2)
    assert t["wind_windy_min_kmh"] == round(q3, 2)
    assert definitions["wind_quartiles_kmh"] == [round(q1, 2), round(q3, 2)]
    assert t["rain_wet_min_mm"] == 1
    assert t["rain_very_wet_min_mm"] == 10
    assert t["snow_day_min_cm"] == 0.5
    assert t["frost_day_tmin_below"] == 0
    assert t["summer_day_tmax_above"] == 25
    assert t["min_days_per_group"] == 30


def test_class_counts_recomputed_from_the_files():
    s = WEATHER["series"]
    wind = s["wind_speed_10m_mean"]
    q1, _, q3 = statistics.quantiles(wind, n=4, method="inclusive")
    rain, snow = s["precipitation_sum"], s["snowfall_sum"]
    tmin, tmax = s["temperature_2m_min"], s["temperature_2m_max"]
    weekday, holiday = CAL["weekday"], CAL["holiday"]
    days = range(N)
    flags = {
        "wind_calm": [wind[i] <= q1 for i in days],
        "wind_windy": [wind[i] >= q3 for i in days],
        "rain_dry": [rain[i] < 1 for i in days],
        "rain_wet": [rain[i] >= 1 for i in days],
        "rain_very_wet": [rain[i] >= 10 for i in days],
        "rain_extreme": [rain[i] >= 20 for i in days],
        "snow_gt0": [snow[i] > 0 for i in days],
        "snow_ge0.1": [snow[i] >= 0.1 for i in days],
        "snow_ge0.5": [snow[i] >= 0.5 for i in days],
        "snow_ge1": [snow[i] >= 1 for i in days],
        "frost_day": [tmin[i] < 0 for i in days],
        "ice_day": [tmax[i] < 0 for i in days],
        "summer_day": [tmax[i] > 25 for i in days],
        "bank_holiday": [holiday[i] == 1 for i in days],
        "weekend": [holiday[i] == 0 and weekday[i] >= 5 for i in days],
        "workday": [holiday[i] == 0 and weekday[i] < 5 for i in days],
    }
    for k in range(3):
        flags[f"corona_{k}"] = [CAL["corona"][i] == k for i in days]
    for k in range(4):
        flags[f"ulez_{k}"] = [CAL["ulez"][i] == k for i in days]

    definitions = META["definitions"]
    assert set(flags) == set(definitions["all_days"])
    for name, values in flags.items():
        assert sum(values) == definitions["all_days"][name], name
        for station in data.STATIONS:
            measured = sum(
                flag and value is not None
                for flag, value in zip(values, NO2[station]["no2"])
            )
            assert measured == definitions["measured_days"][station][name], (
                station,
                name,
            )


def test_headline_class_counts_pinned():
    all_days = META["definitions"]["all_days"]
    assert all_days["wind_calm"] == 1575
    assert all_days["wind_windy"] == 1553
    assert all_days["rain_very_wet"] == 264
    assert all_days["snow_ge0.5"] == 65
    assert all_days["frost_day"] == 393
    assert all_days["ice_day"] == 14
    assert all_days["bank_holiday"] == 153