# London NO₂ Forecasting

![Hand-built map of central London with the five air-quality stations](assets/london_map.svg)

Time series, played seriously. Five air-quality stations in London, daily NO₂ readings from 2010 to 2023, and six forecasting models, from a plain average to SARIMA, Prophet and gradient boosting, compared fairly with time-based cross-validation. The stations sit on a hand-drawn board-game map of London, built from OpenStreetMap data, because a comparison of models should at least be nice to look at.

NO₂ (nitrogen dioxide) is a traffic-related air pollutant. The data is real and messy: gaps, seasons, a pandemic year. That mess is what makes the model comparison worth doing.

> Work in progress. The forecasting engine is done and tested. The interactive explorer (React + TypeScript, hosted on GitHub Pages) is being built.

## What is in here

**Engine (`backend/forecast_lab`)** compares six models on five stations (BL0, EA6, KC1, MY1, RI2). All models run untuned, so the comparison is about method, not about tweaking.

| Model | Idea |
|---|---|
| Mean | Average of the training window. The honest baseline |
| Seasonal naive (7) | Repeat the same weekday from last week |
| SARIMA | Classical statistical model, (1,0,1)(1,0,1,7) with a constant trend |
| Prophet | Trend plus weekly and yearly seasonality, both switched on explicitly |
| Gradient boosting (recursive) | scikit-learn `HistGradientBoostingRegressor` on lag features (1, 7, 14, 28 days) plus calendar features |
| Gradient boosting (calendar) | Same estimator, calendar features only |

**Validation.** Rolling-origin cross-validation: the first forecast origin is 2018-01-01, a new origin follows every 91 days, each model trains on the 365 days before its origin and forecasts 7, 30, 182 or 364 days ahead. Training windows end strictly before the origin, and gaps are only filled inside the training window. The cross-validation windows end before 2023-01-01. **A separate, one-time final test starts at 2023-01-01** and is reported on its own, never mixed with the cross-validation.

**Evaluation rule, fixed before looking at results.** A fold counts only if at least 80 % of the days in its training window and at least 80 % of the days in its test window are really measured values (interpolated days never count). A station and horizon gets a score only if at least 80 % of its folds count; otherwise it is shown as "not evaluable", with the reason. A looser variant (70 % on all three thresholds) was added after the first run. It is **labelled as post hoc**, written to separate files, and never replaces the main evaluation.

**Checks.** Automatic tests for data leakage in every fold, for forecasts that must not change when future values are tampered with, and a control against known reference values.

## First results

The main metric is the mean absolute error (MAE, in µg/m³), averaged over the folds. "Ahead" below means the lowest mean MAE. There is no significance testing yet.

- Under the strict rule only KC1 and MY1 are evaluable at every horizon. EA6 is evaluable at 7 and 30 days, BL0 and RI2 never are. RI2 has a real gap in its data from mid-2021 to early 2023.
- Where a score exists for KC1 and MY1, SARIMA is ahead in 5 of 8 station/horizon cases.
- At long horizons the plain mean is hard to beat, and Prophet is mostly the weakest.

Read this as a first look, not a verdict. The models are untuned and the cross-validation covers a limited period.

## Run it yourself

Developed and tested with Python 3.14, in a virtual environment.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Put the dataset `london_air_quality_2010_2023_top5_sites.csv` into `data/raw/`. It contains daily NO₂ values for the five stations and was provided as part of a data-science course; the underlying measurements come from the London Air Quality Network (see below). The raw data is not included in this repository. The file used here is about 69 MB, and its SHA-256 checksum starts with `a2902d5c`, so you can check that you hold the same version. The retrieval date is unknown.

```bash
cd backend
python -m pytest tests -q
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 python -m forecast_lab.pipeline
```

The full run takes about 40 seconds on a laptop. The thread variables matter: without them the models compete for CPU cores and the run can be many times slower. Results go to `results/`, together with a manifest that records versions, configuration and git state.

Rebuild the map (needs internet access to OpenStreetMap's Overpass service; downloads are cached in `data/raw/osm`):

```bash
python tools/build_map.py
```

## Limits

- Five stations are not a sample of London, and their data coverage differs a lot. RI2 in particular has a long measurement gap.
- No model tuning yet: default settings on purpose.
- The training window is 365 days. That is short for yearly patterns, which is why Prophet is a rough fit here.
- One final test year (2023) and a limited cross-validation period.

## Data and attribution

- Map data: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database Licence (ODbL). The map in `assets/` is a derived work drawn from that data.
- Air-quality data: London Air Quality Network (LAQN), Environmental Research Group, Imperial College London. The raw data is not redistributed