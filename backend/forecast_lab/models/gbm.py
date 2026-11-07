"""Gradient Boosting (HistGradientBoosting). Schnittstelle: forecast(train, horizon) -> array.

Zwei Varianten:
- gbm_recursive: Lag-Features plus Kalender. Fuer Tag t+k werden eigene
  Prognosen als Lags benutzt, nie Testwerte.
- gbm_calendar: nur Kalender (Wochentag, Monat, Tag im Jahr), keine
  Fehlerfortpflanzung, gedacht fuer lange Horizonte.
Standardwerte = Benchmark. Alle Regler sind Parameter (Playground).
Die Einstellungen stehen in `f.params`.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

LAGS = (1, 7, 14, 28)


def _cal(idx: pd.DatetimeIndex) -> np.ndarray:
    return np.column_stack([idx.dayofweek, idx.month, idx.dayofyear])


def _model(seed, max_iter, learning_rate, max_depth, max_leaf_nodes, l2_regularization):
    from sklearn.ensemble import HistGradientBoostingRegressor
    return HistGradientBoostingRegressor(
        random_state=seed, max_iter=max_iter, learning_rate=learning_rate,
        max_depth=max_depth, max_leaf_nodes=max_leaf_nodes,
        l2_regularization=l2_regularization,
    )


def gbm_recursive(lags=LAGS, seed=0, max_iter=200, learning_rate=0.05,
                  max_depth=None, max_leaf_nodes=31, l2_regularization=0.0):
    lags = tuple(lags)
    params = {"variant": "recursive", "lags": list(lags), "seed": seed, "max_iter": max_iter,
              "learning_rate": learning_rate, "max_depth": max_depth,
              "max_leaf_nodes": max_leaf_nodes, "l2_regularization": l2_regularization}

    def f(train: pd.Series, horizon: int):
        y = train.to_numpy(float)
        idx = train.index
        mx = max(lags)
        lag_cols = [y[mx - l: len(y) - l] for l in lags]
        X = np.column_stack(lag_cols + [_cal(idx[mx:])])
        model = _model(seed, max_iter, learning_rate, max_depth, max_leaf_nodes, l2_regularization)
        model.fit(X, y[mx:])
        hist = list(y)
        out = []
        fut = pd.date_range(idx[-1] + pd.Timedelta(days=1), periods=horizon, freq="D")
        cal = _cal(fut)
        for k in range(horizon):
            row = np.array([[hist[-l] for l in lags] + list(cal[k])], float)
            p = float(model.predict(row)[0])
            out.append(p)
            hist.append(p)
        return np.array(out)

    f.__name__ = "gbm_recursive"
    f.params = params
    return f


def gbm_calendar(seed=0, max_iter=150, learning_rate=0.05,
                 max_depth=None, max_leaf_nodes=31, l2_regularization=0.0):
    params = {"variant": "calendar", "seed": seed, "max_iter": max_iter,
              "learning_rate": learning_rate, "max_depth": max_depth,
              "max_leaf_nodes": max_leaf_nodes, "l2_regularization": l2_regularization}

    def f(train: pd.Series, horizon: int):
        model = _model(seed, max_iter, learning_rate, max_depth, max_leaf_nodes, l2_regularization)
        model.fit(_cal(train.index), train.to_numpy(float))
        fut = pd.date_range(train.index[-1] + pd.Timedelta(days=1), periods=horizon, freq="D")
        return model.predict(_cal(fut))

    f.__name__ = "gbm_calendar"
    f.params = params
    return f