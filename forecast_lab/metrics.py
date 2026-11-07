from __future__ import annotations
import numpy as np
import pandas as pd


def mae(df: pd.DataFrame) -> float:
    d = df[df["valid"]]
    return float((d["wahr"] - d["prognose"]).abs().mean()) if len(d) else float("nan")


def paired_summary(fold_scores: pd.DataFrame, a: str, b: str) -> dict:
    """Paarweiser MAE-Vergleich a - b ueber Folds (negativ = a besser).
    fold_scores: Spalten Modell, Ursprung, mae. Keine Signifikanzaussage."""
    p = fold_scores.pivot(index="Ursprung", columns="Modell", values="mae").dropna(subset=[a, b])
    d = p[a] - p[b]
    return {"folds": int(len(d)), "mittel": float(d.mean()), "median": float(d.median()),
            "streuung": float(d.std(ddof=1)) if len(d) > 1 else float("nan"),
            "anteil_a_besser": float((d < 0).mean()) if len(d) else float("nan")}