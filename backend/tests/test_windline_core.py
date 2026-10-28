from datetime import datetime, timedelta, timezone
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas import ScenarioSimulationRequest
from app.services.alignment_service import alignment_service
from app.services.metrics_service import metrics_service
from app.services.normalization_service import normalization_service
from app.services.predictive_service import predictive_service
from app.services.scenario_service import (
    calculate_illustrative_scenario,
    scenario_service,
)
from app.services.vintage_selection_service import (
    compute_decision_cutoff_utc,
    vintage_selection_service,
)


def test_normalization_filters_non_wind_and_never_turns_missing_into_zero():
    raw_fuelhh = [
        {
            "dataset": "FUELHH",
            "publishTime": "2026-01-10T01:00:00Z",
            "startTime": "2026-01-10T00:00:00Z",
            "settlementDate": "2026-01-10",
            "settlementPeriod": 1,
            "fuelType": "WIND",
            "generation": 12400,
        },
        {
            "dataset": "FUELHH",
            "publishTime": "2026-01-10T01:00:00Z",
            "startTime": "2026-01-10T00:30:00Z",
            "settlementDate": "2026-01-10",
            "settlementPeriod": 2,
            "fuelType": "WIND",
            "generation": None,  # Missing observation - must NOT become 0
        },
        {
            "dataset": "FUELHH",
            "publishTime": "2026-01-10T01:00:00Z",
            "startTime": "2026-01-10T00:00:00Z",
            "settlementDate": "2026-01-10",
            "settlementPeriod": 1,
            "fuelType": "CCGT",
            "generation": 9500,
        },
    ]

    df, audit = normalization_service.normalize_fuelhh(raw_fuelhh)
    assert len(df) == 1
    assert audit["non_wind_filtered"] == 1
    assert audit["invalid_or_null_records"] == 1
    assert float(df.iloc[0]["generation_mw"]) == 12400.0


def test_duplicate_observations_resolved_deterministically():
    raw_windfor = [
        {
            "dataset": "WINDFOR",
            "publishTime": "2026-01-09T09:30:00Z",
            "startTime": "2026-01-10T12:00:00Z",
            "generation": 14000,
        },
        {
            "dataset": "WINDFOR",
            "publishTime": "2026-01-09T09:30:00Z",
            "startTime": "2026-01-10T12:00:00Z",
            "generation": 14250,
        },
    ]
    df, audit = normalization_service.normalize_windfor(raw_windfor)
    assert len(df) == 1
    assert audit["duplicate_records_removed"] == 1
    assert float(df.iloc[0]["generation_mw"]) == 14250.0


def test_half_hourly_to_hourly_alignment_and_missing_half_hour_flag():
    hh_df = pd.DataFrame(
        [
            {
                "start_time_utc": "2026-01-05T10:00:00Z",
                "publish_time_utc": "2026-01-05T10:30:00Z",
                "generation_mw": 10000.0,
            },
            {
                "start_time_utc": "2026-01-05T10:30:00Z",
                "publish_time_utc": "2026-01-05T11:00:00Z",
                "generation_mw": 11000.0,
            },
            # Hour 11:00 has only :00 and is missing :30
            {
                "start_time_utc": "2026-01-05T11:00:00Z",
                "publish_time_utc": "2026-01-05T11:30:00Z",
                "generation_mw": 12000.0,
            },
        ]
    )

    hourly_df, summary = alignment_service.align_half_hourly_to_hourly(
        hh_df,
        expected_start_utc="2026-01-05T10:00:00Z",
        expected_end_utc="2026-01-05T12:00:00Z",
    )

    assert summary["total_hours"] == 3
    assert summary["valid_paired_hours"] == 1
    assert summary["partial_missing_hours"] == 1
    assert summary["completely_missing_hours"] == 1

    row_10 = hourly_df[hourly_df["hour_start_utc"] == "2026-01-05T10:00:00Z"].iloc[0]
    assert float(row_10["actual_hourly_mw"]) == 10500.0
    assert row_10["pair_status"] == "valid"

    row_11 = hourly_df[hourly_df["hour_start_utc"] == "2026-01-05T11:00:00Z"].iloc[0]
    assert pd.isna(row_11["actual_hourly_mw"])
    assert row_11["pair_status"] == "partial_missing_actual"


