# WINDLINE — Wind Forecast Intelligence & Day-Ahead Analytics

**WINDLINE** is a full-stack analytical application built for UK day-ahead electricity procurement teams. It evaluates national wind generation forecasts against actual wind generation for **January 2026** using official **Elexon BMRS (`FUELHH` & `WINDFOR`)** datasets.

The platform reconstructs historical forecast availability at a configurable purchasing cutoff (default **`11:00 Europe/London on D-1`**), aligns half-hourly settlement actuals into hourly averages, quantifies forecast error distributions, runs leak-free chronological walk-forward backtests, and visualizes decision relationships through an interactive **4-Level Energy Intelligence Tree**, **7-Stage Data Flow Pipeline**, and **Business Energy Scenario Simulator**.

---

## Key January 2026 Empirical Findings (`D-1 11:00 London` Cutoff)

| Metric | Value | Description |
| :--- | :--- | :--- |
| **Evaluation Window** | `2026-01-01` to `2026-01-31` | `744` target hours (`100.0%` paired data coverage) |
| **Mean Absolute Error (MAE)** | **`2,122.81 MW`** | Median Absolute Error: `1,714.00 MW` |
| **Root Mean Squared Error (RMSE)** | **`2,616.69 MW`** | Penalizes large ramp errors (`1.23x` MAE) |
| **Mean Forecast Bias** | **`+1,840.30 MW`** | `error_mw = forecast_mw - actual_mw` (`+` = Overforecast) |
| **Overforecast / Underforecast Split** | **`84.41%` / `15.59%`** | `628` hours overforecast (`+`) vs. `116` hours underforecast (`-`) |
| **Recommended Backup Buffers** | `P50: 1,641 MW` • `P75: 2,991 MW` • `P90: 4,312 MW` | Quantified wind shortfall buffers for thermal reserve planning |

---

## System Architecture

```text
Elexon BMRS API v1 (https://data.elexon.co.uk/bmrs/api/v1)
 ├── /datasets/FUELHH/stream  (Half-hourly WIND actuals)
 └── /datasets/WINDFOR/stream (Multi-vintage hourly wind forecasts)
        │
        ▼
FastAPI Backend (Python 3.12, Pandas, NumPy, HTTPX, Scikit-Learn, SQLite)
 ├── elexon_client.py            : Async HTTPX client with retries & chunked fetching
 ├── normalization_service.py    : UTC normalization, numeric validation & deduplication
 ├── alignment_service.py        : actual_hourly_mw = (hh_00_mw + hh_30_mw) / 2
 ├── vintage_selection_service.py: Selects latest publishTime <= decision_cutoff_utc
 ├── metrics_service.py          : MAE, RMSE, Bias, P05-P95 quantiles & 3h-48h lead horizons
 ├── predictive_service.py       : Expanding-window walk-forward backtest (zero leakage)
 ├── scenario_service.py         : 4-Level Tree, 7-Stage Flow & Scenario Simulator
 └── cache_service.py            : Persistent SQLite store (backend/data/windline_cache.sqlite)
        │
        ▼
React + Vite Frontend (Plain JavaScript/JSX, Recharts, Framer Motion, Custom SVG)
 ├── 00 Home               : Live Elexon status & interactive 2D SVG cutoff preview
 ├── 01 Overview           : Jan 2026 Forecast vs. Actuals, Error Ribbon & Backup Buffers
 ├── 02 Intelligence Tree  : 4-Level SVG Decision Tree, 7-Stage Flow & Scenario Calculator
 ├── 03 Forecast Timeline  : Historical vintage evolution & post-cutoff exclusion audit
 ├── 04 Accuracy Lab       : Error histogram, P05-P95 percentiles, 3h-48h horizons & CSV export
 ├── 05 Predictive Insights: Walk-forward backtest (Elexon vs. Baselines & Lagged Ridge)
 └── 06 Data Observatory   : Record reconciliation audit & 31-day completeness matrix
```

---

