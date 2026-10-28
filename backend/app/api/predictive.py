from fastapi import APIRouter, Query
from app.services.cache_service import cache_service
from app.services.predictive_service import predictive_service
from app.services.trend_analysis_service import trend_analysis_service
from app.services.vintage_selection_service import vintage_selection_service

router = APIRouter(tags=["Predictive Analytics"])


@router.get("/api/predictive/summary")
def get_predictive_summary(
    cutoff_time_london: str = Query(default="11:00"),
    cutoff_day_offset: int = Query(default=-1, ge=-3, le=0),
):
    actuals_df = cache_service.load_actuals_hourly(
        start_utc="2025-12-28T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    vintages_df = cache_service.load_forecasts_vintages(
        start_utc="2025-12-28T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    jan_records = vintage_selection_service.select_forecasts_for_window(
        actuals_hourly_df=actuals_df,
        vintages_df=vintages_df,
        start_date_london="2026-01-01",
        end_date_london="2026-01-31",
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
    )
    trends = trend_analysis_service.compute_historical_trends(jan_records)
    backtest = predictive_service.run_chronological_backtest(
        actuals_hourly_df=actuals_df,
        vintages_df=vintages_df,
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
    )
    return {
        "evaluation_scope": "January 2026",
        "cutoff_time_london": cutoff_time_london,
        "cutoff_day_offset": cutoff_day_offset,
        "trends": trends,
        "backtest_overview": {
            "validation_status": backtest["validation_status"],
            "methodology": backtest["methodology"],
            "initial_training_window": backtest["initial_training_window"],
            "held_out_evaluation_window": backtest["held_out_evaluation_window"],
            "comparable_held_out_hours": backtest["comparable_held_out_hours"],
            "finding_headline": backtest["finding_headline"],
            "limitations_statement": backtest["limitations_statement"],
            "models": backtest["models"],
        },
    }


@router.get("/api/predictive/backtest")
def get_predictive_backtest(
    cutoff_time_london: str = Query(default="11:00"),
    cutoff_day_offset: int = Query(default=-1, ge=-3, le=0),
    train_end_date: str = Query(default="2026-01-20"),
    eval_start_date: str = Query(default="2026-01-21"),
    eval_end_date: str = Query(default="2026-01-31"),
):
    actuals_df = cache_service.load_actuals_hourly(
        start_utc="2025-12-28T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    vintages_df = cache_service.load_forecasts_vintages(
        start_utc="2025-12-28T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    return predictive_service.run_chronological_backtest(
        actuals_hourly_df=actuals_df,
        vintages_df=vintages_df,
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
        train_end_date_london=train_end_date,
        eval_start_date_london=eval_start_date,
        eval_end_date_london=eval_end_date,
    )
