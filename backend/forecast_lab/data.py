"""Datenzugriff: stuendliche LAQN-Daten -> Tagesmittel je Station.

Regeln (identisch zum Kurs-Notebook 2_baseline_models):
- Tagesmittel per resample('D').mean(); fehlende Tage bleiben NaN.
- Es wird HIER NICHT interpoliert. Interpolation passiert nur innerhalb
  eines Trainingsfensters (siehe cv.prepare_train), nie ueber die Testtage.
"""
from __future__ import annotations
import pandas as pd

POLLUTANT = "no2_level"
STATIONS = ["BL0", "EA6", "KC1", "MY1", "RI2"]
CONTROL_STATION = "KC1"
FIRST_DAY, LAST_DAY = "2010-01-01", "2023-12-30"


def load_raw(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path, parse_dates=["datetime"])
    missing = {"datetime", "SiteCode", POLLUTANT} - set(df.columns)
    assert not missing, f"Spalten fehlen: {missing}"
    return df.sort_values("datetime")


def daily_series(df: pd.DataFrame, station: str, col: str = POLLUTANT) -> pd.Series:
    assert station in set(df["SiteCode"]), f"Unbekannte Station {station}"
    s = df.loc[df["SiteCode"] == station].set_index("datetime")[col].resample("D").mean()
    # gemeinsamer Kalender fuer alle Stationen: fehlende Raender werden NaN
    s = s.reindex(pd.date_range(FIRST_DAY, LAST_DAY, freq="D"))
    s.index.name = "date"
    s.name = station
    assert s.index.is_monotonic_increasing and s.index.freq is not None
    return s


def station_metadata(df: pd.DataFrame) -> pd.DataFrame:
    cols = ["SiteCode", "SiteName", "SiteType", "LocalAuthorityName", "Latitude", "Longitude"]
    return df[cols].drop_duplicates("SiteCode").set_index("SiteCode").loc[STATIONS]


def data_quality(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for st in STATIONS:
        s = daily_series(df, st)
        rows.append({"Station": st, "Tage": len(s), "fehlende_Tage": int(s.isna().sum()),
                     "Anteil_fehlend": round(float(s.isna().mean()), 4),
                     "erster_Tag": s.index.min().date(), "letzter_Tag": s.index.max().date()})
    return pd.DataFrame(rows)