"""Rolling-Origin-Evaluation ohne Zukunftswissen.

Jeder Fold: Trainingsfenster = die `train_days` Tage VOR dem Ursprung,
Testfenster = die `horizon` Tage AB dem Ursprung. Das Modell sieht nur das
bereinigte Trainingsfenster. Testtage mit NaN zaehlen nicht (Maske).
"""
from __future__ import annotations
from dataclasses import dataclass
import pandas as pd

CV_START = pd.Timestamp("2018-01-01")      # erster moeglicher Ursprung
# Festgelegt am 08.11.2026, vor dem Neulauf: Daten bis 2026-10-31, der Abschlusstest
# ist wie bisher die letzten 364 Tage der Daten (2025-11-02 bis 2026-10-31).
FINAL_ORIGIN = pd.Timestamp("2025-11-02")  # einmaliger Abschlusstest
CV_END = FINAL_ORIGIN                      # CV-Testfenster enden VOR diesem Tag
HORIZONS = (7, 30, 182, 364)
TRAIN_DAYS = 365
STEP_DAYS = 91


@dataclass(frozen=True)
class Fold:
    origin: pd.Timestamp
    horizon: int
    train_days: int | None   # None = expandierend (alles bis zum Ursprung)
    final: bool = False


def make_folds(horizon: int, train_days: int | None = TRAIN_DAYS, step: int = STEP_DAYS) -> list[Fold]:
    folds, o = [], CV_START
    while o + pd.Timedelta(days=horizon) <= CV_END:
        folds.append(Fold(o, horizon, train_days))
        o += pd.Timedelta(days=step)
    assert folds, "keine CV-Folds"
    return folds


def final_fold(horizon: int, train_days: int | None = TRAIN_DAYS) -> Fold:
    return Fold(FINAL_ORIGIN, horizon, train_days, final=True)


def split(series: pd.Series, fold: Fold) -> tuple[pd.Series, pd.Series]:
    """Roh-Train (mit NaN) und Roh-Test (mit NaN) fuer einen Fold."""
    o = fold.origin
    train = series[series.index < o]
    if fold.train_days is not None:
        train = train.iloc[-fold.train_days:]
    test = series[(series.index >= o) & (series.index < o + pd.Timedelta(days=fold.horizon))]
    assert len(train) > 0 and train.index.max() < test.index.min() if len(test) else True
    return train, test


def prepare_train(train: pd.Series) -> pd.Series:
    """Imputation NUR im Trainingsfenster (wie Notebook: linear; Raender mit
    naechstem gueltigen Wert gefuellt)."""
    out = train.interpolate(method="linear").ffill().bfill()
    assert not out.isna().any(), "Trainingsfenster komplett leer"
    return out


def run_fold(series: pd.Series, fold: Fold, forecast_fn) -> pd.DataFrame:
    """Gibt Langformat zurueck: date, wahr, prognose, mit NaN-Maske (valid)."""
    raw_train, raw_test = split(series, fold)
    train = prepare_train(raw_train)
    horizon_idx = pd.date_range(fold.origin, periods=fold.horizon, freq="D")
    pred = forecast_fn(train, fold.horizon)
    assert len(pred) == fold.horizon, "Prognose hat falsche Laenge"
    pred = pd.Series(pred.values if hasattr(pred, "values") else pred, index=horizon_idx)
    out = pd.DataFrame({"wahr": raw_test.reindex(horizon_idx), "prognose": pred})
    out["valid"] = out["wahr"].notna()
    out.index.name = "date"
    return out