def test_forecast_selection_before_and_at_cutoff_and_exclusion_of_post_cutoff():
    # Delivery date: 2026-01-10 14:00Z. D-1 11:00 London cutoff = 2026-01-09T11:00:00Z
    actuals_hourly = pd.DataFrame(
        [
            {
                "hour_start_utc": "2026-01-10T14:00:00Z",
                "hh_00_mw": 15000.0,
                "hh_30_mw": 15000.0,
                "actual_hourly_mw": 15000.0,
                "pair_status": "valid",
            }
        ]
    )
    vintages = pd.DataFrame(
        [
            # Earlier eligible vintage
            {
                "start_time_utc": "2026-01-10T14:00:00Z",
                "publish_time_utc": "2026-01-09T07:30:00Z",
                "generation_mw": 16000.0,
            },
            # Exact cutoff eligible vintage (11:00:00Z <= 11:00:00Z)
            {
                "start_time_utc": "2026-01-10T14:00:00Z",
                "publish_time_utc": "2026-01-09T11:00:00Z",
                "generation_mw": 15800.0,
            },
            # Post-cutoff vintage (11:30:00Z > 11:00:00Z) -> MUST BE EXCLUDED
            {
                "start_time_utc": "2026-01-10T14:00:00Z",
                "publish_time_utc": "2026-01-09T11:30:00Z",
                "generation_mw": 15100.0,
            },
        ]
    )

    timeline = vintage_selection_service.get_vintages_timeline_for_interval(
        target_start_utc="2026-01-10T14:00:00Z",
        actuals_hourly_df=actuals_hourly,
        vintages_df=vintages,
        cutoff_time_london="11:00",
        cutoff_day_offset=-1,
    )

    assert timeline["cutoff_utc"] == "2026-01-09T11:00:00Z"
    assert timeline["eligible_vintages_count"] == 2
    assert timeline["excluded_future_vintages_count"] == 1
    assert timeline["selected_vintage"]["publish_time_utc"] == "2026-01-09T11:00:00Z"
    assert timeline["selected_vintage"]["forecast_mw"] == 15800.0
    # error_mw = forecast_mw - actual_mw = 15800 - 15000 = +800 MW (overforecast)
    assert timeline["error_mw"] == 800.0
    assert timeline["error_direction"] == "overforecast"


def test_error_sign_mae_rmse_bias_and_zero_actual_mape_suppression():
    records = [
        {
            "target_start_utc": f"2026-01-01T{h:02d}:00:00Z",
            "target_start_london": f"2026-01-01 {h:02d}:00 GMT",
            "delivery_date_london": "2026-01-01",
            "delivery_hour_london": h,
            "actual_hourly_mw": 0.0 if h == 0 else 1000.0,
            "actual_status": "valid",
            "forecast_mw": 200.0 if h == 0 else (1200.0 if h % 2 == 0 else 700.0),
            "forecast_publish_utc": "2025-12-31T09:30:00Z",
            "lead_time_hours": float(14 + h),
            "forecast_status": "valid",
            "error_mw": 200.0 if h == 0 else (200.0 if h % 2 == 0 else -300.0),
            "abs_error_mw": 200.0 if h == 0 else (200.0 if h % 2 == 0 else 300.0),
            "error_direction": "overforecast" if (h == 0 or h % 2 == 0) else "underforecast",
        }
        for h in range(6)
    ]

    summary = metrics_service.calculate_summary_metrics(
        selected_records=records,
        start_date="2026-01-01",
        end_date="2026-01-01",
    )

    # Errors: [+200, -300, +200, -300, +200, -300]
    expected_errors = np.array([200.0, -300.0, 200.0, -300.0, 200.0, -300.0])
    assert summary["valid_paired_count"] == 6
    assert summary["mae_mw"] == round(float(np.mean(np.abs(expected_errors))), 2)
    assert summary["rmse_mw"] == round(float(np.sqrt(np.mean(expected_errors ** 2))), 2)
    assert summary["mean_bias_mw"] == round(float(np.mean(expected_errors)), 2)
    assert summary["overforecast_count"] == 3
    assert summary["underforecast_count"] == 3
    # Hour 0 had actual_hourly_mw = 0.0, so it must be suppressed in MAPE
    assert summary["mape_suppressed_count"] == 1
    assert "excluding_1_near_zero" in summary["mape_status"]


