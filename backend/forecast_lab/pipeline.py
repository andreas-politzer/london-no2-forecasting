"""Rechenkern und Auswertung: Stationen x Horizonte x Folds x Modelle.

Zwei Regelwerke fuer die Auswertbarkeit (siehe RULES):
- "streng" ist die Hauptauswertung, vor den Ergebnissen festgelegt.
- "gelockert" ist eine Zusatzansicht, NACHTRAEGLICH festgelegt, nachdem die
  Ergebnisse der strengen Regel bekannt waren. Sie ersetzt die Hauptauswertung nie.

Ein Fold zaehlt nur, wenn genug Test- UND Trainingstage tatsaechlich gemessen sind
(interpolierte Tage zaehlen nie). Eine Zahl je Station/Modell/Horizont wird nur
gezeigt, wenn genug Folds zaehlen. Sonst steht dort "nicht auswertbar" mit Grund.
Ausgeschlossene Folds bleiben sichtbar (Tabellen und Verteilung).

Aufruf im Projektordner:  python -m forecast_lab.pipeline
"""
from __future__ import annotations
import os

# Vor dem Import von numpy/sklearn: ein Rechenthread je Prozess (sonst blockieren
# sich die parallelen Prozesse gegenseitig und der Lauf wird um ein Vielfaches langsamer).
for _var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "1")

import argparse
import hashlib
import json
import platform
import subprocess
import time
import warnings
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from forecast_lab import cv, data
from forecast_lab.metrics import mae
from forecast_lab.models.baseline import mean_all, seasonal_naive
from forecast_lab.models.gbm import gbm_calendar, gbm_recursive
from forecast_lab.models.prophet_model import prophet_model
from forecast_lab.models.sarima import sarima

EPS = 1e-12

RULES = {
    "streng": dict(
        test=0.8, train=0.8, share=0.8,
        hinweis="Hauptauswertung, vor den Ergebnissen festgelegt"),
    "gelockert": dict(
        test=0.7, train=0.7, share=0.7,
        hinweis="Zusatzansicht, NACHTRAEGLICH festgelegt, nachdem die Ergebnisse der "
                "strengen Regel bekannt waren. Ersetzt die Hauptauswertung nie."),
}
# test/train: Mindestanteil tatsaechlich gemessener Tage je Fold
# share: Mindestanteil zaehlender Folds je Station/Modell/Horizont

DEFAULT_CSV = Path(__file__).resolve().parent.parent / "data" / "raw" / "london_air_quality_2010_2023_top5_sites.csv"

MODEL_FACTORIES = {
    "Mean": lambda: mean_all,
    "Seasonal Naive (7)": lambda: seasonal_naive(7),
    "SARIMA": lambda: sarima(),
    "Prophet (Woche + Jahr explizit)": lambda: prophet_model(),
    "GBM rekursiv": lambda: gbm_recursive(),
    "GBM Kalender": lambda: gbm_calendar(),
}


def model_params(fn) -> dict:
    return getattr(fn, "params", None) or {"name": fn.__name__}


def _col(base: str, rule: str) -> str:
    """Spaltenname je Regelwerk: 'streng' behaelt den Basisnamen."""
    return base if rule == "streng" else f"{base}_{rule}"


def _suffix(rule: str) -> str:
    return "" if rule == "streng" else f"_{rule}"


def _judge(row: dict, rule: str) -> None:
    r = RULES[rule]
    reasons = []
    if row["status"] != "ok":
        reasons.append("Fehler beim Rechnen")
    if row["test_abdeckung"] < r["test"] - EPS:
        reasons.append(f"Testabdeckung {row['test_abdeckung']:.0%} < {r['test']:.0%}")
    if row["train_abdeckung"] < r["train"] - EPS:
        reasons.append(f"Trainingsabdeckung {row['train_abdeckung']:.0%} < {r['train']:.0%}")
    row[_col("zaehlt", rule)] = not reasons
    row[_col("grund", rule)] = "; ".join(reasons)


def judge_fold(row: dict) -> dict:
    """Bewertet einen Fold nach allen Regelwerken (setzt zaehlt/grund je Regel)."""
    for rule in RULES:
        _judge(row, rule)
    return row


