"""Reference numbers for the browser statistics (frontend/src/playground/stats.ts).

Independent re-implementation in plain Python (standard library only). The
vitest tests compare the TypeScript results with the file written here.
Definitions are the ones documented at the top of stats.ts.

Run from the repository root:  python3 tools/make_stats_reference.py
"""

import json
import math
import statistics
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "frontend" / "public" / "data" / "playground"
OUT = ROOT / "frontend" / "tests" / "reference" / "stats_reference.json"

STATIONS = ["KC1", "RI2"]
LINEAR_WEATHER = [
    "temperature_2m_mean",
    "temperature_2m_max",
    "temperature_2m_min",
    "wind_speed_10m_max",
    "wind_speed_10m_mean",
    "precipitation_sum",
    "snowfall_sum",
    "relative_humidity_2m_mean",
]


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


meta = load("playground_meta.json")
cal = load("calendar.json")
series = load("weather.json")["series"]
th = meta["definitions"]["thresholds"]
N = meta["days"]
first = date.fromisoformat(meta["first_day"])
dates = [first + timedelta(days=i) for i in range(N)]
no2 = {code: load(f"no2_{code}.json")["no2"] for code in STATIONS}

wind = series["wind_speed_10m_mean"]
direction = series["wind_direction_10m_dominant"]
weekday = cal["weekday"]
holiday = cal["holiday"]


def wind_class(i):
    v = wind[i]
    if v <= th["wind_calm_max_kmh"]:
        return 0
    return 2 if v >= th["wind_windy_min_kmh"] else 1


def season(i):
    m = dates[i].month
    if m in (12, 1, 2):
        return 0
    if m in (3, 4, 5):
        return 1
    if m in (6, 7, 8):
        return 2
    return 3


