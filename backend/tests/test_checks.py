"""Pflichtpruefungen. Start im Projektordner: python -m pytest tests -q"""
from pathlib import Path

import numpy as np

from forecast_lab import cv, data
from forecast_lab.models import baseline

CSV = Path(__file__).resolve().parents[2] / "data" / "raw" / "london_air_quality_2010_2023_top5_sites.csv"
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


def test_sarima_independent_of_future_values():
    from forecast_lab.models.sarima import sarima
    rng = np.random.default_rng(1)
    s = SERIES["KC1"]
    f = cv.make_folds(30)[8]
    fn = sarima()
    a = cv.run_fold(s, f, fn)["prognose"].to_numpy()
    assert fn.last_converged is not False, "SARIMA nicht konvergiert"
    s2 = s.copy()
    future = s2.index >= f.origin
    s2[future] = rng.uniform(0, 500, future.sum())
    b = cv.run_fold(s2, f, fn)["prognose"].to_numpy()
    assert np.allclose(a, b, atol=1e-8)
    assert np.isfinite(a).all() and len(a) == 30



def test_prophet_independent_of_future_values():
    from forecast_lab.models.prophet_model import prophet_model
    rng = np.random.default_rng(2)
    s = SERIES["KC1"]
    f = cv.make_folds(30)[8]
    fn = prophet_model()
    assert fn.params["weekly_seasonality"] is True and fn.params["yearly_seasonality"] is True
    a = cv.run_fold(s, f, fn)["prognose"].to_numpy()
    s2 = s.copy()
    future = s2.index >= f.origin
    s2[future] = rng.uniform(0, 500, future.sum())
    b = cv.run_fold(s2, f, fn)["prognose"].to_numpy()
    assert np.allclose(a, b, atol=1e-8)
    assert np.isfinite(a).all() and len(a) == 30



def test_gbm_models_independent_of_future_values():
    from forecast_lab.models.gbm import gbm_calendar, gbm_recursive
    rng = np.random.default_rng(3)
    s = SERIES["KC1"]
    f = cv.make_folds(30)[8]
    for fn in (gbm_recursive(), gbm_calendar()):
        a = cv.run_fold(s, f, fn)["prognose"].to_numpy()
        s2 = s.copy()
        future = s2.index >= f.origin
        s2[future] = rng.uniform(0, 500, future.sum())
        b = cv.run_fold(s2, f, fn)["prognose"].to_numpy()
        assert np.allclose(a, b, atol=1e-8), fn.__name__
        assert np.isfinite(a).all() and len(a) == 30, fn.__name__


def test_judge_fold_rules():
    from forecast_lab.pipeline import judge_fold
    base = dict(status="ok", test_abdeckung=1.0, train_abdeckung=1.0)
    ok = judge_fold(dict(base))
    assert ok["zaehlt"] is True and ok["grund"] == ""
    assert judge_fold({**base, "test_abdeckung": 0.8})["zaehlt"] is True
    assert judge_fold({**base, "train_abdeckung": 292 / 365})["zaehlt"] is True
    t = judge_fold({**base, "test_abdeckung": 0.79})
    assert t["zaehlt"] is False and "Testabdeckung" in t["grund"]
    r = judge_fold({**base, "train_abdeckung": 0.5})
    assert r["zaehlt"] is False and "Trainingsabdeckung" in r["grund"]
    e = judge_fold({**base, "status": "fehler: X"})
    assert e["zaehlt"] is False and "Fehler" in e["grund"]


def test_aggregate_scores_and_exclusions():
    import pandas as pd
    from forecast_lab.pipeline import aggregate_scores, exclusions, final_scores

    def row(st, i, zaehlt, mae_, final=False, train=1.0):
        start = pd.Timestamp("2023-01-01") if final else pd.Timestamp("2018-01-01") + pd.Timedelta(days=91 * i)
        return dict(Station=st, Modell="M", Horizont=7, Ursprung=start.date(), final=final, mae=mae_,
                    zaehlt=zaehlt, grund="" if zaehlt else "Ausschluss", status="ok", gueltige_Tage=7,
                    Tage=7, test_abdeckung=1.0, train_abdeckung=train, konvergiert=None)

    rows = [row("X", i, i not in (3, 4), float(i + 1)) for i in range(10)]
    rows.append(row("X", 0, True, 3.0, final=True))
    rows += [row("Y", i, i < 7, 2.0, train=0.4) for i in range(10)]
    f = pd.DataFrame(rows)

    sc = aggregate_scores(f).set_index("Station")
    assert sc.loc["X", "folds_zaehlend"] == 8 and bool(sc.loc["X", "auswertbar"]) is True
    assert abs(sc.loc["X", "mae_mittel"] - 5.75) < 1e-12      # (1+2+3+6+7+8+9+10)/8
    assert abs(sc.loc["X", "mae_median"] - 6.5) < 1e-12
    assert bool(sc.loc["Y", "auswertbar"]) is False            # nur 70 % der Folds zaehlen
    assert np.isnan(sc.loc["Y", "mae_mittel"]) and sc.loc["Y", "grund"].startswith("nur 7 von 10")

    assert abs(final_scores(f).set_index("Station").loc["X", "mae"] - 3.0) < 1e-12

    listing, dist = exclusions(f)
    assert len(listing) == 5
    d = dist.set_index(["Station", "Horizont", "Jahr"])["ausgeschlossene_Urspruenge"]
    assert d[("X", 7, 2018)] == 2 and d[("Y", 7, 2019)] == 2 and d[("Y", 7, 2020)] == 1


def test_lenient_rule_is_separate_and_labelled():
    import pandas as pd
    from forecast_lab.pipeline import RULES, aggregate_scores, final_scores, judge_fold

    assert "NACHTRAEGLICH" in RULES["gelockert"]["hinweis"]
    base = dict(status="ok", test_abdeckung=1.0, train_abdeckung=1.0)
    r = judge_fold({**base, "test_abdeckung": 0.79})
    assert r["zaehlt"] is False and r["zaehlt_gelockert"] is True
    assert judge_fold({**base, "train_abdeckung": 0.5})["zaehlt_gelockert"] is False

    rows = []
    for i in range(10):
        t = 0.75 if i < 3 else 1.0   # 3 von 10 Folds mit 75 % Testabdeckung
        rows.append(judge_fold(dict(
            Station="X", Modell="M", Horizont=7, final=False, mae=float(i + 1), status="ok",
            Ursprung=(pd.Timestamp("2018-01-01") + pd.Timedelta(days=91 * i)).date(),
            gueltige_Tage=7, Tage=7, test_abdeckung=t, train_abdeckung=1.0, konvergiert=None)))
    rows.append(judge_fold(dict(
        Station="X", Modell="M", Horizont=7, final=True, mae=3.0, status="ok",
        Ursprung=pd.Timestamp("2023-01-01").date(), gueltige_Tage=7, Tage=7,
        test_abdeckung=0.75, train_abdeckung=1.0, konvergiert=None)))
    f = pd.DataFrame(rows)

    streng = aggregate_scores(f, "streng").iloc[0]
    locker = aggregate_scores(f, "gelockert").iloc[0]
    assert bool(streng["auswertbar"]) is False and np.isnan(streng["mae_mittel"])   # 7 von 10 = 70 % < 80 %
    assert bool(locker["auswertbar"]) is True and abs(locker["mae_mittel"] - 5.5) < 1e-12
    assert locker["regel"] == "gelockert" and streng["regel"] == "streng"
    assert bool(final_scores(f, "gelockert")["auswertbar"].iloc[0]) is True
    assert bool(final_scores(f, "streng")["auswertbar"].iloc[0]) is False