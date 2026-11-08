"""Fetch hourly NO2 data of the five stations from the ERG (LAQN) API.

Writes data/raw/london_air_quality_2010_2026_top5_sites.csv with the same
columns as the old file: datetime, SiteCode, no2_level, SiteName, SiteType,
LocalAuthorityName, Latitude, Longitude. Times are GMT, as delivered.

Every response is cached per station and month in data/raw/erg_cache/, so an
interrupted run resumes where it stopped. Delete the cache folder for a fresh
download. data/raw/ is git-ignored: raw data never enters the repository.

Run from the project root:
  python3 tools/fetch_erg_data.py
"""

from __future__ import annotations

import csv
import hashlib
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CACHE = RAW / "erg_cache"
OUT = RAW / "london_air_quality_2010_2026_top5_sites.csv"

BASE = "https://api.erg.ic.ac.uk/AirQuality/"
STATIONS = ["BL0", "EA6", "KC1", "MY1", "RI2"]
SPECIES = "NO2"
FIRST = (2010, 1)
LAST = (2026, 10)
PAUSE = 0.3  # seconds between uncached requests

COLUMNS = [
    "datetime", "SiteCode", "no2_level", "SiteName", "SiteType",
    "LocalAuthorityName", "Latitude", "Longitude",
]


def get_json(path: str) -> dict:
    url = BASE + path
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            if attempt == 3:
                raise SystemExit(f"Request failed: {url} ({error})")
            time.sleep(2 * (attempt + 1))
    raise SystemExit("unreachable")


def months():
    year, month = FIRST
    while (year, month) <= LAST:
        yield year, month
        month += 1
        if month == 13:
            year, month = year + 1, 1


def month_rows(site: str, year: int, month: int) -> list[tuple[str, str]]:
    cache = CACHE / f"{site}_{year}-{month:02d}_v2.json"
    if cache.exists():
        payload = json.loads(cache.read_text(encoding="utf-8"))
    else:
        # EndDate is exclusive: ask up to the first day of the next month,
        # otherwise the last day of every month is missing.
        end_year, end_month = (year + 1, 1) if month == 12 else (year, month + 1)
        payload = get_json(
            f"Data/SiteSpecies/SiteCode={site}/SpeciesCode={SPECIES}"
            f"/StartDate={year}-{month:02d}-01"
            f"/EndDate={end_year}-{end_month:02d}-01/Json"
        )
        cache.write_text(json.dumps(payload), encoding="utf-8")
        time.sleep(PAUSE)
    data = (payload.get("RawAQData") or {}).get("Data") or []
    if isinstance(data, dict):
        data = [data]
    return [
        (d["@MeasurementDateGMT"], d["@Value"])
        for d in data
        if d.get("@Value") not in ("", None)
    ]


def load_sites() -> dict[str, dict]:
    cache = CACHE / "sites.json"
    if cache.exists():
        payload = json.loads(cache.read_text(encoding="utf-8"))
    else:
        payload = get_json("Information/MonitoringSites/GroupName=London/Json")
        cache.write_text(json.dumps(payload), encoding="utf-8")
    sites = {s["@SiteCode"]: s for s in payload["Sites"]["Site"]}
    missing = [code for code in STATIONS if code not in sites]
    if missing:
        raise SystemExit(f"Stations missing in the site list: {missing}")
    return sites


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    sites = load_sites()

    rows: dict[tuple[str, str], str] = {}
    for site in STATIONS:
        count = 0
        for year, month in months():
            for stamp, value in month_rows(site, year, month):
                rows[(stamp, site)] = value
                count += 1
            if month == 12 or (year, month) == LAST:
                print(f"{site} {year}: {count} values so far", flush=True)

    with OUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(COLUMNS)
        for (stamp, site), value in sorted(rows.items()):
            meta = sites[site]
            writer.writerow([
                stamp, site, value, meta["@SiteName"], meta["@SiteType"],
                meta["@LocalAuthorityName"], meta["@Latitude"],
                meta["@Longitude"],
            ])

    digest = hashlib.sha256()
    with OUT.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)

    print(f"\nWrote {OUT}")
    print(f"Rows: {len(rows)}  SHA-256: {digest.hexdigest()}")
    for site in STATIONS:
        stamps = sorted(stamp for (stamp, s) in rows if s == site)
        print(f"  {site}: {len(stamps)} values, {stamps[0]} to {stamps[-1]}")


if __name__ == "__main__":
    main()