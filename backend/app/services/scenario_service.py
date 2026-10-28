from typing import Any, Dict, List, Optional
import pandas as pd
from app.models.schemas import ScenarioItemResult, ScenarioSimulationRequest
from app.services.metrics_service import metrics_service
from app.services.vintage_selection_service import vintage_selection_service


def calculate_illustrative_scenario(
    scenario_id: str,
    scenario_label: str,
    baseline_demand_mw: float,
    growth_pct: float,
    other_supply_mw: float,
    wind_source_type: str,
    wind_contribution_mw: float,
    scaled_forecast_wind_mw: Optional[float] = None,
    scaled_actual_wind_mw: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Implements the exact required scenario mathematics:
      Projected demand MW = Baseline demand MW * (1 + growth percentage / 100)
      Illustrative residual requirement MW = max(0, projected demand MW - other available supply MW - selected wind contribution MW)
    """
    projected_demand_mw = round(float(baseline_demand_mw) * (1.0 + float(growth_pct) / 100.0), 3)
    illustrative_residual_mw = round(
        max(0.0, projected_demand_mw - float(other_supply_mw) - float(wind_contribution_mw)), 3
    )

    # For a 1-hour delivery interval, 1 MW of continuous power equals 1 MWh (1,000 kWh) of energy
    illustrative_residual_mwh = illustrative_residual_mw
    illustrative_residual_kwh = round(illustrative_residual_mw * 1000.0, 1)

    res_forecast_mw: Optional[float] = None
    res_actual_mw: Optional[float] = None
    delta_res_mw: Optional[float] = None

    if scaled_forecast_wind_mw is not None:
        res_forecast_mw = round(
            max(0.0, projected_demand_mw - float(other_supply_mw) - float(scaled_forecast_wind_mw)),
            3,
        )
    if scaled_actual_wind_mw is not None:
        res_actual_mw = round(
            max(0.0, projected_demand_mw - float(other_supply_mw) - float(scaled_actual_wind_mw)),
            3,
        )
    if res_forecast_mw is not None and res_actual_mw is not None:
        # Positive means actual residual requirement was higher than forecast residual requirement (shortfall)
        delta_res_mw = round(res_actual_mw - res_forecast_mw, 3)

    return {
        "scenario_id": scenario_id,
        "scenario_label": scenario_label,
        "growth_pct": round(float(growth_pct), 2),
        "baseline_demand_mw": round(float(baseline_demand_mw), 2),
        "projected_demand_mw": round(projected_demand_mw, 2),
        "other_supply_mw": round(float(other_supply_mw), 2),
        "wind_source_type": wind_source_type,
        "wind_contribution_mw": round(float(wind_contribution_mw), 2),
        "illustrative_residual_mw": round(illustrative_residual_mw, 2),
        "illustrative_residual_mwh_per_hour": round(illustrative_residual_mwh, 2),
        "illustrative_residual_kwh_per_hour": illustrative_residual_kwh,
        "residual_with_forecast_wind_mw": round(res_forecast_mw, 2)
        if res_forecast_mw is not None
        else None,
        "residual_with_actual_wind_mw": round(res_actual_mw, 2)
        if res_actual_mw is not None
        else None,
        "forecast_vs_actual_residual_delta_mw": round(delta_res_mw, 2)
        if delta_res_mw is not None
        else None,
    }


class ScenarioService:
    """
    Provides data for:
    1. The 4-Level Interactive Energy Intelligence Tree & 7-Stage Animated Data-Lineage pipeline.
    2. The separate, optional Business Energy Scenario Simulator.
    """

    @staticmethod
    def simulate_business_scenario(
        req: ScenarioSimulationRequest,
        actuals_hourly_df: pd.DataFrame,
        vintages_df: pd.DataFrame,
    ) -> Dict[str, Any]:
        vintage_ctx = vintage_selection_service.get_vintages_timeline_for_interval(
            target_start_utc=req.target_start_utc,
            actuals_hourly_df=actuals_hourly_df,
            vintages_df=vintages_df,
            cutoff_time_london=req.cutoff_time_london,
            cutoff_day_offset=req.cutoff_day_offset,
        )

        sel_v = vintage_ctx.get("selected_vintage")
        official_forecast_mw: Optional[float] = (
            float(sel_v["forecast_mw"]) if sel_v is not None else None
        )
        official_pub_utc: Optional[str] = (
            str(sel_v["publish_time_utc"]) if sel_v is not None else None
        )
        official_actual_mw: Optional[float] = (
            float(vintage_ctx["actual_hourly_mw"])
            if vintage_ctx.get("actual_hourly_mw") is not None
            else None
        )
        official_error_mw: Optional[float] = (
            float(vintage_ctx["error_mw"])
            if vintage_ctx.get("error_mw") is not None
            else None
        )

        scale_factor = float(req.wind_scaling_pct) / 100.0
        scaled_forecast = (
            round(official_forecast_mw * scale_factor, 3)
            if official_forecast_mw is not None
            else None
        )
        scaled_actual = (
            round(official_actual_mw * scale_factor, 3)
            if official_actual_mw is not None
            else None
        )

        if req.wind_basis == "actual_generation" and scaled_actual is not None:
            selected_wind_mw = scaled_actual
            wind_source_label = (
                f"Official Elexon Actual Wind ({req.wind_scaling_pct:.1f}% share)"
            )
        elif scaled_forecast is not None:
            selected_wind_mw = scaled_forecast
            wind_source_label = (
                f"Official Selected Elexon Forecast ({req.wind_scaling_pct:.1f}% share)"
            )
        else:
            selected_wind_mw = 0.0
            wind_source_label = "No eligible wind record for interval"

        custom_result = calculate_illustrative_scenario(
            scenario_id="custom",
            scenario_label=f"Custom Scenario ({req.custom_growth_pct:+.1f}% Demand)",
            baseline_demand_mw=req.baseline_demand_mw,
            growth_pct=req.custom_growth_pct,
            other_supply_mw=req.other_supply_mw,
            wind_source_type=wind_source_label,
            wind_contribution_mw=selected_wind_mw,
            scaled_forecast_wind_mw=scaled_forecast,
            scaled_actual_wind_mw=scaled_actual,
        )

        presets = [
            ("growth_00", "Current Demand (0%)", 0.0),
            ("growth_10", "Demand +10%", 10.0),
            ("growth_20", "Demand +20%", 20.0),
            ("growth_30", "Demand +30%", 30.0),
        ]
        comparison_results = [
            calculate_illustrative_scenario(
                scenario_id=p_id,
                scenario_label=p_label,
                baseline_demand_mw=req.baseline_demand_mw,
                growth_pct=p_growth,
                other_supply_mw=req.other_supply_mw,
                wind_source_type=wind_source_label,
                wind_contribution_mw=selected_wind_mw,
                scaled_forecast_wind_mw=scaled_forecast,
                scaled_actual_wind_mw=scaled_actual,
            )
            for p_id, p_label, p_growth in presets
        ]

        return {
            "is_hypothetical_simulation": True,
            "disclaimer": (
                "OPTIONAL HYPOTHETICAL SCENARIO DEMONSTRATION: All baseline demand, demand-growth percentages, "
                "and non-wind supply figures are user-entered hypothetical assumptions. They do not describe a real "
                "utility portfolio and are strictly isolated from official Elexon January 2026 forecast accuracy metrics."
            ),
            "formula_documentation": {
                "projected_demand_formula": "Projected demand MW = Baseline demand MW × (1 + growth percentage / 100)",
                "illustrative_residual_formula": "Illustrative residual requirement MW = max(0, projected demand MW - other available supply MW - selected wind contribution MW)",
                "error_convention": "error_mw = forecast_mw - actual_mw",
            },
            "unit_distinction_note": (
                "MW (Megawatts) measures instantaneous electric power rate. MWh (Megawatt-hours) and kWh (Kilowatt-hours) "
                "measure electric energy over time. Across a single 1-hour delivery interval, 1 MW of average power equals "
                "1 MWh (1,000 kWh) of delivered energy."
            ),
            "target_start_utc": vintage_ctx["target_start_utc"],
            "target_start_london": vintage_ctx["target_start_london"],
            "cutoff_utc": vintage_ctx["cutoff_utc"],
            "cutoff_london": vintage_ctx["cutoff_london"],
            "official_selected_forecast_mw": official_forecast_mw,
            "official_forecast_publish_utc": official_pub_utc,
            "official_actual_hourly_mw": official_actual_mw,
            "official_error_mw": official_error_mw,
            "wind_scaling_pct": req.wind_scaling_pct,
            "scaled_forecast_wind_mw": scaled_forecast,
            "scaled_actual_wind_mw": scaled_actual,
            "selected_wind_contribution_mw": selected_wind_mw,
            "wind_basis": req.wind_basis,
            "custom_scenario": custom_result,
            "comparison_scenarios": comparison_results,
        }

    @staticmethod
    def build_interval_intelligence_and_lineage(
        target_start_utc: str,
        actuals_hourly_df: pd.DataFrame,
        vintages_df: pd.DataFrame,
        cutoff_time_london: str = "11:00",
        cutoff_day_offset: int = -1,
    ) -> Dict[str, Any]:
        """
        Builds the complete payload for the 4-Level Energy Intelligence Tree
        and the 7-Stage Animated Data-Lineage Visualization for `target_start_utc`.
        """
        v_ctx = vintage_selection_service.get_vintages_timeline_for_interval(
            target_start_utc=target_start_utc,
            actuals_hourly_df=actuals_hourly_df,
            vintages_df=vintages_df,
            cutoff_time_london=cutoff_time_london,
            cutoff_day_offset=cutoff_day_offset,
        )
        deliv_date = v_ctx["delivery_date_london"]

        # Compute Daily and Full-Month metrics at the same cutoff for Level 3 context
        month_records = vintage_selection_service.select_forecasts_for_window(
            actuals_hourly_df=actuals_hourly_df,
            vintages_df=vintages_df,
            start_date_london="2026-01-01",
            end_date_london="2026-01-31",
            cutoff_time_london=cutoff_time_london,
            cutoff_day_offset=cutoff_day_offset,
        )
        month_summary = metrics_service.calculate_summary_metrics(
            selected_records=month_records,
            start_date="2026-01-01",
            end_date="2026-01-31",
            cutoff_time_london=cutoff_time_london,
            cutoff_day_offset=cutoff_day_offset,
        )
        day_records = [
            r for r in month_records if r["delivery_date_london"] == deliv_date
        ]
        day_summary = metrics_service.calculate_summary_metrics(
            selected_records=day_records,
            start_date=deliv_date,
            end_date=deliv_date,
            cutoff_time_london=cutoff_time_london,
            cutoff_day_offset=cutoff_day_offset,
        )

        sel_v = v_ctx["selected_vintage"]
        f_mw = sel_v["forecast_mw"] if sel_v else None
        a_mw = v_ctx["actual_hourly_mw"]
        err_mw = v_ctx["error_mw"]
        err_dir = v_ctx["error_direction"]

        if err_mw is not None and f_mw is not None and a_mw is not None:
            if err_mw > 0:
                interpretation_summary = (
                    f"Overforecast of +{err_mw:,.1f} MW: At the {v_ctx['cutoff_london']} procurement cutoff, "
                    f"Elexon WINDFOR projected {f_mw:,.1f} MW of national wind, whereas actual aligned generation "
                    f"delivered {a_mw:,.1f} MW. National wind supplied {abs(err_mw):,.1f} MW ({abs(err_mw):,.1f} MWh "
                    f"over this 1-hour interval) less than expected at decision time."
                )
            elif err_mw < 0:
                interpretation_summary = (
                    f"Underforecast of {err_mw:,.1f} MW: At the {v_ctx['cutoff_london']} procurement cutoff, "
                    f"Elexon WINDFOR projected {f_mw:,.1f} MW of national wind, whereas actual aligned generation "
                    f"delivered {a_mw:,.1f} MW. National wind generated {abs(err_mw):,.1f} MW ({abs(err_mw):,.1f} MWh "
                    f"over this 1-hour interval) more than expected at decision time."
                )
            else:
                interpretation_summary = (
                    f"Exact match (0.0 MW error): Forecast and actual generation both equalled {a_mw:,.1f} MW."
                )
        else:
            interpretation_summary = (
                "Incomplete pair at this interval; both a valid pre-cutoff forecast and aligned actual are required."
            )

        lineage_stages = [
            {
                "stage_number": 1,
                "stage_id": "raw_elexon_records",
                "title": "Raw Elexon BMRS Records",
                "subtitle": "FUELHH & WINDFOR API Streams",
                "status": "verified",
                "primary_metric": f"{v_ctx['total_vintages_count']} Forecast Vintages + 2 Half-Hourly Actuals",
                "detail": (
                    f"Retrieved {v_ctx['total_vintages_count']} distinct WINDFOR publications targeting {v_ctx['target_start_utc']} "
                    f"and 2 FUELHH half-hourly WIND settlement periods (:00 and :30)."
                ),
            },
            {
                "stage_number": 2,
                "stage_id": "validated_observations",
                "title": "Validated & Deduplicated Observations",
                "subtitle": "UTC Normalization & Numeric Check",
                "status": "verified",
                "primary_metric": f"HH(:00)={v_ctx['actual_hh_00_mw']} MW | HH(:30)={v_ctx['actual_hh_30_mw']} MW",
                "detail": (
                    "Verified numeric generation values, enforced UTC canonical timestamps, and resolved any duplicate records "
                    "without fabricating zeros."
                ),
            },
            {
                "stage_number": 3,
                "stage_id": "aligned_hourly_data",
                "title": "Aligned Hourly Actual",
                "subtitle": "(HH_00 + HH_30) / 2",
                "status": "verified" if a_mw is not None else "missing",
                "primary_metric": f"{a_mw:,.1f} MW" if a_mw is not None else "Missing Actual",
                "detail": (
                    f"Calculated actual_hourly_mw = ({v_ctx['actual_hh_00_mw']} + {v_ctx['actual_hh_30_mw']}) / 2 = {a_mw} MW "
                    "without interpolating half-hourly forecasts."
                ),
            },
            {
                "stage_number": 4,
                "stage_id": "eligible_historical_forecast",
                "title": "Cutoff Gate & Vintage Selection",
                "subtitle": f"publishTime <= {v_ctx['cutoff_utc']}",
                "status": "verified" if sel_v is not None else "missing",
                "primary_metric": (
                    f"{f_mw:,.1f} MW ({v_ctx['eligible_vintages_count']} eligible, "
                    f"{v_ctx['excluded_future_vintages_count']} rejected)"
                    if f_mw is not None
                    else "No Eligible Vintage"
                ),
                "detail": (
                    f"Selected latest vintage published at {sel_v['publish_time_utc']} (lead time {sel_v['lead_time_hours']}h). "
                    f"Visibly rejected {v_ctx['excluded_future_vintages_count']} future vintages published after cutoff."
                    if sel_v
                    else "No forecast published before cutoff."
                ),
            },
            {
                "stage_number": 5,
                "stage_id": "actual_comparison",
                "title": "Forecast vs. Actual Comparison",
                "subtitle": "error_mw = forecast_mw - actual_mw",
                "status": "verified" if err_mw is not None else "incomplete",
                "primary_metric": (
                    f"{err_mw:+,.1f} MW ({str(err_dir).upper()})"
                    if err_mw is not None
                    else "N/A"
                ),
                "detail": (
                    f"Computed error_mw = {f_mw} - {a_mw} = {err_mw:+.1f} MW."
                    if err_mw is not None
                    else "Comparison unavailable."
                ),
            },
            {
                "stage_number": 6,
                "stage_id": "accuracy_metrics",
                "title": "Scope Accuracy Metrics",
                "subtitle": f"Day ({deliv_date}) & Jan 2026 Scope",
                "status": "verified",
                "primary_metric": (
                    f"Day MAE: {day_summary['mae_mw']} MW | Jan MAE: {month_summary['mae_mw']} MW"
                ),
                "detail": (
                    f"Day RMSE: {day_summary['rmse_mw']} MW, Day Bias: {day_summary['mean_bias_mw']:+.1f} MW | "
                    f"Jan 2026 RMSE: {month_summary['rmse_mw']} MW, Coverage: {month_summary['coverage_pct']}%."
                ),
            },
            {
                "stage_number": 7,
                "stage_id": "decision_interpretation",
                "title": "Decision Interpretation",
                "subtitle": "Procurement Planning Context",
                "status": "verified",
                "primary_metric": (
                    f"Gap: {abs(err_mw):,.1f} MW ({abs(err_mw):,.1f} MWh)"
                    if err_mw is not None
                    else "Pending"
                ),
                "detail": interpretation_summary,
            },
        ]

        return {
            "interval_vintages": v_ctx,
            "day_metrics": {
                "date": deliv_date,
                "mae_mw": day_summary["mae_mw"],
                "rmse_mw": day_summary["rmse_mw"],
                "mean_bias_mw": day_summary["mean_bias_mw"],
                "coverage_pct": day_summary["coverage_pct"],
                "valid_paired_count": day_summary["valid_paired_count"],
            },
            "month_metrics": {
                "scope": "January 2026 (2026-01-01 to 2026-01-31)",
                "mae_mw": month_summary["mae_mw"],
                "rmse_mw": month_summary["rmse_mw"],
                "mean_bias_mw": month_summary["mean_bias_mw"],
                "coverage_pct": month_summary["coverage_pct"],
                "valid_paired_count": month_summary["valid_paired_count"],
                "total_target_hours": month_summary["total_target_hours"],
                "overforecast_pct": month_summary["overforecast_pct"],
                "underforecast_pct": month_summary["underforecast_pct"],
            },
            "decision_interpretation": {
                "headline": interpretation_summary,
                "procurement_note": (
                    "Wind forecast errors directly alter the net residual demand that UK day-ahead and intraday "
                    "trading desks must balance. Overforecasting leaves a generation deficit relative to day-ahead "
                    "expectations; underforecasting creates unanticipated wind surplus. Actual utility procurement "
                    "requirements cannot be calculated from national wind data alone without consumer demand and "
                    "existing contracted supply schedules."
                ),
            },
            "lineage_stages": lineage_stages,
        }


scenario_service = ScenarioService()
