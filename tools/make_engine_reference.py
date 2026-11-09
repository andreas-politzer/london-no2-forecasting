"""Reference numbers for the browser engine (frontend/src/playground/engine.ts).

Independent re-implementation in plain Python (standard library only).
The vitest tests compare the TypeScript results with the file written here.

Run from the repository root:  python3 tools/make_engine_reference.py
"""

import json
import statistics
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "frontend" / "public" / "data" / "playground"
OUT = ROOT / "frontend" / "tests" / "reference" / "engine_reference.json"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def summary(values):
    n = len(values)
    if n == 0:
        return {"n": 0, "mean": None, "median": None, "q1": None, "q3": None}
    out = {
        "n": n,
        "mean": statistics.fmean(values),
        "median": statistics.median(values),
        "q1": None,
        "q3": None,
    }
    if n >= 2:
        q1, _, q3 = statistics.quantiles(values, n=4, method="inclusive")
        out["q1"], out["q3"] = q1, q3
    return out


def main():
    meta = load("playground_meta.json")
    cal = load("calendar.json")
    series = load("weather.json")["series"]
    th = meta["definitions"]["thresholds"]
    stations = list(meta["definitions"]["measured_days"])

    n_days = meta["days"]
    first = date.fromisoformat(meta["first_day"])
    dates = [first + timedelta(days=i) for i in range(n_days)]
    assert len(cal["weekday"]) == n_days

    wind = series["wind_speed_10m_mean"]
    direction = series["wind_direction_10m_dominant"]
    rain = series["precipitation_sum"]
    snow = series["snowfall_sum"]
    tmin = series["temperature_2m_min"]
    tmax = series["temperature_2m_max"]
    weekday = cal["weekday"]
    holiday = cal["holiday"]

    days = range(n_days)
    flags = {
        "all": [True for _ in days],
        "wind_calm": [wind[i] <= th["wind_calm_max_kmh"] for i in days],
        "wind_windy": [wind[i] >= th["wind_windy_min_kmh"] for i in days],
        "rain_dry": [rain[i] < th["rain_wet_min_mm"] for i in days],
        "rain_wet": [rain[i] >= th["rain_wet_min_mm"] for i in days],
        "rain_very_wet": [rain[i] >= th["rain_very_wet_min_mm"] for i in days],
        "snow_day": [snow[i] >= th["snow_day_min_cm"] for i in days],
        "frost_day": [tmin[i] < th["frost_day_tmin_below"] for i in days],
        "summer_day": [tmax[i] > th["summer_day_tmax_above"] for i in days],
        "bank_holiday": [holiday[i] == 1 for i in days],
        "weekend": [holiday[i] == 0 and weekday[i] >= 5 for i in days],
        "workday": [holiday[i] == 0 and weekday[i] < 5 for i in days],
    }
    for k in range(3):
        flags[f"corona_{k}"] = [cal["corona"][i] == k for i in days]
    for k in range(4):
        flags[f"ulez_{k}"] = [cal["ulez"][i] == k for i in days]
    for k in range(7):
        flags[f"weekday_{k}"] = [weekday[i] == k for i in days]
    seasons = {
        "winter": (12, 1, 2),
        "spring": (3, 4, 5),
        "summer": (6, 7, 8),
        "autumn": (9, 10, 11),
    }
    for name, months in seasons.items():
        flags[f"season_{name}"] = [dates[i].month in months for i in days]
    for m in range(1, 13):
        flags[f"month_{m}"] = [dates[i].month == m for i in days]
    for y in sorted({d.year for d in dates}):
        flags[f"year_{y}"] = [dates[i].year == y for i in days]
    # 8 sectors of 45 degrees, centred on N (sector 0 = 337.5 .. 22.5 degrees)
    for s in range(8):
        flags[f"sector_{s}"] = [
            int(((direction[i] + 22.5) % 360) // 45) == s for i in days
        ]

    # Combined filters (intersections), to test the day selection later.
    flags["combo_windy_workday_winter"] = [
        flags["wind_windy"][i] and flags["workday"][i] and flags["season_winter"][i]
        for i in days
    ]
    flags["combo_calm_weekend_summer"] = [
        flags["wind_calm"][i] and flags["weekend"][i] and flags["season_summer"][i]
        for i in days
    ]
    flags["combo_corona1_spring"] = [
        flags["corona_1"][i] and flags["season_spring"][i] for i in days
    ]

    result = {
        "first_day": meta["first_day"],
        "days": n_days,
        "thresholds": th,
        "all_days": {name: sum(values) for name, values in flags.items()},
        "stations": {},
    }
    for code in stations:
        no2 = load(f"no2_{code}.json")["no2"]
        assert len(no2) == n_days
        result["stations"][code] = {
            name: summary([no2[i] for i in days if values[i] and no2[i] is not None])
            for name, values in flags.items()
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(result, indent=1, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"written: {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
    print(f"classes: {len(flags)}, stations: {', '.join(stations)}")
    for name in ("all", "wind_windy", "wind_calm", "combo_windy_workday_winter"):
        s = result["stations"][stations[0]][name]
        print(
            f"{stations[0]:>4} {name:<28} days={result['all_days'][name]:>5} "
            f"n={s['n']:>5} mean={s['mean']:.3f} median={s['median']:.3f}"
        )


if __name__ == "__main__":
    main()