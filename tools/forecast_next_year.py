"""Forecast the year after the data ends, for the explorer's outlook view.

Trains all six models on the last 365 days before the first forecast day
(the day after the last day of data) and forecasts 364 days. A station only
gets a forecast if at least the strict training threshold of those 365 days
is really measured (same rule as the evaluation). There is no truth for
these days: the forecast cannot be checked yet.

Writes frontend/public/data/future_<CODE>.json.
Run from the project root, with the project's virtual environment active:
  python tools/forecast_next_year.py
"""

from __future__ import annotations

import json
import sys
import warnings
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

# The pipeline module limits numeric threads before numpy is imported.
from forecast_lab import cv, data  # noqa: E402
from forecast_lab.pipeline import MODEL_FACTORIES, RULES  # noqa: E402

import pandas as pd  # noqa: E402

OUT = ROOT / "frontend" / "public" / "data"
HORIZON = 364
RECENT_DAYS = 120


def rounded(values) -> list[float | None]:
    return [None if pd.isna(v) else round(float(v), 1) for v in values]


def main() -> None:
    warnings.filterwarnings("ignore")
    manifest_path = ROOT / "results" / "run_manifest.json"
    if not manifest_path.exists():
        sys.exit(f"Missing file: {manifest_path} (run the pipeline first)")
    block = json.loads(manifest_path.read_text(encoding="utf-8"))["daten"]
    csv_path = ROOT / "data" / "raw" / block["datei"]
    if not csv_path.exists():
        sys.exit(f"Missing data file: {csv_path}")

    raw = data.load_raw(str(csv_path))
    origin = pd.Timestamp(data.LAST_DAY) + pd.Timedelta(days=1)
    fold = cv.Fold(origin, HORIZON, cv.TRAIN_DAYS)
    threshold = RULES["streng"]["train"]
    OUT.mkdir(parents=True, exist_ok=True)

    for code in data.STATIONS:
        series = data.daily_series(raw, code)
        raw_train, _ = cv.split(series, fold)
        coverage = float(raw_train.notna().mean())
        payload: dict = {
            "station": code,
            "origin": origin.date().isoformat(),
            "horizon": HORIZON,
            "data_until": data.LAST_DAY,
            "train_coverage": round(coverage, 4),
            "generated": date.today().isoformat(),
        }
        if coverage < threshold:
            payload["available"] = False
            payload["reason"] = (
                f"Trainingsabdeckung {coverage:.0%} < {threshold:.0%}"
            )
        else:
            recent = series.iloc[-RECENT_DAYS:]
            payload["available"] = True
            payload["recent"] = {
                "start": recent.index[0].date().isoformat(),
                "values": rounded(recent),
            }
            payload["f"] = {}
            for name, factory in MODEL_FACTORIES.items():
                out = cv.run_fold(series, fold, factory())
                payload["f"][name] = rounded(out["prognose"])
        path = OUT / f"future_{code}.json"
        path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        status = "forecast" if payload["available"] else payload["reason"]
        print(f"{code}: training coverage {coverage:.0%} -> {status}")


if __name__ == "__main__":
    main()