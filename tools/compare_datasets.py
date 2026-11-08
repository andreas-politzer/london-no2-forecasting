"""Compare the old hourly file (2010 to 2023) with the new download
(2010 to 2026) on the overlapping period, hour by hour.

Run from the project root, with the virtual environment active:
  python tools/compare_datasets.py
"""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OLD = ROOT / "data" / "raw" / "london_air_quality_2010_2023_top5_sites.csv"
NEW = ROOT / "data" / "raw" / "london_air_quality_2010_2026_top5_sites.csv"
COLS = ["datetime", "SiteCode", "no2_level"]
TOLERANCE = 1e-9


def load(path: Path) -> tuple[pd.DataFrame, int]:
    df = pd.read_csv(path, usecols=COLS, parse_dates=["datetime"])
    df = df.dropna(subset=["no2_level"])
    unique = df.drop_duplicates(["SiteCode", "datetime"])
    return unique, len(df) - len(unique)


def main() -> None:
    old, old_dups = load(OLD)
    new, new_dups = load(NEW)
    end = old["datetime"].max()
    new = new[new["datetime"] <= end]
    print(f"Old file: {len(old)} values, {old_dups} duplicate timestamps removed")
    print(f"New file (up to {end}): {len(new)} values, {new_dups} duplicates removed\n")

    m = old.merge(
        new, on=["SiteCode", "datetime"], how="outer",
        suffixes=("_old", "_new"), indicator=True,
    )
    m["diff"] = (m["no2_level_old"] - m["no2_level_new"]).abs()
    m["equal"] = (m["_merge"] == "both") & (m["diff"] < TOLERANCE)
    m["year"] = m["datetime"].dt.year

    rows = []
    for station, g in m.groupby("SiteCode"):
        both = g[g["_merge"] == "both"]
        differing = both[both["diff"] >= TOLERANCE]
        rows.append({
            "station": station,
            "old": int((g["_merge"] != "right_only").sum()),
            "new": int((g["_merge"] != "left_only").sum()),
            "only_old": int((g["_merge"] == "left_only").sum()),
            "only_new": int((g["_merge"] == "right_only").sum()),
            "equal": int(g["equal"].sum()),
            "different": len(differing),
            "max_diff": round(float(differing["diff"].max()), 3) if len(differing) else 0.0,
        })
    print(pd.DataFrame(rows).to_string(index=False))

    mismatch = m[~m["equal"]]
    if len(mismatch):
        print("\nMismatches per station and year (largest first):")
        counts = mismatch.groupby(["SiteCode", "year"]).size().sort_values(ascending=False)
        print(counts.head(15).to_string())
    else:
        print("\nNo mismatches: the overlapping period is identical.")


if __name__ == "__main__":
    main()