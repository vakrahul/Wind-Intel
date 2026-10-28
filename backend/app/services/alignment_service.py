from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd


class AlignmentService:
    """
    Aggregates pairs of valid half-hourly FUELHH actual generation values into an hourly average:
        actual_hourly_mw = (actual_at_hour_start_mw + actual_at_half_hour_mw) / 2
    Never fabricates half-hourly forecasts or interpolates missing half-hours.
    """

    @staticmethod
    def align_half_hourly_to_hourly(
        hh_df: pd.DataFrame,
        expected_start_utc: Optional[str] = None,
        expected_end_utc: Optional[str] = None,
    ) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        if hh_df.empty and not expected_start_utc:
            empty = pd.DataFrame(
                columns=[
                    "hour_start_utc",
                    "hh_00_mw",
                    "hh_30_mw",
                    "actual_hourly_mw",
                    "hh_00_publish_utc",
                    "hh_30_publish_utc",
                    "pair_status",
                ]
            )
            return empty, {
                "total_hours": 0,
                "valid_paired_hours": 0,
                "partial_missing_hours": 0,
                "completely_missing_hours": 0,
            }

        lookup: Dict[str, Tuple[float, Optional[str]]] = {}
        for _, row in hh_df.iterrows():
            ts = str(row["start_time_utc"])
            gen = row["generation_mw"]
            pub = str(row["publish_time_utc"]) if pd.notna(row.get("publish_time_utc")) else None
            if pd.notna(gen):
                lookup[ts] = (float(gen), pub)

        if expected_start_utc and expected_end_utc:
            start_dt = datetime.fromisoformat(expected_start_utc.replace("Z", "+00:00")).astimezone(
                timezone.utc
            )
            end_dt = datetime.fromisoformat(expected_end_utc.replace("Z", "+00:00")).astimezone(
                timezone.utc
            )
        else:
            all_ts = sorted(lookup.keys())
            first_dt = datetime.fromisoformat(all_ts[0].replace("Z", "+00:00")).astimezone(
                timezone.utc
            )
            last_dt = datetime.fromisoformat(all_ts[-1].replace("Z", "+00:00")).astimezone(
                timezone.utc
            )
            start_dt = first_dt.replace(minute=0, second=0, microsecond=0)
            end_dt = last_dt.replace(minute=0, second=0, microsecond=0)

        rows: List[Dict[str, Any]] = []
        valid_count = 0
        partial_count = 0
        missing_count = 0

        cursor = start_dt
        while cursor <= end_dt:
            hour_iso = cursor.strftime("%Y-%m-%dT%H:00:00Z")
            half_iso = (cursor + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:30:00Z")

            rec_00 = lookup.get(hour_iso)
            rec_30 = lookup.get(half_iso)

            hh_00_mw = rec_00[0] if rec_00 is not None else np.nan
            hh_30_mw = rec_30[0] if rec_30 is not None else np.nan
            pub_00 = rec_00[1] if rec_00 is not None else None
            pub_30 = rec_30[1] if rec_30 is not None else None

            if not np.isnan(hh_00_mw) and not np.isnan(hh_30_mw):
                actual_hourly_mw = (hh_00_mw + hh_30_mw) / 2.0
                pair_status = "valid"
                valid_count += 1
            elif np.isnan(hh_00_mw) and np.isnan(hh_30_mw):
                actual_hourly_mw = np.nan
                pair_status = "missing_actual"
                missing_count += 1
            else:
                actual_hourly_mw = np.nan
                pair_status = "partial_missing_actual"
                partial_count += 1

            rows.append(
                {
                    "hour_start_utc": hour_iso,
                    "hh_00_mw": None if np.isnan(hh_00_mw) else round(float(hh_00_mw), 3),
                    "hh_30_mw": None if np.isnan(hh_30_mw) else round(float(hh_30_mw), 3),
                    "actual_hourly_mw": None
                    if np.isnan(actual_hourly_mw)
                    else round(float(actual_hourly_mw), 3),
                    "hh_00_publish_utc": pub_00,
                    "hh_30_publish_utc": pub_30,
                    "pair_status": pair_status,
                }
            )
            cursor += timedelta(hours=1)

        out_df = pd.DataFrame(rows)
        summary = {
            "total_hours": len(rows),
            "valid_paired_hours": valid_count,
            "partial_missing_hours": partial_count,
            "completely_missing_hours": missing_count,
        }
        return out_df, summary


alignment_service = AlignmentService()
