"""Rechenkern: Stationen x Horizonte x Folds x Modelle -> Fold-Tabelle und Prognosen.

Auswertbarkeit (festgelegt vor den Ergebnissen, siehe Manifest):
- Ein Fold zaehlt nur, wenn mindestens 80 % seiner Testtage UND mindestens 80 %
  seiner Trainingstage tatsaechlich gemessen sind (interpolierte Tage zaehlen nie).
- Ausgeschlossene Folds bleiben in der Tabelle, mit Grund.
"""
from __future__ import annotations
import time
import warnings

import numpy as np
import pandas as pd

from forecast_lab import cv, data
from forecast_lab.metrics import mae
from forecast_lab.models.baseline import mean_all, seasonal_naive
from forecast_lab.models.gbm import gbm_calendar, gbm_recursive
from forecast_lab.models.prophet_model import prophet_model
from forecast_lab.models.sarima import sarima

MIN_TEST_COVERAGE = 0.8    # Anteil gemessener Testtage je Fold
MIN_TRAIN_COVERAGE = 0.8   # Anteil gemessener Trainingstage je Fold
MIN_FOLD_SHARE = 0.8       # Anteil zaehlender Folds je Station/Modell/Horizont (Teil B)
EPS = 1e-12

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


def judge_fold(row: dict) -> dict:
    """Setzt `zaehlt` und `grund` nach den festgelegten Regeln."""
    reasons = []
    if row["status"] != "ok":
        reasons.append("Fehler beim Rechnen")
    if row["test_abdeckung"] < MIN_TEST_COVERAGE - EPS:
        reasons.append(f"Testabdeckung {row['test_abdeckung']:.0%} < {MIN_TEST_COVERAGE:.0%}")
    if row["train_abdeckung"] < MIN_TRAIN_COVERAGE - EPS:
        reasons.append(f"Trainingsabdeckung {row['train_abdeckung']:.0%} < {MIN_TRAIN_COVERAGE:.0%}")
    row["zaehlt"] = not reasons
    row["grund"] = "; ".join(reasons)
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