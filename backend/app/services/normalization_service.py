from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd

UTC_TZ = timezone.utc
LONDON_TZ = ZoneInfo("Europe/London")


def parse_to_utc_iso(ts_val: Any) -> str:
    """Normalizes any ISO timestamp string or datetime to canonical 'YYYY-MM-DDTHH:MM:SSZ'."""
    if ts_val is None or (isinstance(ts_val, float) and np.isnan(ts_val)):
        raise ValueError("Missing timestamp")
    ts_str = str(ts_val).strip()
    if not ts_str:
        raise ValueError("Empty timestamp")
    if ts_str.endswith("Z"):
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    else:
        dt = datetime.fromisoformat(ts_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC_TZ)
    else:
        dt = dt.astimezone(UTC_TZ)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def utc_iso_to_london_str(utc_iso: str) -> str:
    """Converts a canonical UTC ISO timestamp to Europe/London ISO string with offset."""
    dt_utc = datetime.fromisoformat(utc_iso.replace("Z", "+00:00")).astimezone(UTC_TZ)
    dt_lon = dt_utc.astimezone(LONDON_TZ)
    return dt_lon.strftime("%Y-%m-%d %H:%M %Z")


def utc_iso_to_london_date_and_hour(utc_iso: str) -> Tuple[str, int]:
    """Returns (YYYY-MM-DD in Europe/London, hour 0..23 in Europe/London)."""
    dt_utc = datetime.fromisoformat(utc_iso.replace("Z", "+00:00")).astimezone(UTC_TZ)
    dt_lon = dt_utc.astimezone(LONDON_TZ)
    return dt_lon.strftime("%Y-%m-%d"), dt_lon.hour


