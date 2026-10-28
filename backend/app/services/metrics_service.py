from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
from app.config import settings
from app.services.vintage_selection_service import vintage_selection_service

MIN_RELIABLE_SAMPLE = 5
MIN_PERCENTILE_SAMPLE = 10


def _compute_percentiles(arr: np.ndarray) -> Dict[str, Optional[float]]:
    if len(arr) < MIN_PERCENTILE_SAMPLE:
        return {
            "p05": None,
            "p10": None,
            "p25": None,
            "p50_median": round(float(np.median(arr)), 2) if len(arr) > 0 else None,
            "p75": None,
            "p90": None,
            "p95": None,
        }
    pcts = np.percentile(arr, [5, 10, 25, 50, 75, 90, 95])
    return {
        "p05": round(float(pcts[0]), 2),
        "p10": round(float(pcts[1]), 2),
        "p25": round(float(pcts[2]), 2),
        "p50_median": round(float(pcts[3]), 2),
        "p75": round(float(pcts[4]), 2),
        "p90": round(float(pcts[5]), 2),
        "p95": round(float(pcts[6]), 2),
    }


def _compute_error_histogram(errors: np.ndarray, num_bins: int = 12) -> List[Dict[str, Any]]:
    if len(errors) < MIN_RELIABLE_SAMPLE:
        return []
    min_val = float(np.floor(np.min(errors) / 200.0) * 200.0)
    max_val = float(np.ceil(np.max(errors) / 200.0) * 200.0)
    if min_val == max_val:
        min_val -= 200.0
        max_val += 200.0

    edges = np.linspace(min_val, max_val, num_bins + 1)
    bins_out: List[Dict[str, Any]] = []
    for i in range(num_bins):
        left = float(edges[i])
        right = float(edges[i + 1])
        if i == num_bins - 1:
            mask = (errors >= left) & (errors <= right)
        else:
            mask = (errors >= left) & (errors < right)
        sub = errors[mask]
        over_c = int(np.sum(sub > 0))
        under_c = int(np.sum(sub < 0))
        bins_out.append(
            {
                "bin_start_mw": round(left, 1),
                "bin_end_mw": round(right, 1),
                "bin_label": f"{int(round(left))} to {int(round(right))} MW",
                "count": int(len(sub)),
                "overforecast_count": over_c,
                "underforecast_count": under_c,
            }
        )
        return bins_out


def _compute_generation_level_buckets(
    actuals: np.ndarray, forecasts: np.ndarray, errors: np.ndarray
) -> List[Dict[str, Any]]:
    """
    Groups forecast accuracy by empirical wind generation tertile quantiles (P33.3 and P66.7)
    derived dynamically from the selected January 2026 actual generation distribution.
    """
    n = len(actuals)
    if n < MIN_RELIABLE_SAMPLE:
        return []

    q33, q67 = np.percentile(actuals, [33.333, 66.667])
    min_a = float(np.min(actuals))
    max_a = float(np.max(actuals))

    bucket_defs = [
        (
            "low_wind_quantile",
            "Low Wind Regime (Bottom Tertile <= P33)",
            f"<= {round(float(q33)):,} MW (P00–P33)",
            actuals <= q33,
            min_a,
            float(q33),
        ),
        (
            "medium_wind_quantile",
            "Medium Wind Regime (Middle Tertile P33–P67)",
            f"{round(float(q33)):,} to {round(float(q67)):,} MW (P33–P67)",
            (actuals > q33) & (actuals <= q67),
            float(q33),
            float(q67),
        ),
        (
            "high_wind_quantile",
            "High Wind Regime (Top Tertile > P67)",
            f"> {round(float(q67)):,} MW (P67–P100)",
            actuals > q67,
            float(q67),
            max_a,
        ),
    ]

    out: List[Dict[str, Any]] = []
    for b_id, b_label, q_label, mask, b_min, b_max in bucket_defs:
        sub_a = actuals[mask]
        sub_f = forecasts[mask]
        sub_e = errors[mask]
        count = int(len(sub_a))
        if count == 0:
            continue
        sub_abs = np.abs(sub_e)
        p90_err = round(float(np.percentile(sub_e, 90)), 2) if count >= 5 else None
        out.append(
            {
                "bucket_id": b_id,
                "bucket_label": b_label,
                "quantile_range_label": q_label,
                "min_actual_mw": round(float(b_min), 1),
                "max_actual_mw": round(float(b_max), 1),
                "hours_count": count,
                "share_pct": round((count / n) * 100.0, 1),
                "mean_actual_mw": round(float(np.mean(sub_a)), 2),
                "mean_forecast_mw": round(float(np.mean(sub_f)), 2),
                "mae_mw": round(float(np.mean(sub_abs)), 2),
                "rmse_mw": round(float(np.sqrt(np.mean(sub_e ** 2))), 2),
                "mean_bias_mw": round(float(np.mean(sub_e)), 2),
                "median_abs_error_mw": round(float(np.median(sub_abs)), 2),
                "p90_signed_error_mw": p90_err,
                "overforecast_pct": round(float(np.mean(sub_e > 0) * 100.0), 1),
                "underforecast_pct": round(float(np.mean(sub_e < 0) * 100.0), 1),
            }
        )
    return out


