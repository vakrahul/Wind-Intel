from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from app.models.schemas import (
    ForecastVintagesResponse,
    SelectedForecastsResponse,
    ScenarioSimulationRequest,
    ScenarioSimulationResponse,
)
from app.services.cache_service import cache_service
from app.services.scenario_service import scenario_service
from app.services.vintage_selection_service import vintage_selection_service

router = APIRouter(tags=["Forecasts & Intelligence Tree"])


def _validate_jan2026_date(d: str) -> str:
    if not (len(d) == 10 and "2026-01-01" <= d <= "2026-01-31"):
        raise HTTPException(
            status_code=400,
            detail=f"Date '{d}' must be within the January 2026 evaluation window (2026-01-01 to 2026-01-31).",
        )
    return d


@router.get("/api/forecasts/selected", response_model=SelectedForecastsResponse)
def get_selected_forecasts(
    start_date: str = Query(default="2026-01-01", description="YYYY-MM-DD in Europe/London"),
    end_date: str = Query(default="2026-01-31", description="YYYY-MM-DD in Europe/London"),
    cutoff_time_london: str = Query(
        default="11:00", description="HH:MM procurement cutoff time in Europe/London"
    ),
    cutoff_day_offset: int = Query(default=-1, ge=-3, le=0, description="Day offset, e.g. -1 for D-1"),
    fixed_horizon_hours: Optional[float] = Query(
        default=None, ge=0.5, le=72.0, description="Optional Mode B fixed lead-time horizon in hours"
    ),
) -> SelectedForecastsResponse:
    _validate_jan2026_date(start_date)
    _validate_jan2026_date(end_date)
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

    valid_paired = sum(
        1
        for r in records
        if r["forecast_mw"] is not None and r["actual_hourly_mw"] is not None
    )
    missing_f = sum(1 for r in records if r["forecast_status"] != "valid")
    missing_a = sum(1 for r in records if r["actual_status"] != "valid")
    mode = "fixed_lead_time" if fixed_horizon_hours is not None else "operational_cutoff"

    return SelectedForecastsResponse(
        evaluation_scope="January 2026 (Elexon FUELHH & WINDFOR)",
        start_date=start_date,
        end_date=end_date,
        selection_mode=mode,
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
        fixed_horizon_hours=fixed_horizon_hours,
        cutoff_assumption_note=(
            f"Historical procurement cutoff set to {cutoff_time_london} Europe/London on D{cutoff_day_offset} "
            "(explicit assignment assumption representing UK Day-Ahead auction gate closure; never selects "
            "a forecast published after the cutoff)."
        ),
        total_target_hours=len(records),
        valid_paired_hours=valid_paired,
        missing_forecast_hours=missing_f,
        missing_actual_hours=missing_a,
        records=records,
    )


@router.get("/api/forecasts/vintages", response_model=ForecastVintagesResponse)
def get_forecast_vintages_for_interval(
    target_start_utc: str = Query(
        default="2026-01-15T17:00:00Z",
        description="Hourly delivery start timestamp in UTC (e.g. 2026-01-15T17:00:00Z)",
    ),
    cutoff_time_london: str = Query(default="11:00"),
    cutoff_day_offset: int = Query(default=-1, ge=-3, le=0),
    fixed_horizon_hours: Optional[float] = Query(default=None, ge=0.5, le=72.0),
) -> ForecastVintagesResponse:
    actuals_df = cache_service.load_actuals_hourly(
        start_utc=target_start_utc, end_utc=target_start_utc
    )
    vintages_df = cache_service.load_forecasts_vintages(
        start_utc=target_start_utc, end_utc=target_start_utc
    )

    result = vintage_selection_service.get_vintages_timeline_for_interval(
        target_start_utc=target_start_utc,
        actuals_hourly_df=actuals_df,
        vintages_df=vintages_df,
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
        fixed_horizon_hours=fixed_horizon_hours,
    )
    return ForecastVintagesResponse(**result)


@router.get("/api/intelligence/tree")
def get_energy_intelligence_tree_context(
    target_start_utc: str = Query(default="2026-01-15T17:00:00Z"),
    cutoff_time_london: str = Query(default="11:00"),
    cutoff_day_offset: int = Query(default=-1, ge=-3, le=0),
):
    actuals_df = cache_service.load_actuals_hourly(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    vintages_df = cache_service.load_forecasts_vintages(
        start_utc="2025-12-31T00:00:00Z", end_utc="2026-02-01T23:00:00Z"
    )
    return scenario_service.build_interval_intelligence_and_lineage(
        target_start_utc=target_start_utc,
        actuals_hourly_df=actuals_df,
        vintages_df=vintages_df,
        cutoff_time_london=cutoff_time_london,
        cutoff_day_offset=cutoff_day_offset,
    )


@router.post("/api/scenario/simulate", response_model=ScenarioSimulationResponse)
def simulate_business_scenario(
    payload: ScenarioSimulationRequest,
) -> ScenarioSimulationResponse:
    actuals_df = cache_service.load_actuals_hourly(
        start_utc=payload.target_start_utc, end_utc=payload.target_start_utc
    )
    vintages_df = cache_service.load_forecasts_vintages(
        start_utc=payload.target_start_utc, end_utc=payload.target_start_utc
    )
    res = scenario_service.simulate_business_scenario(
        req=payload,
        actuals_hourly_df=actuals_df,
        vintages_df=vintages_df,
    )
    return ScenarioSimulationResponse(**res)