def sector(i):
    return int(((direction[i] + 22.5) % 360) // 45)


ALL = [True] * N
WINDY_WORKDAY_WINTER = [
    wind_class(i) == 2 and holiday[i] == 0 and weekday[i] < 5 and season(i) == 0
    for i in range(N)
]


def quartiles(values):
    q1, _, q3 = statistics.quantiles(values, n=4, method="inclusive")
    return q1, q3


def selected(values, mask):
    return [v for i, v in enumerate(values) if mask[i] and v is not None]


# --------------------------------------------------------------- rolling mean
def rolling(values, mask, window):
    masked = [v if mask[i] and v is not None else None for i, v in enumerate(values)]
    before = window // 2
    after = window - before - 1
    need = math.ceil(0.5 * window)
    out = [None] * N
    for i in range(before, N - after):
        vals = [x for x in masked[i - before : i + after + 1] if x is not None]
        if len(vals) >= need:
            out[i] = math.fsum(vals) / len(vals)
    return out


SAMPLE_INDEX = sorted(
    set(
        list(range(0, 8))
        + [100, 101, 500, 777, 1000, 2000, 3000, 4000, 5000, 6000]
        + list(range(N - 8, N))
    )
)


def rolling_block(values, mask, window):
    out = rolling(values, mask, window)
    valid = [v for v in out if v is not None]
    return {
        "valid": len(valid),
        "mean_of_valid": statistics.fmean(valid),
        "samples": [[i, out[i]] for i in SAMPLE_INDEX],
    }


# ------------------------------------------------------------------ histogram
def bin_edges(pooled):
    n = len(pooled)
    lo, hi = min(pooled), max(pooled)
    ordered = sorted(pooled)
    q1, q3 = quartiles(ordered)
    iqr = q3 - q1
    width = 2 * iqr * n ** (-1 / 3)
    k = math.ceil((hi - lo) / width) if width > 0 else math.ceil(math.log2(n) + 1)
    k = min(60, max(8, k))
    step = (hi - lo) / k
    return [lo + i * step for i in range(k)] + [hi]


def bin_counts(values, edges):
    k = len(edges) - 1
    width = (edges[k] - edges[0]) / k
    counts = [0] * k
    for v in values:
        counts[min(k - 1, int((v - edges[0]) / width))] += 1
    return counts


def hist_block(code):
    values = selected(no2[code], ALL)
    edges = bin_edges(values)
    groups = {0: [], 1: [], 2: []}
    for i, v in enumerate(no2[code]):
        if v is not None:
            groups[wind_class(i)].append(v)
    return {
        "edges": edges,
        "counts": bin_counts(values, edges),
        "by_wind_class": {
            name: bin_counts(groups[k], edges)
            for k, name in enumerate(["calm", "normal", "windy"])
        },
    }


# -------------------------------------------------------------------- density
def kde_block(code):
    groups = {0: [], 1: [], 2: []}
    for i, v in enumerate(no2[code]):
        if v is not None:
            groups[wind_class(i)].append(v)
    pooled = [v for k in (0, 1, 2) for v in groups[k]]
    n = len(pooled)
    sd = statistics.stdev(pooled)
    q1, q3 = quartiles(sorted(pooled))
    iqr = q3 - q1
    spread = min(sd, iqr / 1.34) if iqr > 0 else sd
    h = 0.9 * spread * n ** (-0.2)
    lo = min(pooled) - 3 * h
    hi = max(pooled) + 3 * h
    if min(pooled) >= 0:
        lo = max(0.0, lo)
    points = 128
    grid = [lo + i * (hi - lo) / (points - 1) for i in range(points)]
    at = [0, 16, 32, 64, 96, 127]

    def density(values, g):
        return math.fsum(
            math.exp(-0.5 * ((g - v) / h) ** 2) for v in values
        ) / (len(values) * h * math.sqrt(2 * math.pi))

    return {
        "bandwidth": h,
        "grid_first": grid[0],
        "grid_last": grid[-1],
        "at": at,
        "curves": {
            name: [density(groups[k], grid[j]) for j in at]
            for k, name in enumerate(["calm", "normal", "windy"])
        },
    }


# ------------------------------------------------------------------- box plot
def box(values):
    ordered = sorted(values)
    q1, q3 = quartiles(ordered)
    median = statistics.median(ordered)
    iqr = q3 - q1
    low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    inside = [v for v in ordered if low <= v <= high]
    outliers = [v for v in ordered if v < low or v > high]
    return {
        "n": len(ordered),
        "mean": statistics.fmean(ordered),
        "q1": q1,
        "median": median,
        "q3": q3,
        "whisker_low": min(inside),
        "whisker_high": max(inside),
        "outliers": len(outliers),
        "outlier_sum": math.fsum(outliers),
    }


def box_block(code):
    out = {}
    for name, mask in {
        "all": ALL,
        "windy": [wind_class(i) == 2 for i in range(N)],
        "calm": [wind_class(i) == 0 for i in range(N)],
    }.items():
        out[name] = box(selected(no2[code], mask))
    return out


# ---------------------------------------------------------------- correlation
def ranks(values):
    order = sorted(range(len(values)), key=lambda i: values[i])
    out = [0.0] * len(values)
    pos = 0
    while pos < len(order):
        end = pos
        while end + 1 < len(order) and values[order[end + 1]] == values[order[pos]]:
            end += 1
        for k in range(pos, end + 1):
            out[order[k]] = (pos + end) / 2 + 1
        pos = end + 1
    return out


def pearson(x, y):
    if len(x) < 3:
        return None
    try:
        return statistics.correlation(x, y)
    except statistics.StatisticsError:
        return None


def corr_block(code, mask):
    columns = [("no2", no2[code])] + [(k, series[k]) for k in LINEAR_WEATHER]
    keys = [k for k, _ in columns]
    result = {"keys": keys, "pearson": [], "spearman": [], "n": []}
    for a_key, a in columns:
        row_p, row_s, row_n = [], [], []
        for b_key, b in columns:
            xs, ys = [], []
            for i in range(N):
                if mask[i] and a[i] is not None and b[i] is not None:
                    xs.append(a[i])
                    ys.append(b[i])
            row_p.append(pearson(xs, ys))
            row_s.append(pearson(ranks(xs), ranks(ys)) if len(xs) >= 3 else None)
            row_n.append(len(xs))
        result["pearson"].append(row_p)
        result["spearman"].append(row_s)
        result["n"].append(row_n)
    return result


def fit_block(code, variable):
    xs, ys = [], []
    for i in range(N):
        if no2[code][i] is not None:
            xs.append(series[variable][i])
            ys.append(no2[code][i])
    slope, intercept = statistics.linear_regression(xs, ys)
    return {
        "n": len(xs),
        "slope": slope,
        "intercept": intercept,
        "r2": statistics.correlation(xs, ys) ** 2,
    }


# ------------------------------------------------------------------ wind rose
def rose_block(code):
    days = [0] * 8
    speed = [[0, 0, 0] for _ in range(8)]
    values = [[] for _ in range(8)]
    for i in range(N):
        s = sector(i)
        days[s] += 1
        speed[s][wind_class(i)] += 1
        if no2[code][i] is not None:
            values[s].append(no2[code][i])
    return {
        "days": days,
        "speed_days": speed,
        "no2_n": [len(v) for v in values],
        "no2_mean": [statistics.fmean(v) for v in values],
    }


# --------------------------------------------------------------- cross tables
def cross_block(code, row_of, n_rows, col_of, n_cols):
    cells = [[[] for _ in range(n_cols)] for _ in range(n_rows)]
    for i in range(N):
        if no2[code][i] is not None:
            cells[row_of(i)][col_of(i)].append(no2[code][i])
    return {
        "n": [[len(c) for c in row] for row in cells],
        "mean": [
            [statistics.fmean(c) if c else None for c in row] for row in cells
        ],
    }


# ----------------------------------------------------------------- month cells
def monthly_block(code):
    years = sorted({d.year for d in dates})
    cells = {y: [[] for _ in range(12)] for y in years}
    for i in range(N):
        if no2[code][i] is not None:
            cells[dates[i].year][dates[i].month - 1].append(no2[code][i])
    return {
        "years": years,
        "n": [[len(c) for c in cells[y]] for y in years],
        "mean": [[statistics.fmean(c) if c else None for c in cells[y]] for y in years],
    }


# ------------------------------------------------------------ calendar heatmap
def calendar_block(code, year):
    jan1 = date(year, 1, 1)
    windy = [wind_class(i) == 2 for i in range(N)]
    cells = []
    for i in range(N):
        if dates[i].year != year:
            continue
        doy = (dates[i] - jan1).days
        cells.append(
            {
                "index": i,
                "col": (doy + jan1.weekday()) // 7,
                "row": dates[i].weekday(),
                "value": no2[code][i] if windy[i] else None,
                "selected": windy[i],
            }
        )
    probes = [d for d in (date(year, 1, 1), date(year, 7, 15), date(year, 12, 31))]
    by_date = {dates[c["index"]]: c for c in cells}
    return {
        "year": year,
        "cells": len(cells),
        "selected": sum(1 for c in cells if c["selected"]),
        "with_value": sum(1 for c in cells if c["value"] is not None),
        "max_col": max(c["col"] for c in cells),
        "probes": [[p.isoformat(), by_date[p]] for p in probes if p in by_date],
    }


def main():
    result = {
        "first_day": meta["first_day"],
        "days": N,
        "sample_index": SAMPLE_INDEX,
        "stations": {},
    }
    for code in STATIONS:
        result["stations"][code] = {
            "rolling": {
                "w7": rolling_block(no2[code], ALL, 7),
                "w30": rolling_block(no2[code], ALL, 30),
                "w7_windy_workday_winter": rolling_block(
                    no2[code], WINDY_WORKDAY_WINTER, 7
                ),
            },
            "hist": hist_block(code),
            "kde": kde_block(code),
            "box": box_block(code),
            "corr_all": corr_block(code, ALL),
            "corr_windy_workday_winter": corr_block(code, WINDY_WORKDAY_WINTER),
            "fit_wind": fit_block(code, "wind_speed_10m_mean"),
            "fit_temperature": fit_block(code, "temperature_2m_mean"),
            "rose": rose_block(code),
            "cross_month_weekday": cross_block(
                code, lambda i: dates[i].month - 1, 12, lambda i: weekday[i], 7
            ),
            "cross_season_wind": cross_block(code, season, 4, wind_class, 3),
            "monthly": monthly_block(code),
            "calendar_2019": calendar_block(code, 2019),
        }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=1, allow_nan=False) + "\n", encoding="utf-8")
    kc1 = result["stations"]["KC1"]
    print(f"written: {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
    print(f"KC1 hist bins: {len(kc1['hist']['counts'])}, bandwidth: {kc1['kde']['bandwidth']:.4f}")
    print(f"KC1 box all: {kc1['box']['all']['n']} values, {kc1['box']['all']['outliers']} outliers")
    print(f"KC1 spearman no2 vs wind mean: {kc1['corr_all']['spearman'][0][5]:.4f}")
    print(f"KC1 fit wind: slope {kc1['fit_wind']['slope']:.4f}, r2 {kc1['fit_wind']['r2']:.4f}")


if __name__ == "__main__":
    main()