class MetricsService:
    """
    Dedicated accuracy evaluation and coverage reporting engine.
    Enforces error_mw = forecast_mw - actual_mw throughout.
    """

    @staticmethod
    def calculate_summary_metrics(
        selected_records: List[Dict[str, Any]],
        start_date: str,
        end_date: str,
        cutoff_time_london: str = "11:00",
        cutoff_day_offset: int = -1,
        fixed_horizon_hours: Optional[float] = None,
    ) -> Dict[str, Any]:
        total_hours = len(selected_records)
        valid_pairs = [
            r
            for r in selected_records
            if r.get("forecast_mw") is not None and r.get("actual_hourly_mw") is not None
        ]
        missing_forecast = sum(
            1 for r in selected_records if r.get("forecast_status") != "valid"
        )
        missing_actual = sum(
            1 for r in selected_records if r.get("actual_status") != "valid"
        )

        valid_count = len(valid_pairs)
        coverage_pct = (
            round((valid_count / total_hours) * 100.0, 2) if total_hours > 0 else 0.0
        )
        sufficient = valid_count >= MIN_RELIABLE_SAMPLE

        selection_mode = (
            "fixed_lead_time" if fixed_horizon_hours is not None else "operational_cutoff"
        )
        scope_label = f"{start_date} to {end_date} ({selection_mode})"

        if not sufficient:
            return {
                "scope_label": scope_label,
                "start_date": start_date,
                "end_date": end_date,
                "selection_mode": selection_mode,
                "cutoff_time_london": cutoff_time_london,
                "cutoff_day_offset": cutoff_day_offset,
                "fixed_horizon_hours": fixed_horizon_hours,
                "unit": "MW",
                "error_convention": "error_mw = forecast_mw - actual_mw (Positive = Overforecast, Negative = Underforecast)",
                "total_target_hours": total_hours,
                "valid_paired_count": valid_count,
                "missing_forecast_count": missing_forecast,
                "missing_actual_count": missing_actual,
                "coverage_pct": coverage_pct,
                "sufficient_sample": False,
                "mae_mw": None,
                "rmse_mw": None,
                "mean_bias_mw": None,
                "median_abs_error_mw": None,
                "mape_pct": None,
                "mape_status": "unavailable_insufficient_sample",
                "mape_suppressed_count": 0,
                "mean_actual_mw": None,
                "mean_forecast_mw": None,
                "peak_actual_mw": None,
                "min_actual_mw": None,
                "total_actual_energy_mwh": None,
                "total_forecast_energy_mwh": None,
                "overforecast_count": 0,
                "underforecast_count": 0,
                "exact_match_count": 0,
                "overforecast_pct": 0.0,
                "underforecast_pct": 0.0,
                "mean_lead_time_hours": None,
                "error_percentiles_mw": _compute_percentiles(np.array([])),
                "abs_error_percentiles_mw": _compute_percentiles(np.array([])),
                "error_histogram": [],
                "generation_level_buckets": [],
                "largest_overforecasts": [],
                "largest_underforecasts": [],
            }

        forecasts = np.array([float(r["forecast_mw"]) for r in valid_pairs], dtype=float)
        actuals = np.array([float(r["actual_hourly_mw"]) for r in valid_pairs], dtype=float)
        errors = forecasts - actuals
        abs_errors = np.abs(errors)
        leads = np.array(
            [
                float(r["lead_time_hours"])
                for r in valid_pairs
                if r.get("lead_time_hours") is not None
            ],
            dtype=float,
        )

        mae_mw = round(float(np.mean(abs_errors)), 2)
        rmse_mw = round(float(np.sqrt(np.mean(errors ** 2))), 2)
        mean_bias_mw = round(float(np.mean(errors)), 2)
        median_abs_error_mw = round(float(np.median(abs_errors)), 2)

        # MAPE handling: suppress if any actual generation is zero or near-zero (< threshold)
        near_zero_mask = actuals < settings.MAPE_MIN_ACTUAL_MW
        suppressed_count = int(np.sum(near_zero_mask))
        if suppressed_count > 0 and suppressed_count == len(actuals):
            mape_pct = None
            mape_status = (
                f"suppressed_zero_or_near_zero_actuals (< {settings.MAPE_MIN_ACTUAL_MW} MW)"
            )
        elif suppressed_count > 0:
            valid_mape_mask = ~near_zero_mask
            mape_pct = round(
                float(np.mean((abs_errors[valid_mape_mask] / actuals[valid_mape_mask]) * 100.0)),
                2,
            )
            mape_status = (
                f"computed_excluding_{suppressed_count}_near_zero_intervals"
            )
        else:
            mape_pct = round(float(np.mean((abs_errors / actuals) * 100.0)), 2)
            mape_status = "available_all_intervals_above_threshold"

        over_count = int(np.sum(errors > 0))
        under_count = int(np.sum(errors < 0))
        exact_count = int(np.sum(errors == 0))

        over_pct = round((over_count / valid_count) * 100.0, 2)
        under_pct = round((under_count / valid_count) * 100.0, 2)

        # Extreme events
        sorted_by_err_desc = sorted(valid_pairs, key=lambda x: float(x["error_mw"]), reverse=True)
        largest_over = [
            {
                "target_start_utc": r["target_start_utc"],
                "target_start_london": r["target_start_london"],
                "delivery_date_london": r["delivery_date_london"],
                "actual_hourly_mw": round(float(r["actual_hourly_mw"]), 2),
                "forecast_mw": round(float(r["forecast_mw"]), 2),
                "forecast_publish_utc": str(r["forecast_publish_utc"]),
                "lead_time_hours": round(float(r["lead_time_hours"]), 2),
                "error_mw": round(float(r["error_mw"]), 2),
                "abs_error_mw": round(float(r["abs_error_mw"]), 2),
                "error_direction": str(r["error_direction"]),
            }
            for r in sorted_by_err_desc
            if float(r["error_mw"]) > 0
        ][:5]

        sorted_by_err_asc = sorted(valid_pairs, key=lambda x: float(x["error_mw"]))
        largest_under = [
            {
                "target_start_utc": r["target_start_utc"],
                "target_start_london": r["target_start_london"],
                "delivery_date_london": r["delivery_date_london"],
                "actual_hourly_mw": round(float(r["actual_hourly_mw"]), 2),
                "forecast_mw": round(float(r["forecast_mw"]), 2),
                "forecast_publish_utc": str(r["forecast_publish_utc"]),
                "lead_time_hours": round(float(r["lead_time_hours"]), 2),
                "error_mw": round(float(r["error_mw"]), 2),
                "abs_error_mw": round(float(r["abs_error_mw"]), 2),
                "error_direction": str(r["error_direction"]),
            }
            for r in sorted_by_err_asc
            if float(r["error_mw"]) < 0
        ][:5]

        return {
            "scope_label": scope_label,
            "start_date": start_date,
            "end_date": end_date,
            "selection_mode": selection_mode,
            "cutoff_time_london": cutoff_time_london,
            "cutoff_day_offset": cutoff_day_offset,
            "fixed_horizon_hours": fixed_horizon_hours,
            "unit": "MW",
            "error_convention": "error_mw = forecast_mw - actual_mw (Positive = Overforecast, Negative = Underforecast)",
            "total_target_hours": total_hours,
            "valid_paired_count": valid_count,
            "missing_forecast_count": missing_forecast,
            "missing_actual_count": missing_actual,
            "coverage_pct": coverage_pct,
            "sufficient_sample": True,
            "mae_mw": mae_mw,
            "rmse_mw": rmse_mw,
            "mean_bias_mw": mean_bias_mw,
            "median_abs_error_mw": median_abs_error_mw,
            "mape_pct": mape_pct,
            "mape_status": mape_status,
            "mape_suppressed_count": suppressed_count,
            "mean_actual_mw": round(float(np.mean(actuals)), 2),
            "mean_forecast_mw": round(float(np.mean(forecasts)), 2),
            "peak_actual_mw": round(float(np.max(actuals)), 2),
            "min_actual_mw": round(float(np.min(actuals)), 2),
            "total_actual_energy_mwh": round(float(np.sum(actuals)), 2),
            "total_forecast_energy_mwh": round(float(np.sum(forecasts)), 2),
            "overforecast_count": over_count,
            "underforecast_count": under_count,
            "exact_match_count": exact_count,
            "overforecast_pct": over_pct,
            "underforecast_pct": under_pct,
            "mean_lead_time_hours": round(float(np.mean(leads)), 2) if len(leads) > 0 else None,
            "error_percentiles_mw": _compute_percentiles(errors),
            "abs_error_percentiles_mw": _compute_percentiles(abs_errors),
            "error_histogram": _compute_error_histogram(errors),
            "generation_level_buckets": _compute_generation_level_buckets(
                actuals, forecasts, errors
            ),
            "largest_overforecasts": largest_over,
            "largest_underforecasts": largest_under,
        }

    @staticmethod
    def calculate_daily_metrics(
        selected_records: List[Dict[str, Any]],
        start_date: str,
        end_date: str,
        cutoff_time_london: str = "11:00",
        cutoff_day_offset: int = -1,
    ) -> Dict[str, Any]:
        by_day: Dict[str, List[Dict[str, Any]]] = {}
        for rec in selected_records:
            d = str(rec["delivery_date_london"])
            by_day.setdefault(d, []).append(rec)

        day_rows: List[Dict[str, Any]] = []
        for day_str in sorted(by_day.keys()):
            day_recs = by_day[day_str]
            total_h = len(day_recs)
            valid_recs = [
                r
                for r in day_recs
                if r.get("forecast_mw") is not None and r.get("actual_hourly_mw") is not None
            ]
            valid_h = len(valid_recs)
            cov = round((valid_h / total_h) * 100.0, 2) if total_h > 0 else 0.0
            suff = valid_h >= MIN_RELIABLE_SAMPLE

            if suff:
                f_arr = np.array([float(r["forecast_mw"]) for r in valid_recs], dtype=float)
                a_arr = np.array([float(r["actual_hourly_mw"]) for r in valid_recs], dtype=float)
                e_arr = f_arr - a_arr
                abs_e = np.abs(e_arr)
                l_arr = np.array(
                    [
                        float(r["lead_time_hours"])
                        for r in valid_recs
                        if r.get("lead_time_hours") is not None
                    ],
                    dtype=float,
                )
                day_rows.append(
                    {
                        "delivery_date_london": day_str,
                        "target_hours": total_h,
                        "valid_paired_hours": valid_h,
                        "coverage_pct": cov,
                        "sufficient_sample": True,
                        "mean_actual_mw": round(float(np.mean(a_arr)), 2),
                        "mean_forecast_mw": round(float(np.mean(f_arr)), 2),
                        "total_actual_mwh": round(float(np.sum(a_arr)), 2),
                        "total_forecast_mwh": round(float(np.sum(f_arr)), 2),
                        "mae_mw": round(float(np.mean(abs_e)), 2),
                        "rmse_mw": round(float(np.sqrt(np.mean(e_arr ** 2))), 2),
                        "mean_bias_mw": round(float(np.mean(e_arr)), 2),
                        "max_abs_error_mw": round(float(np.max(abs_e)), 2),
                        "overforecast_hours": int(np.sum(e_arr > 0)),
                        "underforecast_hours": int(np.sum(e_arr < 0)),
                        "mean_lead_time_hours": round(float(np.mean(l_arr)), 2)
                        if len(l_arr) > 0
                        else None,
                    }
                )
            else:
                day_rows.append(
                    {
                        "delivery_date_london": day_str,
                        "target_hours": total_h,
                        "valid_paired_hours": valid_h,
                        "coverage_pct": cov,
                        "sufficient_sample": False,
                        "mean_actual_mw": None,
                        "mean_forecast_mw": None,
                        "total_actual_mwh": None,
                        "total_forecast_mwh": None,
                        "mae_mw": None,
                        "rmse_mw": None,
                        "mean_bias_mw": None,
                        "max_abs_error_mw": None,
                        "overforecast_hours": 0,
                        "underforecast_hours": 0,
                        "mean_lead_time_hours": None,
                    }
                )

        return {
            "scope_label": f"Daily Accuracy ({start_date} to {end_date})",
            "start_date": start_date,
            "end_date": end_date,
            "cutoff_time_london": cutoff_time_london,
            "cutoff_day_offset": cutoff_day_offset,
            "unit": "MW",
            "days": day_rows,
        }

    @staticmethod
    def calculate_lead_time_horizon_metrics(
        actuals_hourly_df: pd.DataFrame,
        vintages_df: pd.DataFrame,
        start_date: str = "2026-01-01",
        end_date: str = "2026-01-31",
    ) -> Dict[str, Any]:
        """
        Mode B — Forecast-quality analysis across fixed lead-time horizons:
        Evaluates forecast accuracy at fixed lead times before delivery (3h, 6h, 12h, 18h, 24h, 36h, 48h).
        """
        horizons = [
            ("h_03", "3h Lead (Intraday Gate)", 1.0, 6.0, 3.0),
            ("h_06", "6h Lead (Short Intraday)", 4.0, 9.0, 6.0),
            ("h_12", "12h Lead (Half-Day Ahead)", 9.0, 15.0, 12.0),
            ("h_18", "18h Lead (Overnight D-1)", 15.0, 21.0, 18.0),
            ("h_24", "24h Lead (Day-Ahead)", 21.0, 30.0, 24.0),
            ("h_36", "36h Lead (D-1 Peak Window)", 30.0, 42.0, 36.0),
            ("h_48", "48h Lead (Two-Day Ahead)", 42.0, 60.0, 48.0),
        ]

        buckets_out: List[Dict[str, Any]] = []
        for b_id, b_label, min_l, max_l, target_h in horizons:
            records = vintage_selection_service.select_forecasts_for_window(
                actuals_hourly_df=actuals_hourly_df,
                vintages_df=vintages_df,
                start_date_london=start_date,
                end_date_london=end_date,
                fixed_horizon_hours=target_h,
            )
            total_h = len(records)
            valid = [
                r
                for r in records
                if r.get("forecast_mw") is not None
                and r.get("actual_hourly_mw") is not None
                and r.get("lead_time_hours") is not None
                and float(r["lead_time_hours"]) <= max_l
            ]
            paired_count = len(valid)
            cov = round((paired_count / total_h) * 100.0, 2) if total_h > 0 else 0.0
            suff = paired_count >= MIN_RELIABLE_SAMPLE

            if suff:
                f_arr = np.array([float(r["forecast_mw"]) for r in valid], dtype=float)
                a_arr = np.array([float(r["actual_hourly_mw"]) for r in valid], dtype=float)
                l_arr = np.array([float(r["lead_time_hours"]) for r in valid], dtype=float)
                e_arr = f_arr - a_arr
                abs_e = np.abs(e_arr)

                buckets_out.append(
                    {
                        "bucket_id": b_id,
                        "bucket_label": b_label,
                        "min_lead_hours": target_h,
                        "max_lead_hours": max_l,
                        "paired_hours_count": paired_count,
                        "coverage_pct": cov,
                        "sufficient_sample": True,
                        "mae_mw": round(float(np.mean(abs_e)), 2),
                        "rmse_mw": round(float(np.sqrt(np.mean(e_arr ** 2))), 2),
                        "mean_bias_mw": round(float(np.mean(e_arr)), 2),
                        "median_abs_error_mw": round(float(np.median(abs_e)), 2),
                        "overforecast_pct": round(float(np.mean(e_arr > 0) * 100.0), 2),
                        "underforecast_pct": round(float(np.mean(e_arr < 0) * 100.0), 2),
                        "mean_actual_lead_hours": round(float(np.mean(l_arr)), 2),
                    }
                )
            else:
                buckets_out.append(
                    {
                        "bucket_id": b_id,
                        "bucket_label": b_label,
                        "min_lead_hours": target_h,
                        "max_lead_hours": max_l,
                        "paired_hours_count": paired_count,
                        "coverage_pct": cov,
                        "sufficient_sample": False,
                        "mae_mw": None,
                        "rmse_mw": None,
                        "mean_bias_mw": None,
                        "median_abs_error_mw": None,
                        "overforecast_pct": None,
                        "underforecast_pct": None,
                        "mean_actual_lead_hours": None,
                    }
                )

        return {
            "scope_label": f"Lead-Time Horizon Accuracy ({start_date} to {end_date})",
            "start_date": start_date,
            "end_date": end_date,
            "unit": "MW",
            "methodology_note": (
                "For each fixed horizon H (3h to 48h prior to delivery start t), selects the latest "
                "WINDFOR vintage published at or before (t - H hours)."
            ),
            "buckets": buckets_out,
        }


metrics_service = MetricsService()
