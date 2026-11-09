# London NO₂ Forecasting

![Hand-built map of central London with the five air-quality stations](assets/london_map.svg)

**Live explorer: <https://andreas-politzer.github.io/london-no2-forecasting/>**

Time series, played seriously. Five air-quality stations in London, daily NO₂ readings from 1 January 2010 to 31 October 2026, and six forecasting models, from a plain average to SARIMA, Prophet and gradient boosting, compared fairly with time-based cross-validation. The stations sit on a hand-drawn board-game map of London, built from OpenStreetMap data, because a comparison of models should at least be nice to look at.

NO₂ (nitrogen dioxide) is a traffic-related air pollutant. The data is real and messy: gaps, seasons, a pandemic year, a station that closed. That mess is what makes the model comparison worth doing.

The explorer (React + TypeScript, hosted on GitHub Pages, interface in German) has three tabs and the Playground window. **Prognose** replays every model's forecast against what was really measured, and shows a one-year outlook from the latest data; that outlook can only be checked once the year has passed. **Modelle** compares the models with cross-validation scores. **Verlauf** shows the measured series per station.

**Spielwiese (NO₂ Playground), work in progress.** A fourth part of the explorer for trying things out yourself. Its first section, **Erkunden**, is usable: pick days by period, month, weekday, bank holidays, pandemic and ULEZ phases, wind direction and ranges of weather values, and look at the selection in nine chart types (bars, time series, distribution, boxplot or violin, scatter plot or hexbin, heatmap or correlation, wind rose, calendar, year comparison). Every chart says how many days it rests on and hatches thin groups. A selection can be shared as a link, saved in the browser or exported as a file. **Kombinieren** and **Experimentieren** (a forecasting model you can configure and test in the browser) are announced in the window but not built yet.

The models in the engine still use no holidays, weather or other outside information. The Playground lets you explore how much those factors matter in the data; it does not feed them into the forecasts.

## What is in here

**Engine (`backend/forecast_lab`)** compares six models on five stations (BL0, EA6, KC1, MY1, RI2). All models run untuned, so the comparison is about method, not about tweaking.

| Model | Idea |
|---|---|
| Mean | Average of the training window. The honest baseline |
| Seasonal naive (7) | Repeat the same weekday from last week |
| SARIMA | Classical statistical model, (1,0,1)(1,0,1,7) with a constant trend |
| Prophet | Trend plus weekly and yearly seasonality, both switched on explicitly |
| Gradient boosting (recursive) | scikit-learn `HistGradientBoostingRegressor` on lag features (1, 7, 14, 28 days) plus calendar features |
| Gradient boosting (calendar) | Same estimator, calendar features only (weekday, month, day of year) |

No model uses holidays, weather or other outside information. Those are deliberately left for later.

**Data.** Hourly NO₂ values per station come from the Environmental Research Group (Imperial College London) interface to the London Air Quality Network. A day counts as measured only if it has at least 18 *distinct* hourly values, so duplicated timestamps can never raise the coverage. Everything else is a gap. Timestamps are GMT, as delivered by the interface; daily means are taken over GMT days, not London local days.

**Playground data.** Besides the daily NO₂ values, the Playground uses daily weather (temperature, wind speed and direction, precipitation, snowfall, humidity) from the Open-Meteo archive, one value per day for central London, in GMT days like the air-quality data. Bank holidays, pandemic phases and ULEZ phases are fixed calendar facts. Thresholds, such as what counts as a windy day, are defined once in the exported data and shown in the interface.

**Validation.** Rolling-origin cross-validation: the first forecast origin is 2018-01-01, a new origin follows every 91 days, each model trains on the 365 days before its origin and forecasts 7, 30, 182 or 364 days ahead. Training windows end strictly before the origin, and gaps are only filled inside the training window. The cross-validation windows end before 2025-11-02. **A separate, one-time final test covers the last 364 days of data, starting at 2025-11-02,** and is reported on its own, never mixed with the cross-validation. Only days that were actually measured count, and the same coverage rules apply. Not every station covers the whole window: EA6 stops on 5 January 2026 and BL0 on 3 October 2026, so their final-test scores rest on fewer days, or may come out as "not evaluable".

**Evaluation rule, fixed before looking at results.** A fold counts only if at least 80 % of the days in its training window and at least 80 % of the days in its test window are really measured values (interpolated days never count). A station and horizon gets a score only if at least 80 % of its folds count; otherwise it is shown as "not evaluable", with the reason. A looser variant (70 % on all three thresholds) was added after the first results. It is **labelled as post hoc**, written to separate files, and never replaces the main evaluation. The period, the 18-hour day rule and the final test window were also fixed before the new results were seen.

**Checks.** Backend: automatic tests (`python -m pytest tests -q` in `backend/`), among them: no data leakage in any fold, forecasts that must not change when future values are tampered with (for every model family), the day rule with duplicated timestamps, the final window, the evaluation and exclusion logic, and a control against reference values computed with the course notebook's logic. The Playground data export has its own tests. Frontend: 231 unit tests (Vitest) for the Playground's statistics, day filter, saved states and chart data, checked against reference values from Python.

## First results