def test_scenario_simulator_formula_and_non_negative_residual():
    # Projected demand MW = Baseline demand MW * (1 + growth / 100)
    # Illustrative residual MW = max(0, projected_demand - other_supply - selected_wind)
    res_10 = calculate_illustrative_scenario(
        scenario_id="s10",
        scenario_label="Demand +10%",
        baseline_demand_mw=30000.0,
        growth_pct=10.0,
        other_supply_mw=8000.0,
        wind_source_type="Official Selected Elexon Forecast",
        wind_contribution_mw=15000.0,
        scaled_forecast_wind_mw=15000.0,
        scaled_actual_wind_mw=13500.0,
    )
    assert res_10["projected_demand_mw"] == 33000.0
    # 33000 - 8000 - 15000 = 10000 MW
    assert res_10["illustrative_residual_mw"] == 10000.0
    assert res_10["illustrative_residual_mwh_per_hour"] == 10000.0
    assert res_10["illustrative_residual_kwh_per_hour"] == 10000000.0
    # With actual wind (13500 MW), residual is 33000 - 8000 - 13500 = 11500 MW (+1500 MW delta)
    assert res_10["residual_with_actual_wind_mw"] == 11500.0
    assert res_10["forecast_vs_actual_residual_delta_mw"] == 1500.0

    # Test clamping at zero when supply + wind > projected demand
    res_zero = calculate_illustrative_scenario(
        scenario_id="s_excess",
        scenario_label="Excess Supply",
        baseline_demand_mw=10000.0,
        growth_pct=0.0,
        other_supply_mw=5000.0,
        wind_source_type="Official Selected Elexon Forecast",
        wind_contribution_mw=8000.0,
    )
    assert res_zero["illustrative_residual_mw"] == 0.0


def test_chronological_backtest_no_future_leakage_on_synthetic_data():
    # Construct synthetic hourly actuals and vintages from 2025-12-29 to 2026-01-10
    start_dt = datetime(2025, 12, 29, 0, 0, tzinfo=timezone.utc)
    end_dt = datetime(2026, 1, 10, 23, 0, tzinfo=timezone.utc)

    act_rows = []
    vint_rows = []
    cur = start_dt
    idx = 0
    while cur <= end_dt:
        t_iso = cur.strftime("%Y-%m-%dT%H:00:00Z")
        # Before Jan 8: generation ~ 8000 MW; From Jan 8 onward: regime jump to 25000 MW
        gen = 25000.0 if cur >= datetime(2026, 1, 8, 0, 0, tzinfo=timezone.utc) else 8000.0 + (idx % 24) * 50.0
        act_rows.append(
            {
                "hour_start_utc": t_iso,
                "hh_00_mw": gen,
                "hh_30_mw": gen,
                "actual_hourly_mw": gen,
                "pair_status": "valid",
            }
        )
        pub_dt = cur - timedelta(hours=36)
        vint_rows.append(
            {
                "start_time_utc": t_iso,
                "publish_time_utc": pub_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "generation_mw": gen + 200.0,
            }
        )
        cur += timedelta(hours=1)
        idx += 1

    act_df = pd.DataFrame(act_rows)
    vint_df = pd.DataFrame(vint_rows)

    res = predictive_service.run_chronological_backtest(
        actuals_hourly_df=act_df,
        vintages_df=vint_df,
        cutoff_time_london="11:00",
        cutoff_day_offset=-1,
        train_end_date_london="2026-01-07",
        eval_start_date_london="2026-01-08",
        eval_end_date_london="2026-01-09",
    )

    # On 2026-01-08 (origin cutoff 2026-01-07T11:00:00Z), the regime jump to 25,000 MW on Jan 8
    # has NOT happened yet. If there is no future leakage, Persistence and Ridge predictions for
    # 2026-01-08 must be near ~8,000-9,500 MW and NEVER near 25,000 MW!
    jan8_preds = [
        r for r in res["held_out_series"] if r["delivery_date_london"] == "2026-01-08"
    ]
    assert len(jan8_preds) == 24
    for row in jan8_preds:
        assert row["persistence_baseline_mw"] < 12000.0
        assert row["experimental_ridge_mw"] < 15000.0


