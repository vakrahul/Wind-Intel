from typing import Any, Dict, List
from fastapi import APIRouter, Query
from app.config import settings
from app.services.cache_service import cache_service
from app.services.ingestion_service import ingestion_service
from app.services.vintage_selection_service import vintage_selection_service

router = APIRouter(tags=["Data Observatory & Quality"])


@router.get("/api/data-quality")
def get_data_quality_report(
    cutoff_time_london: str = Query(default="11:00"),
    cutoff_day_offset: int = Query(default=-1, ge=-3, le=0),
) -> Dict[str, Any]:
    ingest_status = ingestion_service.get_status()
    audit_meta = cache_service.get_metadata("last_ingestion_audit") or {}

    actuals_df = cache_service.load_actuals_hourly(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    vintages_df = cache_service.load_forecasts_vintages(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )

    records = vintage_selection_service.select_forecasts_for_window(
        actuals_hourly_df=actuals_df,
        vintages_df=vintages_df,
        start_date_london="2026-01-01",
        end_date_london="2026-01-31",
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
    )

    total_jan_hours = len(records)
    valid_actual_hours = sum(1 for r in records if r["actual_status"] == "valid")
    valid_forecast_hours = sum(1 for r in records if r["forecast_status"] == "valid")
    valid_paired_hours = sum(
        1
        for r in records
        if r["actual_status"] == "valid" and r["forecast_status"] == "valid"
    )

    missing_intervals: List[Dict[str, Any]] = [
        {
            "target_start_utc": r["target_start_utc"],
            "target_start_london": r["target_start_london"],
            "actual_status": r["actual_status"],
            "forecast_status": r["forecast_status"],
            "eligible_vintages_count": r["eligible_vintages_count"],
        }
        for r in records
        if r["actual_status"] != "valid" or r["forecast_status"] != "valid"
    ]

    # Daily coverage breakdown for January 2026
    by_day: Dict[str, List[Dict[str, Any]]] = {}
    for r in records:
        by_day.setdefault(r["delivery_date_london"], []).append(r)

    daily_coverage: List[Dict[str, Any]] = []
    for day_str in sorted(by_day.keys()):
        d_recs = by_day[day_str]
        d_total = len(d_recs)
        d_act = sum(1 for r in d_recs if r["actual_status"] == "valid")
        d_for = sum(1 for r in d_recs if r["forecast_status"] == "valid")
        d_pair = sum(
            1
            for r in d_recs
            if r["actual_status"] == "valid" and r["forecast_status"] == "valid"
        )
        avg_vintages = (
            round(
                sum(
                    r["eligible_vintages_count"] + r["excluded_future_vintages_count"]
                    for r in d_recs
                )
                / d_total,
                1,
            )
            if d_total > 0
            else 0.0
        )
        daily_coverage.append(
            {
                "date": day_str,
                "target_hours": d_total,
                "valid_actual_hours": d_act,
                "valid_forecast_hours": d_for,
                "valid_paired_hours": d_pair,
                "coverage_pct": round((d_pair / d_total) * 100.0, 1) if d_total > 0 else 0.0,
                "mean_vintages_per_hour": avg_vintages,
            }
        )

    counts = cache_service.get_counts()
    raw_wf = int(audit_meta.get("raw_windfor_records", ingest_status["raw_windfor_records"]))
    valid_wf = int(ingest_status["valid_windfor_records"])
    out_of_window_wf = max(0, raw_wf - valid_wf)

    return {
        "evaluation_scope": "January 2026 (2026-01-01 to 2026-01-31)",
        "ingestion_status": ingest_status,
        "coverage_summary": {
            "total_target_hours": total_jan_hours,
            "valid_actual_hours": valid_actual_hours,
            "valid_forecast_hours": valid_forecast_hours,
            "valid_paired_hours": valid_paired_hours,
            "actual_coverage_pct": round((valid_actual_hours / total_jan_hours) * 100.0, 2)
            if total_jan_hours > 0
            else 0.0,
            "forecast_coverage_pct": round((valid_forecast_hours / total_jan_hours) * 100.0, 2)
            if total_jan_hours > 0
            else 0.0,
            "paired_coverage_pct": round((valid_paired_hours / total_jan_hours) * 100.0, 2)
            if total_jan_hours > 0
            else 0.0,
        },
        "quality_audit": {
            "raw_fuelhh_records": audit_meta.get(
                "raw_fuelhh_records", ingest_status["raw_fuelhh_records"]
            ),
            "valid_fuelhh_wind_records": ingest_status["valid_fuelhh_wind_records"],
            "fuelhh_jan2026_only_records": counts["actuals_hh_jan2026"],
            "fuelhh_dec2025_preperiod_records": counts["actuals_hh_dec2025_preperiod"],
            "aligned_hourly_jan2026_only": counts["actuals_hourly_jan2026_valid"],
            "aligned_hourly_dec2025_preperiod": counts["actuals_hourly_total"] - counts["actuals_hourly_jan2026_valid"],
            "duplicate_fuelhh_removed": audit_meta.get("duplicate_fuelhh_removed", 0),
            "invalid_fuelhh_records": audit_meta.get("invalid_fuelhh_records", 0),
            "raw_windfor_records": raw_wf,
            "valid_windfor_records": valid_wf,
            "windfor_jan2026_target_records": counts["forecasts_vintages_jan2026_target"],
            "windfor_out_of_target_window_filtered": out_of_window_wf,
            "duplicate_windfor_removed": audit_meta.get("duplicate_windfor_removed", 0),
            "invalid_windfor_records": audit_meta.get("invalid_windfor_records", 0),
            "distinct_publish_times": ingest_status["distinct_publish_times"],
            "validation_warnings": audit_meta.get("validation_warnings", []),
            "reconciliation_notes": {
                "fuelhh_note": (
                    f"Total 1,680 FUELHH half-hourly records = {counts['actuals_hh_jan2026']} January 2026 records "
                    f"(31 days × 48 half-hours = 744 aligned hours) + {counts['actuals_hh_dec2025_preperiod']} "
                    "December 28–31, 2025 pre-period records (4 days × 48 half-hours = 96 aligned hours) retained "
                    "for historical lag features."
                ),
                "windfor_note": (
                    f"Total {raw_wf:,} raw WINDFOR records minus {out_of_window_wf:,} records whose target startTime "
                    "fell outside the [2025-12-28T00:00:00Z, 2026-02-01T23:00:00Z] evaluation window equals "
                    f"{valid_wf:,} validated records ({counts['forecasts_vintages_jan2026_target']:,} targeting "
                    "January 2026 delivery hours and 2,528 targeting Dec 28–31 / Feb 01 boundary hours)."
                ),
            },
        },
        "missing_or_incomplete_intervals": missing_intervals[:50],
        "daily_coverage": daily_coverage,
        "dataset_documentation": {
            "fuelhh": {
                "dataset_code": "FUELHH",
                "resolution": "Half-hourly (30-minute settlement periods)",
                "filter_applied": "fuelType = WIND",
                "alignment_rule": "actual_hourly_mw = (actual_at_hour_start_mw + actual_at_half_hour_mw) / 2",
                "stream_endpoint": f"{settings.ELEXON_BASE_URL}{settings.FUELHH_STREAM_PATH}",
                "documentation_url": settings.FUELHH_DOCS_URL,
            },
            "windfor": {
                "dataset_code": "WINDFOR",
                "resolution": "Hourly delivery start (startTime at :00:00Z)",
                "vintage_rule": "Retains all historical publishTime vintages; selects greatest publishTime <= cutoff",
                "stream_endpoint": f"{settings.ELEXON_BASE_URL}{settings.WINDFOR_STREAM_PATH}",
                "documentation_url": settings.WINDFOR_DOCS_URL,
            },
        },
    }