def run_station(csv_path: str, station: str, horizons=cv.HORIZONS, model_names=None):
    """Gibt (Prognosen, Fold-Tabelle, Laufzeiten) fuer eine Station zurueck."""
    warnings.filterwarnings("ignore")
    s = data.daily_series(data.load_raw(csv_path), station)
    names = list(model_names or MODEL_FACTORIES)
    fc_rows, fold_rows, times = [], [], {}
    for h in horizons:
        folds = cv.make_folds(h) + [cv.final_fold(h)]
        for name in names:
            fn = MODEL_FACTORIES[name]()
            t0 = time.time()
            for f in folds:
                raw_train, _ = cv.split(s, f)
                row = dict(Station=station, Modell=name, Horizont=h, Ursprung=f.origin.date(),
                           final=f.final, Tage=h, train_abdeckung=float(raw_train.notna().mean()))
                try:
                    out = cv.run_fold(s, f, fn)
                except Exception as e:  # Fehler sichtbar machen, nicht verschlucken
                    row.update(mae=np.nan, gueltige_Tage=0, test_abdeckung=0.0,
                               konvergiert=None, status=f"fehler: {type(e).__name__}: {e}"[:200])
                    fold_rows.append(judge_fold(row))
                    continue
                row.update(mae=mae(out), gueltige_Tage=int(out["valid"].sum()),
                           test_abdeckung=float(out["valid"].mean()),
                           konvergiert=getattr(fn, "last_converged", None), status="ok")
                fold_rows.append(judge_fold(row))
                d = out.reset_index()
                d.insert(0, "Station", station)
                d.insert(1, "Modell", name)
                d.insert(2, "Horizont", h)
                d.insert(3, "Ursprung", f.origin.date())
                d.insert(4, "final", f.final)
                fc_rows.append(d)
            times[f"{name}|{h}"] = round(time.time() - t0, 1)
    forecasts = pd.concat(fc_rows) if fc_rows else pd.DataFrame()
    return forecasts, pd.DataFrame(fold_rows), times


# ------------------------------------------------------------------ Auswertung
def aggregate_scores(folds: pd.DataFrame, rule: str = "streng") -> pd.DataFrame:
    """CV-Ergebnis je Station/Modell/Horizont. Zahl nur, wenn genug Folds zaehlen."""
    share_min = RULES[rule]["share"]
    zc = _col("zaehlt", rule)
    rows = []
    cvf = folds[~folds["final"]]
    for (st, mo, h), g in cvf.groupby(["Station", "Modell", "Horizont"], sort=True):
        n, k = len(g), int(g[zc].sum())
        share = k / n if n else 0.0
        ok = share >= share_min - EPS
        v = g.loc[g[zc], "mae"].dropna()
        rows.append(dict(
            Station=st, Modell=mo, Horizont=h, regel=rule,
            folds_gesamt=n, folds_zaehlend=k,
            anteil_zaehlend=round(share, 4), auswertbar=bool(ok),
            mae_mittel=float(v.mean()) if ok and len(v) else np.nan,
            mae_median=float(v.median()) if ok and len(v) else np.nan,
            grund="" if ok else f"nur {k} von {n} Folds zaehlen ({share:.0%} < {share_min:.0%})",
        ))
    return pd.DataFrame(rows)


def final_scores(folds: pd.DataFrame, rule: str = "streng") -> pd.DataFrame:
    """Einmaliger Abschlusstest je Station/Modell/Horizont."""
    zc, gc = _col("zaehlt", rule), _col("grund", rule)
    f = folds[folds["final"]]
    out = f[["Station", "Modell", "Horizont", "Ursprung", "gueltige_Tage", "Tage",
             "test_abdeckung", "train_abdeckung", zc, gc]].copy()
    out["regel"] = rule
    out["mae"] = np.where(f[zc], f["mae"], np.nan)
    return out.rename(columns={zc: "auswertbar", gc: "grund"}).reset_index(drop=True)


def exclusions(folds: pd.DataFrame, rule: str = "streng"):
    """(Liste aller ausgeschlossenen Folds, Verteilung je Station/Horizont/Jahr)."""
    zc, gc = _col("zaehlt", rule), _col("grund", rule)
    ex = folds[~folds[zc]]
    listing = ex[["Station", "Modell", "Horizont", "Ursprung", "final",
                  "test_abdeckung", "train_abdeckung", gc]].rename(columns={gc: "grund"})
    listing.insert(0, "regel", rule)
    listing = listing.reset_index(drop=True)
    cvx = ex[~ex["final"]].copy()
    if len(cvx):
        cvx["Jahr"] = pd.to_datetime(cvx["Ursprung"]).dt.year
        dist = (cvx.groupby(["Station", "Horizont", "Jahr"])["Ursprung"].nunique()
                .rename("ausgeschlossene_Urspruenge").reset_index())
    else:
        dist = pd.DataFrame(columns=["Station", "Horizont", "Jahr", "ausgeschlossene_Urspruenge"])
    dist.insert(0, "regel", rule)
    return listing, dist


