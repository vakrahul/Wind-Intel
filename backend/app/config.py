import os
from pathlib import Path
from typing import List


class Settings:
    """Centralized environment-driven configuration for WINDLINE."""

    APP_NAME: str = os.getenv("WINDLINE_APP_NAME", "WINDLINE — Wind Forecast Intelligence API")
    APP_VERSION: str = os.getenv("WINDLINE_APP_VERSION", "1.0.0")
    ENVIRONMENT: str = os.getenv("WINDLINE_ENV", "development")

    # Official Elexon BMRS API base and dataset stream paths
    ELEXON_BASE_URL: str = os.getenv(
        "ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1"
    )
    FUELHH_STREAM_PATH: str = "/datasets/FUELHH/stream"
    WINDFOR_STREAM_PATH: str = "/datasets/WINDFOR/stream"

    # Official documentation links
    FUELHH_DOCS_URL: str = (
        "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream"
    )
    WINDFOR_DOCS_URL: str = (
        "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream"
    )

    # HTTP Client behavior
    HTTP_TIMEOUT_SECONDS: float = float(os.getenv("ELEXON_HTTP_TIMEOUT", "45.0"))
    HTTP_MAX_RETRIES: int = int(os.getenv("ELEXON_HTTP_MAX_RETRIES", "3"))
    HTTP_RETRY_BACKOFF_SECONDS: float = float(os.getenv("ELEXON_HTTP_BACKOFF", "1.5"))

    # Evaluation period & ingestion query windows
    EVALUATION_START_DATE: str = os.getenv("EVALUATION_START_DATE", "2026-01-01")
    EVALUATION_END_DATE: str = os.getenv("EVALUATION_END_DATE", "2026-01-31")
    # Fetch late Dec 2025 actuals and forecast publications so D-1 cutoffs and lag baselines for Jan 1-2 have real observations
    INGEST_ACTUALS_FROM_DATE: str = os.getenv("INGEST_ACTUALS_FROM_DATE", "2025-12-28")
    INGEST_ACTUALS_TO_DATE: str = os.getenv("INGEST_ACTUALS_TO_DATE", "2026-01-31")
    INGEST_FORECASTS_PUBLISH_FROM: str = os.getenv(
        "INGEST_FORECASTS_PUBLISH_FROM", "2025-12-27T00:00:00Z"
    )
    INGEST_FORECASTS_PUBLISH_TO: str = os.getenv(
        "INGEST_FORECASTS_PUBLISH_TO", "2026-01-31T23:59:59Z"
    )

    # Default historical procurement cutoff assumption
    DEFAULT_CUTOFF_TIME_LONDON: str = os.getenv("DEFAULT_CUTOFF_TIME_LONDON", "11:00")
    DEFAULT_CUTOFF_DAY_OFFSET: int = int(os.getenv("DEFAULT_CUTOFF_DAY_OFFSET", "-1"))
    DISPLAY_TIMEZONE: str = "Europe/London"
    INTERNAL_TIMEZONE: str = "UTC"

    # Near-zero threshold for suppressing unstable percentage error (MAPE)
    MAPE_MIN_ACTUAL_MW: float = float(os.getenv("MAPE_MIN_ACTUAL_MW", "100.0"))

    # Storage paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = Path(
        os.getenv("WINDLINE_DATA_DIR", str(Path(__file__).resolve().parent.parent / "data"))
    )

    @property
    def SQLITE_DB_PATH(self) -> Path:
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        return self.DATA_DIR / "windline_cache.sqlite"

    @property
    def RAW_EXTRACTS_DIR(self) -> Path:
        raw_dir = self.DATA_DIR / "raw_extracts"
        raw_dir.mkdir(parents=True, exist_ok=True)
        return raw_dir

    @property
    def CORS_ORIGINS(self) -> List[str]:
        raw = os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://localhost:8080",
        )
        return [origin.strip() for origin in raw.split(",") if origin.strip()]


settings = Settings()
