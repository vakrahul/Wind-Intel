from typing import Any, Dict, List
import numpy as np
import pandas as pd


class TrendAnalysisService:
    """
    Computes observed historical patterns from aligned hourly wind actuals
    and selected Elexon forecasts (diurnal hour-of-day profile, rolling averages,
    and daily variability).
    """

    @staticmethod
    def compute_historical_trends(selected_records: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not selected_records:
            return {
                "diurnal_profile": [],
                "rolling_series": [],
                "regime_summary": {},
            }

        df = pd.DataFrame(selected_records)
        df = df.sort_values("target_start_utc").reset_index(drop=True)

        # Hour-of-day diurnal profile (0..23 in Europe/London)
        diurnal_rows: List[Dict[str, Any]] = []
        for hour_val in range(24):
            sub = df[df["delivery_hour_london"] == hour_val]
            valid_a = sub["actual_hourly_mw"].dropna().astype(float)
            valid_f = sub["forecast_mw"].dropna().astype(float)
            valid_e = sub["error_mw"].dropna().astype(float)

            diurnal_rows.append(
                {
                    "hour_london": int(hour_val),
                    "hour_label": f"{hour_val:02d}:00",
                    "sample_count": int(len(valid_a)),
                    "mean_actual_mw": round(float(valid_a.mean()), 2) if len(valid_a) > 0 else None,
                    "std_actual_mw": round(float(valid_a.std(ddof=0)), 2)
                    if len(valid_a) > 1
                    else None,
                    "p25_actual_mw": round(float(np.percentile(valid_a, 25)), 2)
                    if len(valid_a) >= 5
                    else None,
                    "p75_actual_mw": round(float(np.percentile(valid_a, 75)), 2)
                    if len(valid_a) >= 5
                    else None,
                    "mean_forecast_mw": round(float(valid_f.mean()), 2)
                    if len(valid_f) > 0
                    else None,
                    "mean_error_mw": round(float(valid_e.mean()), 2) if len(valid_e) > 0 else None,
                    "mae_mw": round(float(np.abs(valid_e).mean()), 2) if len(valid_e) > 0 else None,
                }
            )

        # 24-hour rolling average and variability across January 2026
        act_series = pd.to_numeric(df["actual_hourly_mw"], errors="coerce")
        roll_mean_24 = act_series.rolling(window=24, min_periods=12).mean()
        roll_std_24 = act_series.rolling(window=24, min_periods=12).std()

        rolling_rows: List[Dict[str, Any]] = []
        for idx, row in df.iterrows():
            rm = roll_mean_24.iloc[idx]
            rs = roll_std_24.iloc[idx]
            act_val = row.get("actual_hourly_mw")
            f_val = row.get("forecast_mw")

            rolling_rows.append(
                {
                    "target_start_utc": row["target_start_utc"],
                    "target_start_london": row["target_start_london"],
                    "delivery_date_london": row["delivery_date_london"],
                    "actual_hourly_mw": round(float(act_val), 2) if pd.notna(act_val) else None,
                    "forecast_mw": round(float(f_val), 2) if pd.notna(f_val) else None,
                    "rolling_24h_mean_mw": round(float(rm), 2) if pd.notna(rm) else None,
                    "rolling_24h_std_mw": round(float(rs), 2) if pd.notna(rs) else None,
                    "upper_band_mw": round(float(rm + rs), 2)
                    if pd.notna(rm) and pd.notna(rs)
                    else None,
                    "lower_band_mw": round(float(max(0.0, rm - rs)), 2)
                    if pd.notna(rm) and pd.notna(rs)
                    else None,
                }
            )

        valid_all = act_series.dropna()
        if len(valid_all) > 0:
            peak_idx = int(valid_all.idxmax())
            trough_idx = int(valid_all.idxmin())
            regime_summary = {
                "mean_mw": round(float(valid_all.mean()), 2),
                "std_mw": round(float(valid_all.std(ddof=0)), 2),
                "coefficient_of_variation_pct": round(
                    float((valid_all.std(ddof=0) / valid_all.mean()) * 100.0), 2
                )
                if float(valid_all.mean()) > 0
                else None,
                "peak_mw": round(float(df.loc[peak_idx, "actual_hourly_mw"]), 2),
                "peak_timestamp_london": str(df.loc[peak_idx, "target_start_london"]),
                "trough_mw": round(float(df.loc[trough_idx, "actual_hourly_mw"]), 2),
                "trough_timestamp_london": str(df.loc[trough_idx, "target_start_london"]),
            }
        else:
            regime_summary = {}

        return {
            "diurnal_profile": diurnal_rows,
            "rolling_series": rolling_rows,
            "regime_summary": regime_summary,
        }


trend_analysis_service = TrendAnalysisService()
