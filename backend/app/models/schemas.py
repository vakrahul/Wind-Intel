from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str
    database_ready: bool
    january_2026_ready: bool
    cached_hourly_actuals_jan2026: int
    cached_forecast_vintages: int
    last_ingestion_utc: Optional[str] = None
    evaluation_scope: str = "2026-01-01 to 2026-01-31"
    display_timezone: str = "Europe/London"


class IngestionStatusResponse(BaseModel):
    state: str = Field(..., description="idle, running, completed, failed")
    progress_pct: float
    current_step: str
    started_at_utc: Optional[str] = None
    completed_at_utc: Optional[str] = None
    last_error: Optional[str] = None
    raw_fuelhh_records: int
    valid_fuelhh_wind_records: int
    aligned_hourly_actuals_total: int
    aligned_hourly_actuals_jan2026: int
    raw_windfor_records: int
    valid_windfor_records: int
    distinct_publish_times: int
    duplicate_fuelhh_removed: int
    duplicate_windfor_removed: int
    source_urls: Dict[str, str]
    query_windows: Dict[str, str]


class IngestionRunRequest(BaseModel):
    force_refresh: bool = Field(
        default=False,
        description="If true, re-fetches from Elexon BMRS API even if January 2026 cache is complete.",
    )


class SelectedForecastRecord(BaseModel):
    target_start_utc: str
    target_start_london: str
    delivery_date_london: str
    delivery_hour_london: int
    cutoff_utc: str
    cutoff_london: str
    selection_mode: str
    actual_hourly_mw: Optional[float] = None
    actual_hh_00_mw: Optional[float] = None
    actual_hh_30_mw: Optional[float] = None
    actual_status: str
    forecast_mw: Optional[float] = None
    forecast_publish_utc: Optional[str] = None
    forecast_publish_london: Optional[str] = None
    lead_time_hours: Optional[float] = None
    forecast_status: str
    eligible_vintages_count: int
    excluded_future_vintages_count: int
    error_mw: Optional[float] = None
    abs_error_mw: Optional[float] = None
    pct_error: Optional[float] = None
    error_direction: Optional[str] = None


class SelectedForecastsResponse(BaseModel):
    evaluation_scope: str
    start_date: str
    end_date: str
    selection_mode: str
    cutoff_time_london: str
    cutoff_day_offset: int
    fixed_horizon_hours: Optional[float] = None
    cutoff_assumption_note: str
    total_target_hours: int
    valid_paired_hours: int
    missing_forecast_hours: int
    missing_actual_hours: int
    records: List[SelectedForecastRecord]


class ForecastVintageItem(BaseModel):
    publish_time_utc: str
    publish_time_london: str
    forecast_mw: float
    lead_time_hours: float
    qualifies_at_cutoff: bool
    is_selected: bool
    status_label: str


class ForecastVintagesResponse(BaseModel):
    target_start_utc: str
    target_start_london: str
    delivery_date_london: str
    delivery_hour_london: int
    cutoff_utc: str
    cutoff_london: str
    cutoff_time_london: str
    cutoff_day_offset: int
    actual_hourly_mw: Optional[float] = None
    actual_hh_00_mw: Optional[float] = None
    actual_hh_30_mw: Optional[float] = None
    actual_publish_utc: Optional[str] = None
    selected_vintage: Optional[ForecastVintageItem] = None
    error_mw: Optional[float] = None
    abs_error_mw: Optional[float] = None
    error_direction: Optional[str] = None
    total_vintages_count: int
    eligible_vintages_count: int
    excluded_future_vintages_count: int
    vintages: List[ForecastVintageItem]


class ErrorPercentiles(BaseModel):
    p05: Optional[float] = None
    p10: Optional[float] = None
    p25: Optional[float] = None
    p50_median: Optional[float] = None
    p75: Optional[float] = None
    p90: Optional[float] = None
    p95: Optional[float] = None


class HistogramBin(BaseModel):
    bin_start_mw: float
    bin_end_mw: float
    bin_label: str
    count: int
    overforecast_count: int
    underforecast_count: int


class ExtremeErrorEvent(BaseModel):
    target_start_utc: str
    target_start_london: str
    delivery_date_london: str
    actual_hourly_mw: float
    forecast_mw: float
    forecast_publish_utc: str
    lead_time_hours: float
    error_mw: float
    abs_error_mw: float
    error_direction: str


class MetricsSummaryResponse(BaseModel):
    scope_label: str
    start_date: str
    end_date: str
    selection_mode: str
    cutoff_time_london: str
    cutoff_day_offset: int
    fixed_horizon_hours: Optional[float] = None
    unit: str = "MW"
    error_convention: str = "error_mw = forecast_mw - actual_mw (Positive = Overforecast, Negative = Underforecast)"
    total_target_hours: int
    valid_paired_count: int
    missing_forecast_count: int
    missing_actual_count: int
    coverage_pct: float
    sufficient_sample: bool
    mae_mw: Optional[float] = None
    rmse_mw: Optional[float] = None
    mean_bias_mw: Optional[float] = None
    median_abs_error_mw: Optional[float] = None
    mape_pct: Optional[float] = None
    mape_status: str
    mape_suppressed_count: int
    mean_actual_mw: Optional[float] = None
    mean_forecast_mw: Optional[float] = None
    peak_actual_mw: Optional[float] = None
    min_actual_mw: Optional[float] = None
    total_actual_energy_mwh: Optional[float] = None
    total_forecast_energy_mwh: Optional[float] = None
    overforecast_count: int
    underforecast_count: int
    exact_match_count: int
    overforecast_pct: float
    underforecast_pct: float
    mean_lead_time_hours: Optional[float] = None
    error_percentiles_mw: ErrorPercentiles
    abs_error_percentiles_mw: ErrorPercentiles
    error_histogram: List[HistogramBin]
    largest_overforecasts: List[ExtremeErrorEvent]
    largest_underforecasts: List[ExtremeErrorEvent]