The main metric is the mean absolute error (MAE, in µg/m³), averaged over the folds. "Lowest" below means the lowest mean MAE. There is no significance testing yet.

- Under the strict rule only KC1 and MY1 are evaluable, at all four horizons. EA6 misses the 80 % mark narrowly (between about 71 % and 78 % of folds count, depending on the horizon). BL0 and RI2 stay "not evaluable". Under the post hoc 70 % rule EA6 becomes evaluable everywhere and BL0 at 364 days; RI2 never does.
- SARIMA has the lowest error in 6 of the 8 evaluable station/horizon cases: KC1 at 7 and 30 days, and MY1 at all four horizons. At 7 days, for example, SARIMA reaches 6.7 µg/m³ at KC1 against 8.2 for the plain mean, and 13.9 against 16.0 at MY1.
- At KC1 with 182 and 364 days, calendar-only gradient boosting is marginally ahead, and the three best models lie within about 0.6 µg/m³ of each other.
- Prophet has the highest error in 5 of the 8 cases.

### Final test

One window, the last 364 days of data (2 November 2025 to 31 October 2026), scored once and never used to choose anything.

- Under the strict rule KC1, MY1 and RI2 are evaluable at all four horizons. BL0 and EA6 are not: their training year before 2 November 2025 is too thin (60 % and 66 % measured days against the 80 % required). RI2, which has no cross-validation score, is evaluable here because its data is nearly complete in the last year.
- The errors are lower than in the cross-validation. At 7 days, SARIMA reaches 3.2 µg/m³ at KC1 (cross-validation: 6.7) and 2.6 at RI2.
- The ranking changes. SARIMA is lowest in 6 of the 12 evaluable cells (KC1 at 7 and 182 days, RI2 at all four horizons). At MY1 the plain mean is lowest at 7 and 30 days and seasonal naive at 182 and 364 days; at KC1 with 364 days seasonal naive is lowest as well.
- This is one window. Where it disagrees with the cross-validation, in particular at MY1, it is one more look and not a verdict that overrules the many windows of the cross-validation.

Read all of this as a first look, not a verdict. The models are untuned and the cross-validation covers a limited period.

## Run it yourself

Developed and tested with Python 3.14, in a virtual environment.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Download the data (about 670,000 hourly rows, cached per station and month in `data/raw/erg_cache`, so a second run is quick):

```bash
python tools/fetch_erg_data.py
```

The raw data is not part of this repository. The file used for the published results is `london_air_quality_2010_2026_top5_sites.csv` (about 72 MB), data as of 8 November 2026, with SHA-256 checksum `8eceb77ca87790faf2528461065bace8af0ce9613d95ae4c44ff40b98ec657d2`. The upstream service can revise past values, so a later download may differ slightly from this checksum.

```bash
cd backend
python -m pytest tests -q
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 python -m forecast_lab.pipeline
cd ..
```

The full run takes about a minute on a laptop. The thread variables matter: without them the models compete for CPU cores and the run can be many times slower. Results go to `results/`, together with a manifest that records versions, configuration, data checksum and git state.

Export the results for the explorer and start it locally (from the repository root). The Playground has its own data files, built from the air-quality data plus daily weather from Open-Meteo (cached in `data/raw/weather`, not part of the repository):

```bash
python tools/export_frontend_data.py
python tools/fetch_weather.py
python tools/build_playground_data.py
cd frontend
npm ci
npm run dev
```

Frontend checks: `npm test` (unit tests for the Playground's numerics, filters and chart data), `npm run lint` and `npx tsc -b`.

Rebuild the map (from the repository root; needs internet access to OpenStreetMap's Overpass service; downloads are cached in `data/raw/osm`):

```bash
python tools/build_map.py
```

An earlier analysis on the course dataset (2010–2023) is kept as the git tag `stand-2010-2023`.

## Limits

- Five stations are not a sample of London, and their data coverage differs a lot. BL0 has no data between September 2023 and February 2025, EA6 closed on 5 January 2026, and RI2 is only nearly complete from 2025, with long gaps before that.
- No model tuning yet: default settings on purpose.
- The training window is 365 days. That is short for yearly patterns, which is why Prophet is a rough fit here.
- One final test window and a limited cross-validation period.
- Playground: weather is one reanalysis value for all of central London, not measured at the stations. Scatter plot, heatmap, wind rose, calendar and year comparison show only the first selected station. A pattern in a chart is not a cause.

## Data and attribution

- Air-quality data: This information has been obtained from the [Environmental Research Group of Imperial College London](https://www.imperial.ac.uk/school-public-health/environmental-research-group/), using data from the [London Air Quality Network](https://www.londonair.org.uk). This information is licensed under the terms of the [Open Government Licence](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/2/).
- Map data: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database Licence (ODbL). The map in `assets/` is a derived work drawn from that data.
- Weather data for the Playground: [Open-Meteo.com](https://open-meteo.com/) archive API (licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), based on the ERA5 reanalysis, Copernicus Climate Change Service / ECMWF (contains modified Copernicus Climate Change Service information). The values are reanalysis, not station measurements.
- Bank holidays in England: the Python package [`holidays`](https://github.com/vacanza/python-holidays) (MIT licence).
- The code is released under the MIT licence (see `LICENSE`).