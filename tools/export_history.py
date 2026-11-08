"""Export monthly NO2 means per station for the explorer's history tab.

Writes frontend/public/data/history_<CODE>.json (one file per station).
Uses the same daily rule as the forecasting engine (a day counts only with
enough distinct hourly values), so history and model comparison share one
data basis. A month without any measured day has mean null (a gap).

Run from the project root, with the project's virtual environment active
(pandas is needed):
  python tools/export_history.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from forecast_lab import data  # noqa: E402

OUT = ROOT / "frontend" / "public" / "data"


def main() -> None:
    manifest_path = ROOT / "results" / "run_manifest.json"
    if not manifest_path.exists():
        sys.exit(f"Missing file: {manifest_path} (run the pipeline first)")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    block = manifest["daten"]
    csv_path = ROOT / "data" / "raw" / block["datei"]
    if not csv_path.exists():
        sys.exit(f"Missing data file: {csv_path}")

    digest = hashlib.sha256(csv_path.read_bytes()).hexdigest()
    if digest != block["sha256"]:
        sys.exit(
            "Data file does not match the last pipeline run "
            f"(sha256 {digest[:8]}... vs {block['sha256'][:8]}...). "
            "Run the pipeline again or restore the file."
        )

    raw = data.load_raw(str(csv_path))
    OUT.mkdir(parents=True, exist_ok=True)

    for code in data.STATIONS:
        daily = data.daily_series(raw, code)
        measured = daily.dropna()
        if measured.empty:
            sys.exit(f"{code}: no measured days")
        grouped = daily.groupby(daily.index.to_period("M"))
        means = grouped.mean()
        counts = grouped.count()

        months = []
        for period in means.index:
            mean = means.loc[period]
            months.append({
                "m": str(period),
                "mean": None if mean != mean else round(float(mean), 1),
                "days": int(counts.loc[period]),
                "of": int(period.days_in_month),
            })

        payload = {
            "station": code,
            "first_day": measured.index.min().date().isoformat(),
            "last_day": measured.index.max().date().isoformat(),
            "measured_days": int(measured.shape[0]),
            "calendar_days": int(daily.shape[0]),
            "months": months,
        }
        path = OUT / f"history_{code}.json"
        path.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        print(
            f"{code}: {payload['measured_days']} of {payload['calendar_days']} days, "
            f"{payload['first_day']} to {payload['last_day']}, {len(months)} months"
        )


if __name__ == "__main__":
    main()