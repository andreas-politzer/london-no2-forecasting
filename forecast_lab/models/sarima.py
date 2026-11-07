"""SARIMA mit fester Ordnung. Schnittstelle: forecast(train, horizon) -> array.

Nutzt nur die uebergebene Trainingsreihe. Nach jedem Aufruf steht in
`f.last_converged`, ob die Anpassung konvergiert ist (None = unbekannt).
"""
from __future__ import annotations
import warnings

import numpy as np
import pandas as pd


def sarima(order=(1, 0, 1), seasonal_order=(1, 0, 1, 7), trend="c"):
    def f(train: pd.Series, horizon: int):
        from statsmodels.tsa.arima.model import ARIMA
        y = train.reset_index(drop=True)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            res = ARIMA(y, order=order, seasonal_order=seasonal_order, trend=trend).fit()
            pred = np.asarray(res.forecast(horizon))
        retvals = getattr(res, "mle_retvals", None)
        f.last_converged = bool(retvals["converged"]) if retvals and "converged" in retvals else None
        return pred
    f.__name__ = "sarima"
    f.last_converged = None
    f.params = {"order": order, "seasonal_order": seasonal_order, "trend": trend}
    return f