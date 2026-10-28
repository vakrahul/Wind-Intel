import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from app.config import settings
from app.services.alignment_service import alignment_service
from app.services.cache_service import CacheService, cache_service
from app.services.elexon_client import ElexonClient, elexon_client
from app.services.normalization_service import normalization_service

logger = logging.getLogger(__name__)


class IngestionService:
    """
    Coordinates downloading, validating, normalizing, aligning, and caching
    January 2026 Elexon FUELHH and WINDFOR datasets.
    """

    def __init__(
        self,
        client: Optional[ElexonClient] = None,
        cache: Optional[CacheService] = None,
    ):
        self.client = client or elexon_client
        self.cache = cache or cache_service
        self._state: Dict[str, Any] = {
            "state": "idle",
            "progress_pct": 0.0,
            "current_step": "Initialized",
            "started_at_utc": None,
            "completed_at_utc": None,
            "last_error": None,
        }

    def _update_progress(self, step: str, pct: float) -> None:
        self._state["current_step"] = step
        self._state["progress_pct"] = round(float(pct), 1)

    def get_status(self) -> Dict[str, Any]:
        counts = self.cache.get_counts()
        saved_meta = self.cache.get_metadata("last_ingestion_audit") or {}

        # If cache already has full Jan 2026 data and state is idle, report completed
        state = self._state["state"]
        progress_pct = self._state["progress_pct"]
        current_step = self._state["current_step"]

        if state == "idle" and counts["actuals_hourly_jan2026_valid"] >= 740:
            state = "completed"
            progress_pct = 100.0
            current_step = "Cached January 2026 Elexon dataset verified and ready"

        return {
            "state": state,
            "progress_pct": progress_pct,
            "current_step": current_step,
            "started_at_utc": self._state["started_at_utc"]
            or saved_meta.get("started_at_utc"),
            "completed_at_utc": self._state["completed_at_utc"]
            or saved_meta.get("completed_at_utc"),
            "last_error": self._state["last_error"],
            "raw_fuelhh_records": int(
                saved_meta.get("raw_fuelhh_records", counts["actuals_hh_total"])
            ),
            "valid_fuelhh_wind_records": counts["actuals_hh_total"],
            "aligned_hourly_actuals_total": counts["actuals_hourly_total"],
            "aligned_hourly_actuals_jan2026": counts["actuals_hourly_jan2026_valid"],
            "raw_windfor_records": int(
                saved_meta.get("raw_windfor_records", counts["forecasts_vintages_total"])
            ),
            "valid_windfor_records": counts["forecasts_vintages_total"],
            "distinct_publish_times": counts["distinct_publish_times"],
            "duplicate_fuelhh_removed": int(saved_meta.get("duplicate_fuelhh_removed", 0)),
            "duplicate_windfor_removed": int(saved_meta.get("duplicate_windfor_removed", 0)),
            "source_urls": {
                "api_base": settings.ELEXON_BASE_URL,
                "fuelhh_stream": f"{settings.ELEXON_BASE_URL}{settings.FUELHH_STREAM_PATH}",
                "windfor_stream": f"{settings.ELEXON_BASE_URL}{settings.WINDFOR_STREAM_PATH}",
                "fuelhh_docs": settings.FUELHH_DOCS_URL,
                "windfor_docs": settings.WINDFOR_DOCS_URL,
            },
            "query_windows": {
                "evaluation_period": f"{settings.EVALUATION_START_DATE} to {settings.EVALUATION_END_DATE}",
                "fuelhh_settlement_dates": f"{settings.INGEST_ACTUALS_FROM_DATE} to {settings.INGEST_ACTUALS_TO_DATE}",
                "windfor_publish_window": f"{settings.INGEST_FORECASTS_PUBLISH_FROM} to {settings.INGEST_FORECASTS_PUBLISH_TO}",
            },
        }

    async def run_ingestion(self, force_refresh: bool = False) -> Dict[str, Any]:
        if self._state["state"] == "running":
            return self.get_status()

        counts = self.cache.get_counts()
        if (
            not force_refresh
            and counts["actuals_hourly_jan2026_valid"] == 744
            and counts["forecasts_vintages_total"] > 10000
        ):
            self._state["state"] = "completed"
            self._state["progress_pct"] = 100.0
            self._state["current_step"] = "Loaded verified January 2026 dataset from local SQLite cache"
            return self.get_status()

        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self._state.update(
            {
                "state": "running",
                "progress_pct": 2.0,
                "current_step": "Starting Elexon BMRS ingestion...",
                "started_at_utc": now_iso,
                "last_error": None,
            }
        )

        try:
            # 1. Fetch FUELHH half-hourly actuals
            raw_fuelhh = await self.client.fetch_fuelhh_wind(
                settlement_date_from=settings.INGEST_ACTUALS_FROM_DATE,
                settlement_date_to=settings.INGEST_ACTUALS_TO_DATE,
                progress_callback=self._update_progress,
            )

            self._update_progress("Normalizing and validating FUELHH half-hourly records...", 31.0)
            hh_df, fuelhh_audit = normalization_service.normalize_fuelhh(raw_fuelhh)

            self._update_progress("Aligning half-hourly actuals into hourly averages...", 33.0)
            hourly_df, align_audit = alignment_service.align_half_hourly_to_hourly(
                hh_df=hh_df,
                expected_start_utc=f"{settings.INGEST_ACTUALS_FROM_DATE}T00:00:00Z",
                expected_end_utc=f"{settings.INGEST_ACTUALS_TO_DATE}T23:00:00Z",
            )

            # 2. Fetch WINDFOR historical forecast vintages
            raw_windfor = await self.client.fetch_windfor_vintages(
                publish_from_iso=settings.INGEST_FORECASTS_PUBLISH_FROM,
                publish_to_iso=settings.INGEST_FORECASTS_PUBLISH_TO,
                progress_callback=self._update_progress,
            )

            self._update_progress("Normalizing and deduplicating WINDFOR vintages...", 84.0)
            vintages_df, windfor_audit = normalization_service.normalize_windfor(
                raw_records=raw_windfor,
                min_target_utc=f"{settings.INGEST_ACTUALS_FROM_DATE}T00:00:00Z",
                max_target_utc="2026-02-01T23:00:00Z",
            )

            # 3. Save reproducible raw extract sample & persist to SQLite
            self._update_progress("Persisting normalized tables and audit metadata to SQLite...", 92.0)
            self.cache.save_raw_extract(
                "elexon_jan2026_extract_summary.json",
                {
                    "extracted_at_utc": now_iso,
                    "fuelhh_sample_first_5": raw_fuelhh[:5],
                    "windfor_sample_first_5": raw_windfor[:5],
                    "fuelhh_audit": fuelhh_audit,
                    "alignment_audit": align_audit,
                    "windfor_audit": windfor_audit,
                },
            )

            self.cache.save_actuals_hh(hh_df)
            self.cache.save_actuals_hourly(hourly_df)
            self.cache.save_forecasts_vintages(vintages_df)

            done_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            audit_payload = {
                "started_at_utc": now_iso,
                "completed_at_utc": done_iso,
                "raw_fuelhh_records": fuelhh_audit["raw_count"],
                "valid_fuelhh_wind_records": fuelhh_audit["valid_unique_count"],
                "duplicate_fuelhh_removed": fuelhh_audit["duplicate_records_removed"],
                "invalid_fuelhh_records": fuelhh_audit["invalid_or_null_records"],
                "alignment_summary": align_audit,
                "raw_windfor_records": windfor_audit["raw_count"],
                "valid_windfor_records": windfor_audit["valid_unique_count"],
                "duplicate_windfor_removed": windfor_audit["duplicate_records_removed"],
                "invalid_windfor_records": windfor_audit["invalid_or_null_records"],
                "distinct_publish_times": windfor_audit["distinct_publish_times"],
                "validation_warnings": (
                    fuelhh_audit["validation_warnings"] + windfor_audit["validation_warnings"]
                )[:30],
            }
            self.cache.save_metadata("last_ingestion_audit", audit_payload)

            self._state.update(
                {
                    "state": "completed",
                    "progress_pct": 100.0,
                    "current_step": "Ingestion and hourly alignment complete",
                    "completed_at_utc": done_iso,
                    "last_error": None,
                }
            )
        except Exception as exc:
            logger.exception("Ingestion failed: %s", exc)
            self._state.update(
                {
                    "state": "failed",
                    "current_step": "Ingestion failed",
                    "last_error": str(exc),
                }
            )
            raise

        return self.get_status()


ingestion_service = IngestionService()