class DailyMetricRow(BaseModel):
    delivery_date_london: str
    target_hours: int
    valid_paired_hours: int
    coverage_pct: float
    sufficient_sample: bool
    mean_actual_mw: Optional[float] = None
    mean_forecast_mw: Optional[float] = None
    total_actual_mwh: Optional[float] = None
    total_forecast_mwh: Optional[float] = None
    mae_mw: Optional[float] = None
    rmse_mw: Optional[float] = None
    mean_bias_mw: Optional[float] = None
    max_abs_error_mw: Optional[float] = None
    overforecast_hours: int
    underforecast_hours: int
    mean_lead_time_hours: Optional[float] = None


class DailyMetricsResponse(BaseModel):
    scope_label: str
    start_date: str
    end_date: str
    cutoff_time_london: str
    cutoff_day_offset: int
    unit: str = "MW"
    days: List[DailyMetricRow]


class LeadTimeBucketMetric(BaseModel):
    bucket_id: str
    bucket_label: str
    min_lead_hours: float
    max_lead_hours: float
    paired_hours_count: int
    coverage_pct: float
    sufficient_sample: bool
    mae_mw: Optional[float] = None
    rmse_mw: Optional[float] = None
    mean_bias_mw: Optional[float] = None
    median_abs_error_mw: Optional[float] = None
    overforecast_pct: Optional[float] = None
    underforecast_pct: Optional[float] = None
    mean_actual_lead_hours: Optional[float] = None


class LeadTimeMetricsResponse(BaseModel):
    scope_label: str
    start_date: str
    end_date: str
    unit: str = "MW"
    methodology_note: str
    buckets: List[LeadTimeBucketMetric]


class ScenarioItemResult(BaseModel):
    scenario_id: str
    scenario_label: str
    growth_pct: float
    baseline_demand_mw: float
    projected_demand_mw: float
    other_supply_mw: float
    wind_source_type: str
    wind_contribution_mw: float
    illustrative_residual_mw: float
    illustrative_residual_mwh_per_hour: float
    illustrative_residual_kwh_per_hour: float
    residual_with_forecast_wind_mw: Optional[float] = None
    residual_with_actual_wind_mw: Optional[float] = None
    forecast_vs_actual_residual_delta_mw: Optional[float] = None


class ScenarioSimulationRequest(BaseModel):
    target_start_utc: str = Field(
        default="2026-01-15T17:00:00Z",
        description="Hourly delivery interval in January 2026 (UTC ISO string)",
    )
    cutoff_time_london: str = Field(default="11:00")
    cutoff_day_offset: int = Field(default=-1)
    baseline_demand_mw: float = Field(
        default=28000.0, ge=0.0, le=100000.0, description="User-entered hypothetical demand in MW"
    )
    other_supply_mw: float = Field(
        default=6500.0,
        ge=0.0,
        le=100000.0,
        description="User-entered hypothetical contracted/other supply in MW",
    )
    custom_growth_pct: float = Field(
        default=15.0,
        ge=-50.0,
        le=200.0,
        description="User-entered custom demand growth percentage",
    )
    wind_scaling_pct: float = Field(
        default=100.0,
        gt=0.0,
        le=100.0,
        description="Percentage of national wind applied to this scenario (default 100% national scale)",
    )
    wind_basis: str = Field(
        default="selected_forecast",
        description="'selected_forecast' or 'actual_generation'",
    )

    @field_validator("wind_basis")
    @classmethod
    def validate_wind_basis(cls, v: str) -> str:
        if v not in ("selected_forecast", "actual_generation"):
            raise ValueError("wind_basis must be 'selected_forecast' or 'actual_generation'")
        return v


class ScenarioSimulationResponse(BaseModel):
    is_hypothetical_simulation: bool = True
    disclaimer: str
    formula_documentation: Dict[str, str]
    unit_distinction_note: str
    target_start_utc: str
    target_start_london: str
    cutoff_utc: str
    cutoff_london: str
    official_selected_forecast_mw: Optional[float] = None
    official_forecast_publish_utc: Optional[str] = None
    official_actual_hourly_mw: Optional[float] = None
    official_error_mw: Optional[float] = None
    wind_scaling_pct: float
    scaled_forecast_wind_mw: Optional[float] = None
    scaled_actual_wind_mw: Optional[float] = None
    selected_wind_contribution_mw: float
    wind_basis: str
    custom_scenario: ScenarioItemResult
    comparison_scenarios: List[ScenarioItemResult]
