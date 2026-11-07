"""Prophet. Schnittstelle: forecast(train, horizon) -> array.

Benchmark-Konfiguration (Standardwerte): Wochen- UND Jahresrhythmus ausdruecklich
an, alle uebrigen Parameter wie Prophet-Voreinstellung. Das ist NICHT Prophets
automatische Voreinstellung (die schaltet den Jahresrhythmus bei < 2 Jahren
Trainingsdaten ab). Alle Regler sind Parameter, damit der Playground spaeter
dieselbe Funktion mit anderen Werten aufruft. Die Einstellungen stehen in `f.params`.
"""
from __future__ import annotations
import logging

import numpy as np
import pandas as pd


def prophet_model(
    weekly: bool = True,
    yearly: bool = True,
    changepoint_prior_scale: float = 0.05,
    seasonality_prior_scale: float = 10.0,
    seasonality_mode: str = "additive",
    n_changepoints: int = 25,
    changepoint_range: float = 0.8,
):
    params = {
        "weekly_seasonality": weekly,
        "yearly_seasonality": yearly,
        "daily_seasonality": False,
        "changepoint_prior_scale": changepoint_prior_scale,
        "seasonality_prior_scale": seasonality_prior_scale,
        "seasonality_mode": seasonality_mode,
        "n_changepoints": n_changepoints,
        "changepoint_range": changepoint_range,
    }

    def f(train: pd.Series, horizon: int):
        logging.getLogger("cmdstanpy").setLevel(logging.ERROR)
        logging.getLogger("prophet").setLevel(logging.ERROR)
        from prophet import Prophet
        df = pd.DataFrame({"ds": train.index, "y": train.values})
        m = Prophet(**params)
        m.fit(df)
        fut = pd.DataFrame({"ds": pd.date_range(train.index[-1] + pd.Timedelta(days=1),
                                                periods=horizon, freq="D")})
        return m.predict(fut)["yhat"].to_numpy()

    f.__name__ = "prophet"
    f.params = params
    return f