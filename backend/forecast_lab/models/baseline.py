"""Einfache Referenzmodelle. Schnittstelle: forecast(train: pd.Series, horizon: int) -> array."""
from __future__ import annotations
import numpy as np
import pandas as pd


def mean_all(train: pd.Series, horizon: int):
    return np.full(horizon, train.mean())


def naive(train: pd.Series, horizon: int):
    return np.full(horizon, train.iloc[-1])


def seasonal_naive(m: int = 7):
    def f(train: pd.Series, horizon: int):
        last = train.iloc[-m:].to_numpy()
        return np.array([last[i % m] for i in range(horizon)])
    f.__name__ = f"seasonal_naive_{m}"
    return f


def mean_recent(days: int):
    def f(train: pd.Series, horizon: int):
        return np.full(horizon, train.iloc[-days:].mean())
    f.__name__ = f"mean_recent_{days}"
    return f