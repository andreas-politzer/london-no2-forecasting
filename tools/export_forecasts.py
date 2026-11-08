"""Export the daily backtest forecasts for the explorer's forecast tab.

Reads results/forecasts.csv and writes frontend/public/data/forecast_<CODE>.json,
one file per station:

  {"station": "KC1",
   "horizons": {"7": [{"o": "2018-01-01", "final": false,
                       "truth": [..], "f": {"Mean": [..], "SARIMA": [..]}}, ..],
                "30": [..], ..}}

"truth" is the measured daily mean for each forecast day, or null where no
valid measurement exists. Values are rounded to one decimal.
Run from the project root, with the project's virtual environment active:
  python tools/export_forecasts.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "results" / "forecasts.csv"
OUT = ROOT / "frontend" / "public" / "data"

MODELS = [
    "Mean",
    "Seasonal Naive (7)",
    "SARIMA",
    "Prophet (Woche + Jahr explizit)",
    "GBM rekursiv",
    "GBM Kalender",
]
COLUMNS = ["Station", "Modell", "Horizont", "Ursprung", "final", "date", "wahr", "prognose"]


def rounded(values) -> list[float | None]:
    return [None if pd.isna(v) else round(float(v), 1) for v in values]


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"Missing file: {SOURCE} (run the pipeline first)")
    df = pd.read_csv(SOURCE, parse_dates=["date"])
    missing = [c for c in COLUMNS if c not in df.columns]
    if missing:
        sys.exit(f"forecasts.csv: missing columns {missing}")
    if set(df["Modell"]) != set(MODELS):
        sys.exit(f"Unexpected models: {sorted(set(df['Modell']))}")

    OUT.mkdir(parents=True, exist_ok=True)
    for station, sdf in df.groupby("Station"):
        horizons: dict[str, list[dict]] = {}
        for (horizon, origin, final), group in sdf.groupby(
            ["Horizont", "Ursprung", "final"], sort=True
        ):
            truth = None
            forecasts: dict[str, list] = {}
            for model in MODELS:
                part = group[group["Modell"] == model].sort_values("date")
                if len(part) != horizon:
                    sys.exit(f"{station} {horizon} {origin} {model}: {len(part)} rows")
                values = part["wahr"].to_numpy(dtype=float)
                if truth is None:
                    truth = values
                elif not np.array_equal(truth, values, equal_nan=True):
                    sys.exit(f"{station} {horizon} {origin}: truth differs between models")
                forecasts[model] = rounded(part["prognose"])
            horizons.setdefault(str(horizon), []).append({
                "o": str(origin)[:10],
                "final": bool(final),
                "truth": rounded(truth),
                "f": forecasts,
            })
        for entries in horizons.values():
            entries.sort(key=lambda e: e["o"])
        path = OUT / f"forecast_{station}.json"
        path.write_text(
            json.dumps({"station": station, "horizons": horizons},
                       ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        starts = {h: len(e) for h, e in horizons.items()}
        print(f"{station}: {path.stat().st_size / 1024:.0f} KB, starts per horizon {starts}")


if __name__ == "__main__":
    main()