from datetime import datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd
from app.config import settings
from app.services.normalization_service import (
    LONDON_TZ,
    UTC_TZ,
    utc_iso_to_london_date_and_hour,
    utc_iso_to_london_str,
)


def compute_decision_cutoff_utc(
    target_start_utc: str,
    cutoff_time_london: str = "11:00",
    cutoff_day_offset: int = -1,
    fixed_horizon_hours: Optional[float] = None,
) -> Tuple[str, str]:
    """
    Computes the canonical UTC cutoff timestamp and Europe/London formatted string
    for a given target delivery interval `target_start_utc`.
    - Mode A (Operational decision replay): cutoff is `cutoff_time_london` (e.g. '11:00')
      on `delivery_date_london + cutoff_day_offset` (e.g. D-1) in Europe/London.
    - Mode B (Fixed lead-time horizon): cutoff is `target_start_utc - fixed_horizon_hours`.
    """
    target_dt_utc = datetime.fromisoformat(target_start_utc.replace("Z", "+00:00")).astimezone(
        UTC_TZ
    )

    if fixed_horizon_hours is not None:
        cutoff_dt_utc = target_dt_utc - timedelta(hours=float(fixed_horizon_hours))
        cutoff_dt_lon = cutoff_dt_utc.astimezone(LONDON_TZ)
        return (
            cutoff_dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
            cutoff_dt_lon.strftime("%Y-%m-%d %H:%M %Z"),
        )

    target_dt_lon = target_dt_utc.astimezone(LONDON_TZ)
    delivery_date_lon = target_dt_lon.date()
    cutoff_date_lon = delivery_date_lon + timedelta(days=int(cutoff_day_offset))

    parts = cutoff_time_london.strip().split(":")
    hour_val = int(parts[0])
    min_val = int(parts[1]) if len(parts) > 1 else 0

    cutoff_dt_lon = datetime.combine(
        cutoff_date_lon, time(hour=hour_val, minute=min_val, second=0), tzinfo=LONDON_TZ
    )
    cutoff_dt_utc = cutoff_dt_lon.astimezone(UTC_TZ)
    return (
        cutoff_dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
        cutoff_dt_lon.strftime("%Y-%m-%d %H:%M %Z"),
    )


def calculate_lead_time_hours(target_start_utc: str, publish_time_utc: str) -> float:
    """Calculates (target_start_utc - publish_time_utc) in hours."""
    t_dt = datetime.fromisoformat(target_start_utc.replace("Z", "+00:00")).astimezone(UTC_TZ)
    p_dt = datetime.fromisoformat(publish_time_utc.replace("Z", "+00:00")).astimezone(UTC_TZ)
    return round((t_dt - p_dt).total_seconds() / 3600.0, 3)