def test_api_endpoints_with_test_client():
    client = TestClient(app)

    r_health = client.get("/api/health")
    assert r_health.status_code == 200
    data_h = r_health.json()
    assert data_h["status"] == "ok"
    assert data_h["cached_hourly_actuals_jan2026"] == 744

    r_summary = client.get(
        "/api/metrics/summary?start_date=2026-01-01&end_date=2026-01-31&cutoff_time_london=11:00"
    )
    assert r_summary.status_code == 200
    s_json = r_summary.json()
    assert s_json["total_target_hours"] == 744
    assert s_json["valid_paired_count"] == 744
    assert s_json["coverage_pct"] == 100.0
    assert s_json["mae_mw"] > 0

    r_vint = client.get(
        "/api/forecasts/vintages?target_start_utc=2026-01-15T17:00:00Z&cutoff_time_london=11:00"
    )
    assert r_vint.status_code == 200
    v_json = r_vint.json()
    assert v_json["selected_vintage"] is not None
    assert v_json["selected_vintage"]["publish_time_utc"] <= v_json["cutoff_utc"]

    r_tree = client.get(
        "/api/intelligence/tree?target_start_utc=2026-01-15T17:00:00Z&cutoff_time_london=11:00"
    )
    assert r_tree.status_code == 200
    t_json = r_tree.json()
    assert len(t_json["lineage_stages"]) == 7

    r_scen = client.post(
        "/api/scenario/simulate",
        json={
            "target_start_utc": "2026-01-15T17:00:00Z",
            "cutoff_time_london": "11:00",
            "cutoff_day_offset": -1,
            "baseline_demand_mw": 28000.0,
            "other_supply_mw": 6000.0,
            "custom_growth_pct": 15.0,
            "wind_scaling_pct": 100.0,
            "wind_basis": "selected_forecast",
        },
    )
    assert r_scen.status_code == 200
    sc_json = r_scen.json()
    assert sc_json["is_hypothetical_simulation"] is True
    assert len(sc_json["comparison_scenarios"]) == 4

    # Validation error test for out-of-range date
    r_bad = client.get("/api/metrics/summary?start_date=2025-05-01&end_date=2025-05-10")
    assert r_bad.status_code == 400

    # Lead-time horizon endpoint test
    r_lead = client.get("/api/metrics/lead-time?start_date=2026-01-01&end_date=2026-01-31")
    assert r_lead.status_code == 200
    assert len(r_lead.json()["buckets"]) == 7

    # CSV export endpoint test
    r_csv = client.get("/api/export/csv?start_date=2026-01-01&end_date=2026-01-02&cutoff_time_london=11:00")
    assert r_csv.status_code == 200
    assert "target_start_utc,target_start_london" in r_csv.text


def test_missing_forecast_and_missing_actual_flagged_and_excluded_from_metrics():
    actuals_hourly = pd.DataFrame(
        [
            {
                "hour_start_utc": "2026-01-12T00:00:00Z",
                "hh_00_mw": 10000.0,
                "hh_30_mw": 10000.0,
                "actual_hourly_mw": 10000.0,
                "pair_status": "valid",
            }
            # 01:00Z actual is missing
        ]
    )
    vintages = pd.DataFrame(
        [
            {
                "start_time_utc": "2026-01-12T01:00:00Z",
                "publish_time_utc": "2026-01-11T08:00:00Z",
                "generation_mw": 11000.0,
            }
            # 00:00Z forecast is missing
        ]
    )
    records = vintage_selection_service.select_forecasts_for_window(
        actuals_hourly_df=actuals_hourly,
        vintages_df=vintages,
        start_date_london="2026-01-12",
        end_date_london="2026-01-12",
        cutoff_time_london="11:00",
        cutoff_day_offset=-1,
    )
    rec_00 = next(r for r in records if r["target_start_utc"] == "2026-01-12T00:00:00Z")
    rec_01 = next(r for r in records if r["target_start_utc"] == "2026-01-12T01:00:00Z")
    assert rec_00["forecast_status"] == "missing_forecast"
    assert rec_00["actual_status"] == "valid"
    assert rec_00["error_mw"] is None

    assert rec_01["forecast_status"] == "valid"
    assert rec_01["actual_status"] == "missing_actual"
    assert rec_01["error_mw"] is None

