"""Pflichtpruefungen. Start im Projektordner: python -m pytest tests -q"""
from pathlib import Path

import numpy as np

from forecast_lab import cv, data
from forecast_lab.models import baseline

CSV = Path(__file__).resolve().parent.parent / "data" / "raw" / "london_air_quality_2010_2023_top5_sites.csv"
RAW = data.load_raw(str(CSV))
SERIES = {s: data.daily_series(RAW, s) for s in data.STATIONS}


def test_no_leakage_in_every_fold():
    for st, s in SERIES.items():
        for h in cv.HORIZONS:
            for f in cv.make_folds(h) + [cv.final_fold(h)]:
                tr, te = cv.split(s, f)
                assert tr.index.max() < f.origin <= te.index.min(), (st, h, f.origin)
                if not f.final:
                    assert te.index.max() < cv.CV_END, "CV-Test reicht in 2023"
                    assert tr.index.max() < cv.CV_END


def test_forecast_independent_of_future_values():
    """Testwerte werden verfaelscht: Prognosen duerfen sich nicht aendern."""
    rng = np.random.default_rng(0)
    modelle = [("mean", baseline.mean_all), ("naive", baseline.naive),
               ("snaive", baseline.seasonal_naive(7)), ("recent", baseline.mean_recent(365))]
    for name, fn in modelle:
        for st in ("KC1", "RI2"):
            s = SERIES[st]
            f = cv.make_folds(30)[5]
            a = cv.run_fold(s, f, fn)["prognose"].to_numpy()
            s2 = s.copy()
            future = s2.index >= f.origin
            s2[future] = rng.uniform(0, 500, future.sum())
            b = cv.run_fold(s2, f, fn)["prognose"].to_numpy()
            assert np.array_equal(a, b), (name, st)


def test_imputation_only_inside_train():
    """Train wird aufgefuellt, Testluecken bleiben Luecken (valid=False)."""
    s = SERIES["RI2"]
    f = cv.final_fold(364)
    raw_tr, raw_te = cv.split(s, f)
    assert raw_te.isna().sum() > 0, "Testfall braucht Luecken im Test"
    assert not cv.prepare_train(raw_tr).isna().any()
    out = cv.run_fold(s, f, baseline.mean_all)
    assert int(out["valid"].sum()) == int(raw_te.notna().sum())
    assert (out.loc[~out["valid"], "wahr"].isna()).all()


def test_kc1_control_matches_notebook():
    """Kontrolltest: gleicher Split/Imputation wie Notebook (Train < 2023, Test 2023).
    Referenzen: Mittelwert-MAE 16.57 (Andys Notebook), mean_recent(730)=9.027015697607274."""
    s = SERIES[data.CONTROL_STATION]
    train = cv.prepare_train(s[s.index < "2023-01-01"])
    test = s[s.index >= "2023-01-01"].dropna()
    assert len(test) == 363
    m = np.abs(test - train.mean()).mean()
    r = np.abs(test - train.iloc[-730:].mean()).mean()
    assert abs(m - 16.57) < 0.005, m
    assert abs(r - 9.027015697607274) < 1e-9, r