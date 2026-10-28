import csv
import io
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.models.schemas import (
    DailyMetricsResponse,
    LeadTimeMetricsResponse,
    MetricsSummaryResponse,
)
from app.services.cache_service import cache_service
from app.services.metrics_service import metrics_service
from app.services.vintage_selection_service import vintage_selection_service

router = APIRouter(tags=["Accuracy Metrics & Export"])


def _validate_jan_date(d: str) -> None:
    if not (len(d) == 10 and "2026-01-01" <= d <= "2026-01-31"):
        raise HTTPException(
            status_code=400,
            detail=f"Date '{d}' must be between 2026-01-01 and 2026-01-31.",
        )


@router.get("/api/metrics/summary", response_model=MetricsSummaryResponse)
def get_metrics_summary(
    start_date: str = Query(default="2026-01-01"),
    end_date: str = Query(default="2026-01-31"),
    cutoff_time_london: str = Query(default="11:00"),
    cutoff_day_offset: int = Query(default=-1, ge=-3, le=0),
    fixed_horizon_hours: Optional[float] = Query(default=None, ge=0.5, le=72.0),
) -> MetricsSummaryResponse:
    _validate_jan_date(start_date)
    _validate_jan_date(end_date)
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date.")

    actuals_df = cache_service.load_actuals_hourly(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    vintages_df = cache_service.load_forecasts_vintages(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )

    records = vintage_selection_service.select_forecasts_for_window(
        actuals_hourly_df=actuals_df,
        vintages_df=vintages_df,
        start_date_london=start_date,
        end_date_london=end_date,
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
        fixed_horizon_hours=fixed_horizon_hours,
    )

    summary = metrics_service.calculate_summary_metrics(
        selected_records=records,
        start_date=start_date,
        end_date=end_date,
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
        fixed_horizon_hours=fixed_horizon_hours,
    )
    return MetricsSummaryResponse(**summary)


@router.get("/api/metrics/daily", response_model=DailyMetricsResponse)
def get_daily_metrics(
    start_date: str = Query(default="2026-01-01"),
    end_date: str = Query(default="2026-01-31"),
    cutoff_time_london: str = Query(default="11:00"),
    cutoff_day_offset: int = Query(default=-1, ge=-3, le=0),
    fixed_horizon_hours: Optional[float] = Query(default=None, ge=0.5, le=72.0),
) -> DailyMetricsResponse:
    _validate_jan_date(start_date)
    _validate_jan_date(end_date)

    actuals_df = cache_service.load_actuals_hourly(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    vintages_df = cache_service.load_forecasts_vintages(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )

    records = vintage_selection_service.select_forecasts_for_window(
        actuals_hourly_df=actuals_df,
        vintages_df=vintages_df,
        start_date_london=start_date,
        end_date_london=end_date,
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
        fixed_horizon_hours=fixed_horizon_hours,
    )

    res = metrics_service.calculate_daily_metrics(
        selected_records=records,
        start_date=start_date,
        end_date=end_date,
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
    )
    return DailyMetricsResponse(**res)


@router.get("/api/metrics/lead-time", response_model=LeadTimeMetricsResponse)
def get_lead_time_metrics(
    start_date: str = Query(default="2026-01-01"),
    end_date: str = Query(default="2026-01-31"),
) -> LeadTimeMetricsResponse:
    _validate_jan_date(start_date)
    _validate_jan_date(end_date)

    actuals_df = cache_service.load_actuals_hourly(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    vintages_df = cache_service.load_forecasts_vintages(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )

    res = metrics_service.calculate_lead_time_horizon_metrics(
        actuals_hourly_df=actuals_df,
        vintages_df=vintages_df,
        start_date=start_date,
        end_date=end_date,
    )
    return LeadTimeMetricsResponse(**res)


@router.get("/api/export/csv")
def export_selected_forecasts_csv(
    start_date: str = Query(default="2026-01-01"),
    end_date: str = Query(default="2026-01-31"),
    cutoff_time_london: str = Query(default="11:00"),
    cutoff_day_offset: int = Query(default=-1, ge=-3, le=0),
):
    _validate_jan_date(start_date)
    _validate_jan_date(end_date)

    actuals_df = cache_service.load_actuals_hourly(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    vintages_df = cache_service.load_forecasts_vintages(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    records = vintage_selection_service.select_forecasts_for_window(
        actuals_hourly_df=actuals_df,
        vintages_df=vintages_df,
        start_date_london=start_date,
        end_date_london=end_date,
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
    )

    output = io.StringIO()
    fieldnames = [
        "target_start_utc",
        "target_start_london",
        "delivery_date_london",
        "delivery_hour_london",
        "cutoff_utc",
        "cutoff_london",
        "actual_hh_00_mw",
        "actual_hh_30_mw",
        "actual_hourly_mw",
        "forecast_mw",
        "forecast_publish_utc",
        "forecast_publish_london",
        "lead_time_hours",
        "error_mw",
        "abs_error_mw",
        "pct_error",
        "error_direction",
        "eligible_vintages_count",
        "excluded_future_vintages_count",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in records:
        writer.writerow(row)

    output.seek(0)
    filename = f"windline_jan2026_{start_date}_to_{end_date}_cutoff_{cutoff_time_london.replace(':', '')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