## Directory Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health.py                  # GET /api/health
│   │   │   ├── ingestion.py               # GET /api/ingest/status, POST /api/ingest/run
│   │   │   ├── forecasts.py               # GET /api/forecasts/selected, /vintages, /intelligence/tree, POST /api/scenario/simulate
│   │   │   ├── metrics.py                 # GET /api/metrics/summary, /daily, /lead-time, /api/export/csv
│   │   │   ├── predictive.py              # GET /api/predictive/summary, /backtest
│   │   │   └── data_quality.py            # GET /api/data-quality
│   │   ├── models/
│   │   │   └── schemas.py                 # Pydantic request and response schemas
│   │   ├── services/
│   │   │   ├── elexon_client.py           # Async Elexon BMRS stream client
│   │   │   ├── ingestion_service.py       # Ingestion coordinator
│   │   │   ├── normalization_service.py   # Timestamp & numeric validation
│   │   │   ├── alignment_service.py       # Half-hourly to hourly averaging
│   │   │   ├── vintage_selection_service.py # Historical decision cutoff logic
│   │   │   ├── metrics_service.py         # Accuracy & horizon evaluation engine
│   │   │   ├── trend_analysis_service.py  # Diurnal & rolling variability analysis
│   │   │   ├── predictive_service.py      # Chronological walk-forward backtest
│   │   │   ├── scenario_service.py        # Tree & business scenario calculator
│   │   │   └── cache_service.py           # SQLite persistence layer
│   │   ├── config.py                      # Environment-driven settings
│   │   └── main.py                        # FastAPI application entrypoint
│   ├── data/
│   │   ├── windline_cache.sqlite          # Normalized January 2026 SQLite cache
│   │   └── raw_extracts/                  # Reproducible raw Elexon extract metadata
│   ├── tests/
│   │   └── test_windline_core.py          # Pytest automated unit & API test suite
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   └── windline-mark.svg
│   ├── src/
│   │   ├── components/
│   │   │   ├── BusinessScenarioSimulator.jsx
│   │   │   ├── DataLineagePipeline.jsx
│   │   │   ├── EnergyIntelligenceTree.jsx
│   │   │   └── StateBanners.jsx
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── OverviewPage.jsx
│   │   │   ├── IntelligenceTreePage.jsx
│   │   │   ├── ForecastTimelinePage.jsx
│   │   │   ├── AccuracyLabPage.jsx
│   │   │   ├── PredictiveInsightsPage.jsx
│   │   │   └── DataObservatoryPage.jsx
│   │   ├── services/
│   │   │   └── apiClient.js
│   │   ├── styles/
│   │   │   └── tokens.css
│   │   ├── tests/
│   │   │   └── App.test.jsx
│   │   ├── utils/
│   │   │   └── formatters.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vercel.json
│   └── vite.config.js
├── docker-compose.yml
├── render.yaml
├── .env.example
└── README.md
```

---

## Data Sources & Processing Methodology

1. **Actual Wind Generation (`FUELHH`):**
   - Source: [https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) (`fuelType = WIND`).
   - Resolution Alignment: Half-hourly settlement periods (`:00` and `:30`) are paired into hourly delivery averages:
     $$\text{actual\_hourly\_mw} = \frac{\text{actual\_at\_hour\_start\_mw} + \text{actual\_at\_half\_hour\_mw}}{2}$$
   - Missing observations are never converted to zero; incomplete pairs are flagged and excluded from metric calculations while reported in coverage.
2. **Historical Wind Forecasts (`WINDFOR`):**
   - Source: [https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream).
   - Cutoff Selection: For each target delivery interval $t$, selects the record with the greatest `publishTime` satisfying $\text{forecast.startTime} = t$ and $\text{forecast.publishTime} \le \text{cutoff\_utc}$. Forecasts published after the cutoff are excluded.
3. **Forecast Error Convention:**
   $$\text{error\_mw} = \text{forecast\_mw} - \text{actual\_hourly\_mw}$$
   Positive values indicate overforecasting (wind shortfall); negative values indicate underforecasting (wind surplus).

---

## Local Setup & Running Instructions

### Option A: Run with Docker Compose
```bash
docker compose up --build -d
```
- **Frontend UI:** `http://localhost:8080`
- **Backend API & Docs:** `http://localhost:8000/docs`
- **Health Check:** `http://localhost:8000/api/health`

### Option B: Run Locally with Python & Node.js

**1. Start the Backend (`port 8000`):**
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**2. Start the Frontend (`port 5173`):**
```bash
cd frontend
npm install
npm run dev
```
- Open `http://localhost:5173` in your browser.

---

## Running Automated Tests

**Backend Unit & API Tests (`pytest`):**
```bash
cd backend
python -m pytest -v
```

**Frontend Unit Tests & Production Build (`vitest` + `vite`):**
```bash
cd frontend
npm run test
npm run build
```

---

## Deployment

- **Frontend (Vercel):** Import the repository into Vercel with Root Directory set to `frontend` (`frontend/vercel.json` is pre-configured) and set `VITE_API_BASE_URL` to your deployed backend URL.
- **Backend (Render / Railway / Docker Host):** Deploy `./backend/Dockerfile` (or use `render.yaml`) and set `CORS_ORIGINS` to your Vercel frontend domain.

---

## AI-Tool Disclosure & Limitations

- **AI-Tool Disclosure:** AI coding tools were used to assist with FastAPI schema scaffolding, React/SVG layout implementation, and test structure. All Elexon API queries, data alignment rules, cutoff vintage selection logic, and January 2026 analytical results were verified directly against official Elexon BMRS data.
- **Assumptions & Limitations:**
  - The default `11:00 Europe/London on D-1` cutoff represents a standard UK day-ahead auction gate assumption and is configurable in the UI.
  - The core dataset covers January 2026 (`744` hours); a single winter month is insufficient to claim multi-season or year-round predictive generalization.
  - The Business Energy Scenario Simulator uses user-entered hypothetical demand and supply inputs and is strictly isolated from official Elexon accuracy calculations.
