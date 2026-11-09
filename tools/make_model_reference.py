"""Reference numbers for the browser models (frontend/src/playground/modelcore).

Independent re-implementation in Python with numpy and scikit-learn: the
ingredients (lags, windows, dummies) are rebuilt from the exported data files,
the linear model is solved with numpy, and the boosting model is fitted with
scikit-learn's HistGradientBoostingRegressor. The vitest tests compare the
browser code with the file written here.

  - Ingredients, split, baselines, scores and ridge coefficients must agree
    to rounding error.
  - Boosting is the browser's own implementation and is NOT identical to
    scikit-learn (different binning and tie handling); only the scores are
    compared, within a tolerance.

Run from the repository root (with numpy and scikit-learn installed):
  python tools/make_model_reference.py
"""

import json
import math
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "frontend" / "public" / "data" / "playground"
OUT = ROOT / "frontend" / "tests" / "reference" / "model_reference.json"

CALENDAR = ["weekday", "month", "bankHoliday", "trend", "corona", "ulez"]
LAGS = {"lag1": 1, "lag7": 7, "lag14": 14, "lag28": 28}
WINDOWS = {"mean7": 7, "mean28": 28}
WEATHER = [
    "temperature_2m_mean", "temperature_2m_max", "temperature_2m_min",
    "wind_speed_10m_mean", "wind_speed_10m_max", "wind_direction_10m_dominant",
    "precipitation_sum", "snowfall_sum", "relative_humidity_2m_mean",
]
ORDER = CALENDAR + list(LAGS) + list(WINDOWS) + WEATHER
MIN_LEAF = 20
MAX_BINS = 32


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


cal = load("calendar.json")
weather = load("weather.json")["series"]
N = cal["n"]
FIRST = date.fromisoformat(cal["first_day"])
MONTH = np.array([(FIRST + timedelta(days=i)).month for i in range(N)])


def arr(values):
    return np.array([np.nan if v is None else v for v in values], dtype=float)


def day_index(iso):
    return (date.fromisoformat(iso) - FIRST).days


def build(station, features, encoding, horizon, target):
    cols = []  # (feature, name, values)
    weekday = np.array(cal["weekday"], dtype=float)
    holiday = np.array(cal["holiday"])
    corona = np.array(cal["corona"], dtype=float)
    ulez = np.array(cal["ulez"], dtype=float)
    t = np.arange(N)
    for f in ORDER:
        if f not in features:
            continue
        if f == "weekday":
            if encoding == "ordinal":
                cols.append((f, f, weekday))
            else:
                cols += [(f, f"weekday_{k}", (weekday == k).astype(float)) for k in range(1, 7)]
        elif f == "month":
            if encoding == "ordinal":
                cols.append((f, f, MONTH.astype(float)))
            else:
                cols += [(f, f"month_{k}", (MONTH == k).astype(float)) for k in range(2, 13)]
        elif f == "bankHoliday":
            cols.append((f, f, (holiday == 1).astype(float)))
        elif f == "trend":
            cols.append((f, f, t / 365.25))
        elif f == "corona":
            if encoding == "ordinal":
                cols.append((f, f, corona))
            else:
                cols += [(f, f"corona_{k}", (corona == k).astype(float)) for k in (1, 2)]
        elif f == "ulez":
            if encoding == "ordinal":
                cols.append((f, f, ulez))
            else:
                cols += [(f, f"ulez_{k}", (ulez == k).astype(float)) for k in (1, 2, 3)]
        elif f in LAGS:
            lag = LAGS[f]
            v = np.full(N, np.nan)
            v[lag:] = target[:-lag]
            cols.append((f, f, v))
        elif f in WINDOWS:
            width = WINDOWS[f]
            v = np.full(N, np.nan)
            for i in range(N):
                last = i - horizon
                first = last - width + 1
                if first < 0:
                    continue
                w = target[first:last + 1]
                ok = w[~np.isnan(w)]
                if len(ok) >= math.ceil(width / 2):
                    v[i] = ok.mean()
            cols.append((f, f, v))
        elif f == "wind_direction_10m_dominant":
            rad = np.radians(arr(weather[f]))
            cols.append((f, "wind_direction_sin", np.sin(rad)))
            cols.append((f, "wind_direction_cos", np.cos(rad)))
        else:
            cols.append((f, f, arr(weather[f])))
    return cols


def complete_rows(cols, target, lo, hi):
    hi = min(hi, N - 1)
    rows = []
    for t in range(max(0, lo), hi + 1):
        if np.isnan(target[t]):
            continue
        if all(not np.isnan(v[t]) for _, _, v in cols):
            rows.append(t)
    return np.array(rows, dtype=int)


def scores(actual, pred):
    e = pred - actual
    return {"mae": float(np.abs(e).mean()), "rmse": float(math.sqrt((e ** 2).mean())), "bias": float(e.mean())}


def ridge(x, y, lam):
    mean = x.mean(axis=0)
    scale = x.std(axis=0)  # population std, like the browser
    keep = scale > 1e-12
    z = (x[:, keep] - mean[keep]) / scale[keep]
    ym = y.mean()
    gram = z.T @ z + lam * np.eye(z.shape[1])
    coef = np.linalg.solve(gram, z.T @ (y - ym))
    def predict(xx):
        return ym + ((xx[:, keep] - mean[keep]) / scale[keep]) @ coef
    return predict, keep, coef