class NormalizationService:
    """
    Validates, normalizes, and deduplicates raw Elexon FUELHH and WINDFOR records.
    Never converts missing or invalid numeric values into zero.
    """

    @staticmethod
    def normalize_fuelhh(raw_records: List[Dict[str, Any]]) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        audit = {
            "raw_count": len(raw_records),
            "non_wind_filtered": 0,
            "invalid_or_null_records": 0,
            "duplicate_records_removed": 0,
            "valid_unique_count": 0,
            "validation_warnings": [],
        }

        cleaned: List[Dict[str, Any]] = []
        for idx, rec in enumerate(raw_records):
            fuel = str(rec.get("fuelType", "")).upper().strip()
            if fuel != "WIND":
                audit["non_wind_filtered"] += 1
                continue

            gen_val = rec.get("generation")
            if gen_val is None or gen_val == "":
                audit["invalid_or_null_records"] += 1
                audit["validation_warnings"].append(
                    f"FUELHH record #{idx} skipped: missing generation value"
                )
                continue

            try:
                generation_mw = float(gen_val)
                if np.isnan(generation_mw) or np.isinf(generation_mw):
                    raise ValueError("NaN or infinite generation")
                start_utc = parse_to_utc_iso(rec.get("startTime"))
                publish_utc = (
                    parse_to_utc_iso(rec.get("publishTime"))
                    if rec.get("publishTime")
                    else None
                )
            except (ValueError, TypeError) as exc:
                audit["invalid_or_null_records"] += 1
                if len(audit["validation_warnings"]) < 25:
                    audit["validation_warnings"].append(f"FUELHH record #{idx} invalid: {exc}")
                continue

            settlement_date = rec.get("settlementDate")
            settlement_period = rec.get("settlementPeriod")

            cleaned.append(
                {
                    "start_time_utc": start_utc,
                    "publish_time_utc": publish_utc or "",
                    "settlement_date": str(settlement_date) if settlement_date else None,
                    "settlement_period": int(settlement_period)
                    if settlement_period is not None
                    else None,
                    "fuel_type": "WIND",
                    "generation_mw": generation_mw,
                }
            )

        if not cleaned:
            empty_df = pd.DataFrame(
                columns=[
                    "start_time_utc",
                    "publish_time_utc",
                    "settlement_date",
                    "settlement_period",
                    "fuel_type",
                    "generation_mw",
                ]
            )
            return empty_df, audit

        df = pd.DataFrame(cleaned)
        # Deterministic duplicate resolution: sort by start_time_utc ASC, publish_time_utc ASC, generation_mw ASC
        # Keep the latest publish_time_utc (and highest generation on exact timestamp tie)
        before_dedup = len(df)
        df = df.sort_values(
            by=["start_time_utc", "publish_time_utc", "generation_mw"],
            ascending=[True, True, True],
        )
        df = df.drop_duplicates(subset=["start_time_utc"], keep="last").reset_index(drop=True)
        audit["duplicate_records_removed"] = int(before_dedup - len(df))
        audit["valid_unique_count"] = int(len(df))
        if audit["duplicate_records_removed"] > 0:
            audit["validation_warnings"].append(
                f"Resolved {audit['duplicate_records_removed']} duplicate FUELHH half-hourly records deterministically."
            )

        return df, audit

    @staticmethod
    def normalize_windfor(
        raw_records: List[Dict[str, Any]],
        min_target_utc: str = "2025-12-28T00:00:00Z",
        max_target_utc: str = "2026-02-02T00:00:00Z",
    ) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        audit = {
            "raw_count": len(raw_records),
            "out_of_target_window_filtered": 0,
            "invalid_or_null_records": 0,
            "non_hourly_start_filtered": 0,
            "duplicate_records_removed": 0,
            "valid_unique_count": 0,
            "distinct_publish_times": 0,
            "validation_warnings": [],
        }

        cleaned: List[Dict[str, Any]] = []
        for idx, rec in enumerate(raw_records):
            gen_val = rec.get("generation")
            if gen_val is None or gen_val == "":
                audit["invalid_or_null_records"] += 1
                continue

            try:
                generation_mw = float(gen_val)
                if np.isnan(generation_mw) or np.isinf(generation_mw):
                    raise ValueError("NaN or infinite generation")
                start_utc = parse_to_utc_iso(rec.get("startTime"))
                publish_utc = parse_to_utc_iso(rec.get("publishTime"))
            except (ValueError, TypeError) as exc:
                audit["invalid_or_null_records"] += 1
                if len(audit["validation_warnings"]) < 25:
                    audit["validation_warnings"].append(f"WINDFOR record #{idx} invalid: {exc}")
                continue

            if start_utc < min_target_utc or start_utc > max_target_utc:
                audit["out_of_target_window_filtered"] += 1
                continue

            # Verify WINDFOR startTime is aligned to top-of-hour (:00:00Z)
            if not start_utc.endswith(":00:00Z"):
                audit["non_hourly_start_filtered"] += 1
                continue

            cleaned.append(
                {
                    "start_time_utc": start_utc,
                    "publish_time_utc": publish_utc,
                    "generation_mw": generation_mw,
                }
            )

        if not cleaned:
            empty_df = pd.DataFrame(
                columns=["start_time_utc", "publish_time_utc", "generation_mw"]
            )
            return empty_df, audit

        df = pd.DataFrame(cleaned)
        before_dedup = len(df)
        # Deterministic duplicate resolution for identical (start_time_utc, publish_time_utc):
        # sort by start_time_utc, publish_time_utc, generation_mw and take last
        df = df.sort_values(
            by=["start_time_utc", "publish_time_utc", "generation_mw"],
            ascending=[True, True, True],
        )
        df = df.drop_duplicates(
            subset=["start_time_utc", "publish_time_utc"], keep="last"
        ).reset_index(drop=True)

        audit["duplicate_records_removed"] = int(before_dedup - len(df))
        audit["valid_unique_count"] = int(len(df))
        audit["distinct_publish_times"] = int(df["publish_time_utc"].nunique())
        if audit["duplicate_records_removed"] > 0:
            audit["validation_warnings"].append(
                f"Deduplicated {audit['duplicate_records_removed']} overlapping WINDFOR (startTime, publishTime) records."
            )

        return df, audit


normalization_service = NormalizationService()