# ------------------------------------------------------------------ Manifest
def _sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _git(*args):
    try:
        return subprocess.check_output(["git", *args], stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return None


def _git_info() -> dict:
    """Git-Stand zu Beginn des Laufs (Ergebnisordner zaehlt nicht als Aenderung)."""
    status = _git("status", "--porcelain", "--", ".", ":(exclude)results")
    return dict(commit=_git("rev-parse", "HEAD"),
                unveraenderte_dateien=(status == "") if status is not None else None)


def build_manifest(csv_path, stations, horizons, model_names, folds, times, dauer_s, git_info) -> dict:
    import sklearn, statsmodels, prophet
    return dict(
        erzeugt_utc=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        dauer_s=round(dauer_s, 1),
        daten=dict(datei=Path(csv_path).name, sha256=_sha256(csv_path),
                   groesse_bytes=os.path.getsize(csv_path), schadstoff=data.POLLUTANT,
                   kalender=[data.FIRST_DAY, data.LAST_DAY],
                   aggregation="Tagesmittel (resample D, mean), fehlende Tage bleiben NaN"),
        stationen=list(stations), horizonte=list(horizons),
        cv=dict(start=str(cv.CV_START.date()), ende=str(cv.CV_END.date()),
                schritt_tage=cv.STEP_DAYS, trainingsfenster_tage=cv.TRAIN_DAYS,
                abschlusstest_ursprung=str(cv.FINAL_ORIGIN.date())),
        evaluation=dict(
            metrik="MAE auf tatsaechlich gemessenen Testtagen",
            imputation="linear, nur innerhalb des Trainingsfensters; Raender ffill/bfill; nie im Test",
            abdeckung_bedeutet="Anteil tatsaechlich gemessener Tage, interpolierte zaehlen nicht",
            hauptauswertung="streng",
            regeln=RULES),
        modelle={n: model_params(MODEL_FACTORIES[n]()) for n in model_names},
        versionen=dict(python=platform.python_version(), pandas=pd.__version__, numpy=np.__version__,
                       sklearn=sklearn.__version__, statsmodels=statsmodels.__version__,
                       prophet=prophet.__version__),
        threads={v: os.environ.get(v) for v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS")},
        git=git_info,
        ergebnis=dict(
            fold_zeilen=int(len(folds)), fehler_folds=int((folds["status"] != "ok").sum()),
            ausgeschlossene_folds={r: int((~folds[_col("zaehlt", r)]).sum()) for r in RULES},
            sarima_nicht_konvergiert=int(((folds["Modell"] == "SARIMA") & (folds["konvergiert"] == False)).sum())),
        laufzeiten_s=times,
    )


# ------------------------------------------------------------------ Aufruf
def _worker(args):
    csv, st, hs, names = args
    return st, *run_station(csv, st, hs, names)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", default=str(DEFAULT_CSV))
    ap.add_argument("--stations", default=",".join(data.STATIONS))
    ap.add_argument("--horizons", default=",".join(map(str, cv.HORIZONS)))
    ap.add_argument("--models", default=",".join(MODEL_FACTORIES))
    ap.add_argument("--out", default="results")
    a = ap.parse_args()
    stations = a.stations.split(",")
    horizons = [int(x) for x in a.horizons.split(",")]
    names = a.models.split(",")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    git_info = _git_info()
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=min(len(stations), os.cpu_count() or 1)) as ex:
        res = []
        for r in ex.map(_worker, [(a.csv, st, horizons, names) for st in stations]):
            print(f"Station {r[0]} fertig ({round(time.time() - t0)} s)", flush=True)
            res.append(r)
    forecasts = pd.concat([r[1] for r in res])
    folds = pd.concat([r[2] for r in res]).reset_index(drop=True)
    times = {r[0]: r[3] for r in res}

    forecasts.to_csv(out / "forecasts.csv", index=False)
    folds.to_csv(out / "folds.csv", index=False)
    for rule in RULES:
        sfx = _suffix(rule)
        aggregate_scores(folds, rule).to_csv(out / f"scores{sfx}.csv", index=False)
        final_scores(folds, rule).to_csv(out / f"final_scores{sfx}.csv", index=False)
        listing, dist = exclusions(folds, rule)
        listing.to_csv(out / f"ausgeschlossene_folds{sfx}.csv", index=False)
        dist.to_csv(out / f"ausschluesse_verteilung{sfx}.csv", index=False)
    data.station_metadata(data.load_raw(a.csv)).reset_index().to_csv(out / "station_metadata.csv", index=False)
    manifest = build_manifest(a.csv, stations, horizons, names, folds, times, time.time() - t0, git_info)
    with open(out / "run_manifest.json", "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1, ensure_ascii=False)
    e = manifest["ergebnis"]
    print(f"fertig in {round(time.time() - t0)} s | Fehler-Folds: {e['fehler_folds']} "
          f"| ausgeschlossene Folds: {e['ausgeschlossene_folds']} | Ausgabe: {out}")


if __name__ == "__main__":
    main()