def run(spec):
    station, kind, mode = spec["station"], spec["kind"], spec["mode"]
    horizon = 1 if mode == "explain" else spec["horizon"]
    target = arr(load(f"no2_{station}.json")["no2"])
    encoding = "dummies" if kind == "linear" else "ordinal"
    cols = build(station, spec["features"], encoding, horizon, target)
    x_all = np.column_stack([v for _, _, v in cols])
    names = [n for _, n, _ in cols]
    tr0, tr1 = (day_index(d) for d in spec["trainPeriod"])
    te0, te1 = (day_index(d) for d in spec["testPeriod"])
    lag = 7 * math.ceil(horizon / 7)

    def measured(lo, hi):
        return [t for t in range(max(0, lo), min(hi, N - 1) + 1) if not np.isnan(target[t])]

    train_rows = complete_rows(cols, target, tr0, tr1)
    test_complete = complete_rows(cols, target, te0, te1)
    test_rows = np.array([t for t in test_complete if t - lag >= 0 and not np.isnan(target[t - lag])], dtype=int)
    counts = {
        "trainMeasured": len(measured(tr0, tr1)),
        "trainRows": int(len(train_rows)),
        "testMeasured": len(measured(te0, te1)),
        "testComplete": int(len(test_complete)),
        "testRows": int(len(test_rows)),
    }
    xtr, ytr = x_all[train_rows], target[train_rows]
    xte, yte = x_all[test_rows], target[test_rows]
    out = {"spec": spec, "counts": counts}
    train_mean = float(np.mean([target[t] for t in measured(tr0, tr1)]))
    out["mean"] = scores(yte, np.full(len(yte), train_mean))
    out["naive"] = scores(yte, np.array([target[t - lag] for t in test_rows]))
    if kind == "linear":
        predict, keep, coef = ridge(xtr, ytr, spec["params"]["ridge"])
        out["model"] = scores(yte, predict(xte))
        out["modelTrain"] = scores(ytr, predict(xtr))
        out["coefficients"] = {n: float(c) for n, c in zip(np.array(names)[keep], coef)}
    else:
        p = spec["params"]
        model = HistGradientBoostingRegressor(
            max_iter=p["trees"], learning_rate=p["rate"], max_depth=p["depth"],
            min_samples_leaf=MIN_LEAF, max_leaf_nodes=None, l2_regularization=0.0,
            max_bins=MAX_BINS, early_stopping=False, random_state=0,
        )
        model.fit(xtr, ytr)
        out["model"] = scores(yte, model.predict(xte))
        out["modelTrain"] = scores(ytr, model.predict(xtr))
    return out


EXPLAIN_FEATURES = [
    "weekday", "month", "bankHoliday", "trend", "corona", "ulez",
    "temperature_2m_mean", "wind_speed_10m_mean", "wind_direction_10m_dominant",
    "precipitation_sum", "relative_humidity_2m_mean",
]


def spec(name, station, kind, mode, horizon, features, train, test, **params):
    base = {"ridge": 1, "trees": 100, "depth": 3, "rate": 0.1}
    base.update(params)
    return {
        "name": name, "station": station, "kind": kind, "mode": mode, "horizon": horizon,
        "features": features, "trainPeriod": train, "testPeriod": test, "params": base,
    }


SPECS = [
    spec("linear explain KC1", "KC1", "linear", "explain", 1, EXPLAIN_FEATURES,
         ["2012-01-01", "2022-12-31"], ["2023-01-01", "2025-12-31"], ridge=1),
    spec("linear forecast 7 days MY1", "MY1", "linear", "forecast", 7,
         ["weekday", "month", "bankHoliday", "trend", "lag7", "lag14", "mean7", "mean28"],
         ["2011-01-01", "2023-12-31"], ["2024-01-01", "2025-12-31"], ridge=10),
    spec("linear forecast 30 days KC1", "KC1", "linear", "forecast", 30,
         ["weekday", "month", "trend", "mean7", "mean28"],
         ["2012-01-01", "2023-12-31"], ["2024-01-01", "2026-10-31"], ridge=0),
    spec("boosting explain KC1", "KC1", "boosting", "explain", 1, EXPLAIN_FEATURES,
         ["2012-01-01", "2022-12-31"], ["2023-01-01", "2025-12-31"], trees=100, depth=3, rate=0.1),
    spec("boosting forecast 1 day BL0", "BL0", "boosting", "forecast", 1,
         ["weekday", "month", "trend", "lag1", "lag7", "mean7", "mean28"],
         ["2011-01-01", "2021-12-31"], ["2022-01-01", "2023-08-31"], trees=100, depth=3, rate=0.1),
]

if __name__ == "__main__":
    cases = [run(s) for s in SPECS]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"cases": cases}, indent=1), encoding="utf-8")
    for c in cases:
        print(c["spec"]["name"], c["counts"]["testRows"], {k: round(c[k]["mae"], 3) for k in ("model", "mean", "naive")})
