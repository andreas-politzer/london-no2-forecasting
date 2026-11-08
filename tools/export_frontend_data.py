"""Export the forecast-lab results as small JSON files for the frontend.

Reads the CSV files in results/ and writes to frontend/public/data/:
  stations.json         the five stations (code, name, authority, type, position)
  station_<CODE>.json   everything the Models tab needs for one station
  meta.json             models, horizons, final origin, export date

Standard library only. Run from the project root:
  python3 tools/export_frontend_data.py

Not read on purpose: results/forecasts.csv (daily forecasts, close to raw data).
Values that are not evaluable stay null. There is never a substitute value.
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "results"
OUT = ROOT / "frontend" / "public" / "data"

# Display order of the models (names exactly as in the CSV files).
MODELS = [
    "Mean",
    "Seasonal Naive (7)",
    "SARIMA",
    "Prophet (Woche + Jahr explizit)",
    "GBM rekursiv",
    "GBM Kalender",
]
HORIZONS = [7, 30, 182, 364]
RULES = ("streng", "gelockert")
MODEL_RANK = {m: i for i, m in enumerate(MODELS)}

SCORES_FILES = {"streng": "scores.csv", "gelockert": "scores_gelockert.csv"}
FINAL_FILES = {
    "streng": "final_scores.csv",
    "gelockert": "final_scores_gelockert.csv",
}
EXCLUDED_FILES = {
    "streng": "ausschluesse_verteilung.csv",
    "gelockert": "ausschluesse_verteilung_gelockert.csv",
}

STATION_COLS = [
    "SiteCode", "SiteName", "SiteType", "LocalAuthorityName",
    "Latitude", "Longitude",
]
SCORE_COLS = [
    "Station", "Modell", "Horizont", "regel", "folds_gesamt",
    "folds_zaehlend", "anteil_zaehlend", "auswertbar", "mae_mittel",
    "mae_median", "grund",
]
FINAL_COLS = [
    "Station", "Modell", "Horizont", "Ursprung", "gueltige_Tage", "Tage",
    "test_abdeckung", "train_abdeckung", "auswertbar", "grund", "regel", "mae",
]
EXCLUDED_COLS = [
    "regel", "Station", "Horizont", "Jahr", "ausgeschlossene_Urspruenge",
]
FOLD_COLS = [
    "Station", "Modell", "Horizont", "Ursprung", "final", "Tage",
    "train_abdeckung", "mae", "gueltige_Tage", "test_abdeckung",
    "konvergiert", "status", "zaehlt", "grund", "zaehlt_gelockert",
    "grund_gelockert",
]


class ExportError(Exception):
    pass


def read_csv(name: str, expected: list[str]) -> list[dict[str, str]]:
    path = RESULTS / name
    if not path.exists():
        raise ExportError(f"Missing file: {path}")
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = [c for c in expected if c not in (reader.fieldnames or [])]
        if missing:
            raise ExportError(f"{name}: missing columns {missing}")
        rows = list(reader)
    if not rows:
        raise ExportError(f"{name}: no rows")
    return rows


def num(value: str, digits: int = 4) -> float | None:
    return None if value == "" else round(float(value), digits)


def whole(value: str) -> int | None:
    return None if value == "" else int(float(value))


def flag(value: str) -> bool | None:
    if value == "":
        return None
    if value in ("True", "False"):
        return value == "True"
    raise ExportError(f"Unexpected boolean value: {value!r}")


def text(value: str) -> str | None:
    return None if value == "" else value


def write_json(path: Path, payload: object) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")


def read_manifest() -> dict:
    path = RESULTS / "run_manifest.json"
    if not path.exists():
        raise ExportError(f"Missing file: {path}")
    with path.open(encoding="utf-8") as handle:
        manifest = json.load(handle)
    block = manifest.get("daten")
    if not isinstance(block, dict):
        raise ExportError("run_manifest.json: missing block 'daten'")
    for key in ("datei", "sha256", "kalender", "min_stunden_je_tag"):
        if not block.get(key):
            raise ExportError(f"run_manifest.json: missing key daten.{key}")
    for key in ("start", "ende", "schritt_tage", "trainingsfenster_tage"):
        if not manifest.get("cv", {}).get(key):
            raise ExportError(f"run_manifest.json: missing key cv.{key}")
    for rule in RULES:
        rule_block = manifest.get("evaluation", {}).get("regeln", {}).get(rule, {})
        for key in ("test", "train", "share"):
            if key not in rule_block:
                raise ExportError(f"run_manifest.json: missing regeln.{rule}.{key}")
    return manifest


def main() -> None:
    station_rows = read_csv("station_metadata.csv", STATION_COLS)
    stations = {r["SiteCode"]: r for r in station_rows}

    data = {
        code: {
            "station": code,
            "rules": {
                rule: {"cv": [], "final": [], "excluded_by_year": []}
                for rule in RULES
            },
            "folds": [],
        }
        for code in stations
    }

    def target(code: str, source: str) -> dict:
        if code not in data:
            raise ExportError(f"{source}: unknown station {code!r}")
        return data[code]

    seen_models: set[str] = set()
    seen_horizons: set[int] = set()
    final_origins: set[str] = set()

    for rule, name in SCORES_FILES.items():
        for r in read_csv(name, SCORE_COLS):
            if r["regel"] != rule:
                raise ExportError(f"{name}: unexpected rule {r['regel']!r}")
            seen_models.add(r["Modell"])
            seen_horizons.add(int(r["Horizont"]))
            target(r["Station"], name)["rules"][rule]["cv"].append({
                "model": r["Modell"],
                "horizon": int(r["Horizont"]),
                "evaluable": flag(r["auswertbar"]),
                "folds_total": whole(r["folds_gesamt"]),
                "folds_counted": whole(r["folds_zaehlend"]),
                "share": num(r["anteil_zaehlend"]),
                "mae_mean": num(r["mae_mittel"]),
                "mae_median": num(r["mae_median"]),
                "reason": text(r["grund"]),
            })

    for rule, name in FINAL_FILES.items():
        for r in read_csv(name, FINAL_COLS):
            if r["regel"] != rule:
                raise ExportError(f"{name}: unexpected rule {r['regel']!r}")
            final_origins.add(r["Ursprung"])
            target(r["Station"], name)["rules"][rule]["final"].append({
                "model": r["Modell"],
                "horizon": int(r["Horizont"]),
                "origin": r["Ursprung"],
                "valid_days": whole(r["gueltige_Tage"]),
                "days": whole(r["Tage"]),
                "test_coverage": num(r["test_abdeckung"]),
                "train_coverage": num(r["train_abdeckung"]),
                "evaluable": flag(r["auswertbar"]),
                "reason": text(r["grund"]),
                "mae": num(r["mae"]),
            })

    for rule, name in EXCLUDED_FILES.items():
        for r in read_csv(name, EXCLUDED_COLS):
            if r["regel"] != rule:
                raise ExportError(f"{name}: unexpected rule {r['regel']!r}")
            target(r["Station"], name)["rules"][rule][
                "excluded_by_year"
            ].append({
                "horizon": int(r["Horizont"]),
                "year": int(r["Jahr"]),
                "excluded_origins": int(r["ausgeschlossene_Urspruenge"]),
            })

    for r in read_csv("folds.csv", FOLD_COLS):
        if flag(r["final"]):
            continue  # the final test lives under rules -> final, not here
        target(r["Station"], "folds.csv")["folds"].append({
            "model": r["Modell"],
            "horizon": int(r["Horizont"]),
            "origin": r["Ursprung"],
            "final": flag(r["final"]),
            "days": whole(r["Tage"]),
            "valid_days": whole(r["gueltige_Tage"]),
            "train_coverage": num(r["train_abdeckung"]),
            "test_coverage": num(r["test_abdeckung"]),
            "mae": num(r["mae"]),
            "converged": flag(r["konvergiert"]),
            "status": text(r["status"]),
            "counts_strict": flag(r["zaehlt"]),
            "reason_strict": text(r["grund"]),
            "counts_relaxed": flag(r["zaehlt_gelockert"]),
            "reason_relaxed": text(r["grund_gelockert"]),
        })

    # Consistency checks: fail loudly instead of writing silent gaps.
    if seen_models != set(MODELS):
        raise ExportError(
            f"Model names differ. Found {sorted(seen_models)}, "
            f"expected {sorted(MODELS)}"
        )
    if seen_horizons != set(HORIZONS):
        raise ExportError(f"Unexpected horizons: {sorted(seen_horizons)}")
    if len(final_origins) != 1:
        raise ExportError(f"Expected one final origin, got {final_origins}")

    expected_cv = len(MODELS) * len(HORIZONS)
    for code, station in data.items():
        for rule in RULES:
            count = len(station["rules"][rule]["cv"])
            if count != expected_cv:
                raise ExportError(
                    f"{code}/{rule}: {count} score rows, expected {expected_cv}"
                )
        if not station["folds"]:
            raise ExportError(f"{code}: no fold rows")

    def sort_key(item: dict) -> tuple:
        return (
            MODEL_RANK[item["model"]],
            item["horizon"],
            item.get("origin", ""),
        )

    for station in data.values():
        station["folds"].sort(key=sort_key)
        for rule in RULES:
            block = station["rules"][rule]
            block["cv"].sort(key=sort_key)
            block["final"].sort(key=sort_key)
            block["excluded_by_year"].sort(
                key=lambda e: (e["horizon"], e["year"])
            )

    manifest = read_manifest()

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("station_*.json"):
        old.unlink()

    write_json(OUT / "stations.json", [
        {
            "code": code,
            "site_name": row["SiteName"],
            "authority": row["LocalAuthorityName"],
            "type": row["SiteType"],
            "lat": float(row["Latitude"]),
            "lon": float(row["Longitude"]),
        }
        for code, row in sorted(stations.items())
    ])

    for code, station in sorted(data.items()):
        write_json(OUT / f"station_{code}.json", station)

        write_json(OUT / "meta.json", {
        "generated": date.today().isoformat(),
        "models": MODELS,
        "horizons": HORIZONS,
        "rules": list(RULES),
        "final_origin": next(iter(final_origins)),
        "stations": sorted(stations),
        "dataset": {
            "file": manifest["daten"]["datei"],
            "sha256": manifest["daten"]["sha256"],
            "first_day": manifest["daten"]["kalender"][0],
            "last_day": manifest["daten"]["kalender"][1],
            "min_hours_per_day": manifest["daten"]["min_stunden_je_tag"],
        },
        "config": {
            "cv_start": manifest["cv"]["start"],
            "cv_end": manifest["cv"]["ende"],
            "step_days": manifest["cv"]["schritt_tage"],
            "train_days": manifest["cv"]["trainingsfenster_tage"],
            "thresholds": {
                rule: {
                    k: manifest["evaluation"]["regeln"][rule][k]
                    for k in ("test", "train", "share")
                }
                for rule in RULES
            },
        },
    })

    print(f"Wrote {len(data) + 2} files to {OUT}")
    for path in sorted(OUT.glob("*.json")):
        print(f"  {path.name:<20} {path.stat().st_size / 1024:7.1f} KB")


if __name__ == "__main__":
    try:
        main()
    except ExportError as error:
        sys.exit(f"Export failed: {error}")