class VintageSelectionService:
    """
    Faithfully reconstructs historical forecast availability at a defined decision cutoff.
    Never selects a forecast published after the decision cutoff.
    """

    @staticmethod
    def select_forecasts_for_window(
        actuals_hourly_df: pd.DataFrame,
        vintages_df: pd.DataFrame,
        start_date_london: str = "2026-01-01",
        end_date_london: str = "2026-01-31",
        cutoff_time_london: str = "11:00",
        cutoff_day_offset: int = -1,
        fixed_horizon_hours: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """
        For every target hourly interval in [start_date_london, end_date_london]:
        Selects the WINDFOR record with the greatest publishTime subject to:
          - forecast.startTime == t
          - forecast.publishTime <= cutoff_utc
          - forecast generation is valid
        Joins with the aligned hourly actual and computes error_mw = forecast_mw - actual_mw.
        """
        start_dt = datetime.combine(
            datetime.strptime(start_date_london, "%Y-%m-%d").date(),
            time(0, 0, 0),
            tzinfo=LONDON_TZ,
        ).astimezone(UTC_TZ)
        end_dt = datetime.combine(
            datetime.strptime(end_date_london, "%Y-%m-%d").date(),
            time(23, 0, 0),
            tzinfo=LONDON_TZ,
        ).astimezone(UTC_TZ)

        # Index actuals by hour_start_utc
        actuals_map: Dict[str, Dict[str, Any]] = {}
        if not actuals_hourly_df.empty:
            for _, row in actuals_hourly_df.iterrows():
                actuals_map[str(row["hour_start_utc"])] = {
                    "actual_hourly_mw": float(row["actual_hourly_mw"])
                    if pd.notna(row.get("actual_hourly_mw"))
                    else None,
                    "hh_00_mw": float(row["hh_00_mw"])
                    if pd.notna(row.get("hh_00_mw"))
                    else None,
                    "hh_30_mw": float(row["hh_30_mw"])
                    if pd.notna(row.get("hh_30_mw"))
                    else None,
                    "pair_status": str(row.get("pair_status", "missing_actual")),
                }

        # Group vintages by start_time_utc (sorted by publish_time_utc ASC, generation_mw ASC)
        vintages_by_target: Dict[str, List[Tuple[str, float]]] = {}
        if not vintages_df.empty:
            sorted_v = vintages_df.sort_values(
                by=["start_time_utc", "publish_time_utc", "generation_mw"],
                ascending=[True, True, True],
            )
            for _, row in sorted_v.iterrows():
                gen = row.get("generation_mw")
                if pd.isna(gen):
                    continue
                t_utc = str(row["start_time_utc"])
                p_utc = str(row["publish_time_utc"])
                vintages_by_target.setdefault(t_utc, []).append((p_utc, float(gen)))

        selection_mode = (
            "fixed_lead_time" if fixed_horizon_hours is not None else "operational_cutoff"
        )

        results: List[Dict[str, Any]] = []
        cursor = start_dt
        while cursor <= end_dt:
            t_utc = cursor.strftime("%Y-%m-%dT%H:00:00Z")
            t_london = utc_iso_to_london_str(t_utc)
            deliv_date_lon, deliv_hour_lon = utc_iso_to_london_date_and_hour(t_utc)

            cutoff_utc, cutoff_london = compute_decision_cutoff_utc(
                target_start_utc=t_utc,
                cutoff_time_london=cutoff_time_london,
                cutoff_day_offset=cutoff_day_offset,
                fixed_horizon_hours=fixed_horizon_hours,
            )

            # Actual lookup
            act_info = actuals_map.get(t_utc)
            if act_info and act_info["actual_hourly_mw"] is not None:
                actual_hourly_mw: Optional[float] = act_info["actual_hourly_mw"]
                hh_00_mw = act_info["hh_00_mw"]
                hh_30_mw = act_info["hh_30_mw"]
                actual_status = "valid"
            elif act_info:
                actual_hourly_mw = None
                hh_00_mw = act_info["hh_00_mw"]
                hh_30_mw = act_info["hh_30_mw"]
                actual_status = act_info["pair_status"]
            else:
                actual_hourly_mw = None
                hh_00_mw = None
                hh_30_mw = None
                actual_status = "missing_actual"

            # Vintage lookup for t_utc
            all_vintages = vintages_by_target.get(t_utc, [])
            eligible = [(p, g) for (p, g) in all_vintages if p <= cutoff_utc]
            excluded_future = [(p, g) for (p, g) in all_vintages if p > cutoff_utc]

            if eligible:
                # Greatest publishTime <= cutoff_utc (deterministic last element after sorting)
                sel_pub_utc, sel_gen_mw = eligible[-1]
                forecast_mw: Optional[float] = round(sel_gen_mw, 3)
                forecast_publish_utc: Optional[str] = sel_pub_utc
                forecast_publish_london: Optional[str] = utc_iso_to_london_str(sel_pub_utc)
                lead_time_hours: Optional[float] = calculate_lead_time_hours(t_utc, sel_pub_utc)
                forecast_status = "valid"
            else:
                forecast_mw = None
                forecast_publish_utc = None
                forecast_publish_london = None
                lead_time_hours = None
                forecast_status = "missing_forecast"

            # Error calculation strictly when both forecast_mw and actual_hourly_mw are valid
            if forecast_mw is not None and actual_hourly_mw is not None:
                error_mw: Optional[float] = round(forecast_mw - actual_hourly_mw, 3)
                abs_error_mw: Optional[float] = round(abs(error_mw), 3)
                if actual_hourly_mw >= settings.MAPE_MIN_ACTUAL_MW:
                    pct_error: Optional[float] = round(
                        (abs_error_mw / actual_hourly_mw) * 100.0, 3
                    )
                else:
                    pct_error = None
                if error_mw > 0:
                    error_direction: Optional[str] = "overforecast"
                elif error_mw < 0:
                    error_direction = "underforecast"
                else:
                    error_direction = "exact"
            else:
                error_mw = None
                abs_error_mw = None
                pct_error = None
                error_direction = None

            results.append(
                {
                    "target_start_utc": t_utc,
                    "target_start_london": t_london,
                    "delivery_date_london": deliv_date_lon,
                    "delivery_hour_london": deliv_hour_lon,
                    "cutoff_utc": cutoff_utc,
                    "cutoff_london": cutoff_london,
                    "selection_mode": selection_mode,
                    "actual_hourly_mw": actual_hourly_mw,
                    "actual_hh_00_mw": hh_00_mw,
                    "actual_hh_30_mw": hh_30_mw,
                    "actual_status": actual_status,
                    "forecast_mw": forecast_mw,
                    "forecast_publish_utc": forecast_publish_utc,
                    "forecast_publish_london": forecast_publish_london,
                    "lead_time_hours": lead_time_hours,
                    "forecast_status": forecast_status,
                    "eligible_vintages_count": len(eligible),
                    "excluded_future_vintages_count": len(excluded_future),
                    "error_mw": error_mw,
                    "abs_error_mw": abs_error_mw,
                    "pct_error": pct_error,
                    "error_direction": error_direction,
                }
            )
            cursor += timedelta(hours=1)

        return results

    @staticmethod
    def get_vintages_timeline_for_interval(
        target_start_utc: str,
        actuals_hourly_df: pd.DataFrame,
        vintages_df: pd.DataFrame,
        cutoff_time_london: str = "11:00",
        cutoff_day_offset: int = -1,
        fixed_horizon_hours: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Returns every historical forecast vintage that existed for `target_start_utc`,
        marking which vintages qualify at the cutoff, which one is selected, and which
        ones are visibly excluded as post-cutoff publications.
        """
        cutoff_utc, cutoff_london = compute_decision_cutoff_utc(
            target_start_utc=target_start_utc,
            cutoff_time_london=cutoff_time_london,
            cutoff_day_offset=cutoff_day_offset,
            fixed_horizon_hours=fixed_horizon_hours,
        )
        t_london = utc_iso_to_london_str(target_start_utc)
        deliv_date_lon, deliv_hour_lon = utc_iso_to_london_date_and_hour(target_start_utc)

        actual_hourly_mw: Optional[float] = None
        actual_hh_00_mw: Optional[float] = None
        actual_hh_30_mw: Optional[float] = None
        actual_publish_utc: Optional[str] = None

        if not actuals_hourly_df.empty:
            sub_a = actuals_hourly_df[actuals_hourly_df["hour_start_utc"] == target_start_utc]
            if not sub_a.empty:
                row_a = sub_a.iloc[0]
                if pd.notna(row_a.get("actual_hourly_mw")):
                    actual_hourly_mw = float(row_a["actual_hourly_mw"])
                if pd.notna(row_a.get("hh_00_mw")):
                    actual_hh_00_mw = float(row_a["hh_00_mw"])
                if pd.notna(row_a.get("hh_30_mw")):
                    actual_hh_30_mw = float(row_a["hh_30_mw"])
                if pd.notna(row_a.get("hh_30_publish_utc")):
                    actual_publish_utc = str(row_a["hh_30_publish_utc"])

        sub_v = (
            vintages_df[vintages_df["start_time_utc"] == target_start_utc].sort_values(
                by=["publish_time_utc", "generation_mw"], ascending=[True, True]
            )
            if not vintages_df.empty
            else pd.DataFrame()
        )

        eligible_pubs = [
            str(r["publish_time_utc"])
            for _, r in sub_v.iterrows()
            if str(r["publish_time_utc"]) <= cutoff_utc and pd.notna(r.get("generation_mw"))
        ]
        selected_pub_utc = eligible_pubs[-1] if eligible_pubs else None

        vintage_items: List[Dict[str, Any]] = []
        selected_vintage_obj: Optional[Dict[str, Any]] = None

        for _, r in sub_v.iterrows():
            pub_utc = str(r["publish_time_utc"])
            gen_mw = round(float(r["generation_mw"]), 3)
            lead_hrs = calculate_lead_time_hours(target_start_utc, pub_utc)
            qualifies = pub_utc <= cutoff_utc
            is_sel = pub_utc == selected_pub_utc

            if is_sel:
                status_label = "SELECTED AT CUTOFF (LATEST ELIGIBLE)"
            elif qualifies:
                status_label = "SUPERSEDED PRIOR VINTAGE (<= CUTOFF)"
            else:
                status_label = "EXCLUDED POST-CUTOFF PUBLICATION (> CUTOFF)"

            item = {
                "publish_time_utc": pub_utc,
                "publish_time_london": utc_iso_to_london_str(pub_utc),
                "forecast_mw": gen_mw,
                "lead_time_hours": lead_hrs,
                "qualifies_at_cutoff": qualifies,
                "is_selected": is_sel,
                "status_label": status_label,
            }
            vintage_items.append(item)
            if is_sel:
                selected_vintage_obj = item

        error_mw: Optional[float] = None
        abs_error_mw: Optional[float] = None
        error_direction: Optional[str] = None
        if selected_vintage_obj and actual_hourly_mw is not None:
            error_mw = round(selected_vintage_obj["forecast_mw"] - actual_hourly_mw, 3)
            abs_error_mw = round(abs(error_mw), 3)
            if error_mw > 0:
                error_direction = "overforecast"
            elif error_mw < 0:
                error_direction = "underforecast"
            else:
                error_direction = "exact"

        eligible_count = sum(1 for v in vintage_items if v["qualifies_at_cutoff"])
        excluded_count = len(vintage_items) - eligible_count

        return {
            "target_start_utc": target_start_utc,
            "target_start_london": t_london,
            "delivery_date_london": deliv_date_lon,
            "delivery_hour_london": deliv_hour_lon,
            "cutoff_utc": cutoff_utc,
            "cutoff_london": cutoff_london,
            "cutoff_time_london": cutoff_time_london,
            "cutoff_day_offset": cutoff_day_offset,
            "actual_hourly_mw": actual_hourly_mw,
            "actual_hh_00_mw": actual_hh_00_mw,
            "actual_hh_30_mw": actual_hh_30_mw,
            "actual_publish_utc": actual_publish_utc,
            "selected_vintage": selected_vintage_obj,
            "error_mw": error_mw,
            "abs_error_mw": abs_error_mw,
            "error_direction": error_direction,
            "total_vintages_count": len(vintage_items),
            "eligible_vintages_count": eligible_count,
            "excluded_future_vintages_count": excluded_count,
            "vintages": vintage_items,
        }


vintage_selection_service = VintageSelectionService()
