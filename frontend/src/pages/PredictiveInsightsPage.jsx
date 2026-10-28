import React, { useState, useEffect, useCallback } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { apiClient } from '../services/apiClient';
import { formatMw, formatPct, formatSignedMw } from '../utils/formatters';
import { ErrorState, LoadingState } from '../components/StateBanners';

export function PredictiveInsightsPage({ cutoffTimeLondon, cutoffDayOffset }) {
  const [summaryData, setSummaryData] = useState(null);
  const [backtestData, setBacktestData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPredictiveData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, btRes] = await Promise.all([
        apiClient.getPredictiveSummary({ cutoffTimeLondon, cutoffDayOffset }),
        apiClient.getPredictiveBacktest({
          cutoffTimeLondon,
          cutoffDayOffset,
          trainEndDate: '2026-01-20',
          evalStartDate: '2026-01-21',
          evalEndDate: '2026-01-31',
        }),
      ]);
      setSummaryData(sumRes);
      setBacktestData(btRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cutoffTimeLondon, cutoffDayOffset]);

  useEffect(() => {
    loadPredictiveData();
  }, [loadPredictiveData]);

  const trends = summaryData?.trends || {};
  const regime = trends.regime_summary || {};
  const diurnal = trends.diurnal_profile || [];
  const rollingSeries = trends.rolling_series || [];
  const models = backtestData?.models || [];
  const heldOutSeries = backtestData?.held_out_series || [];
  const folds = backtestData?.walk_forward_folds || [];

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-eyebrow">
            <span>PAGE 05 • PREDICTIVE INSIGHTS &amp; MODEL COMPARISON</span>
          </div>
          <h1 className="section-title">
            Official Elexon Forecast vs. Simple Baselines &amp; Experimental Model
          </h1>
          <p className="section-desc">
            Tests whether simple math baselines or a machine learning model (using only past wind
            numbers) can beat Elexon&apos;s official weather-based wind forecast on January 21–31,
            2026.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span className="badge badge-observation">OBSERVED HISTORICAL TRENDS</span>
          <span className="badge badge-official">OFFICIAL ELEXON WINDFOR</span>
          <span className="badge badge-hypothetical">
            EXPERIMENTAL STATISTICAL MODEL
          </span>
        </div>
      </div>

      {loading && <LoadingState message="Running chronological walk-forward backtest and diurnal trend decomposition..." />}
      {error && <ErrorState error={error} onRetry={loadPredictiveData} />}

      {!loading && !error && summaryData && backtestData && (
        <>
          {/* Model Status & Scientific Limitations Banner */}
          <div
            className="editorial-panel"
            style={{
              background: 'var(--bg-amber-tint)',
              borderColor: 'var(--border-amber)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                marginBottom: '0.5rem',
              }}
            >
              <span className="badge badge-hypothetical">
                VALIDATION STATUS: {backtestData.validation_status.toUpperCase()}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                Training Window: {backtestData.initial_training_window} (Expanding) → Held-Out
                Evaluation: {backtestData.held_out_evaluation_window} (
                {backtestData.comparable_held_out_hours}h)
              </span>
            </div>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.15rem',
                color: 'var(--text-primary)',
                marginBottom: '0.35rem',
              }}
            >
              Empirical Backtest Finding: {backtestData.finding_headline}
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              {backtestData.limitations_statement}
            </p>
          </div>

          {/* 4-Model Comparison Table & Bar Chart */}
          <div className="grid-sidebar-right">
            <div className="editorial-panel">
              <div className="panel-header">
                <div>
                  <span className="section-eyebrow">
                    HELD-OUT COMPARABLE SUBSET ({backtestData.held_out_evaluation_window})
                  </span>
                  <h3 className="panel-title">
                    Official Elexon vs. Baselines &amp; Experimental Model
                  </h3>
                  <p className="panel-subtitle">
                    All predictors are evaluated at the exact same prediction origin (
                    {cutoffTimeLondon} London on D{cutoffDayOffset}) using only observations
                    completed prior to that cutoff.
                  </p>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Predictor / Model</th>
                      <th>Category</th>
                      <th>Hours</th>
                      <th>MAE (MW)</th>
                      <th>RMSE (MW)</th>
                      <th>Mean Bias (MW)</th>
                      <th>Median |Error|</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => (
                      <tr
                        key={m.model_id}
                        className={
                          m.model_id === 'official_elexon_windfor' ? 'selected-row' : ''
                        }
                      >
                        <td>
                          <strong>{m.model_name}</strong>
                          <div
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--text-muted)',
                              fontFamily: 'var(--font-sans)',
                              marginTop: '0.15rem',
                            }}
                          >
                            {m.description}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              m.category.includes('official')
                                ? 'badge-official'
                                : m.category.includes('experimental')
                                ? 'badge-hypothetical'
                                : 'badge-observation'
                            }`}
                          >
                            {m.category.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>{m.sample_count}</td>
                        <td style={{ fontWeight: 700 }}>{formatMw(m.mae_mw, 1)}</td>
                        <td>{formatMw(m.rmse_mw, 1)}</td>
                        <td>{formatSignedMw(m.mean_bias_mw, 1)}</td>
                        <td>{formatMw(m.median_abs_error_mw, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="editorial-panel">
              <div className="panel-header">
                <div>
                  <span className="section-eyebrow">HELD-OUT MAE &amp; RMSE COMPARISON</span>
                  <h3 className="panel-title">Model vs. Baseline Error (MW)</h3>
                </div>
              </div>
              <div style={{ width: '100%', height: 290 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={models}
                    layout="vertical"
                    margin={{ top: 8, right: 20, left: 20, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3DECF" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                      unit=" MW"
                    />
                    <YAxis
                      type="category"
                      dataKey="model_name"
                      width={150}
                      tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#11261A' }}
                      tickFormatter={(v) => v.split('—')[0].trim()}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FAF8F3',
                        borderColor: '#1B5E3C',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }} />
                    <Bar dataKey="mae_mw" name="Held-Out MAE (MW)" fill="#1B5E3C" />
                    <Bar dataKey="rmse_mw" name="Held-Out RMSE (MW)" fill="#C47416" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Held-Out Predicted vs Actual Time Series Chart */}
          <div className="editorial-panel">
            <div className="panel-header">
              <div>
                <span className="section-eyebrow">
                  HELD-OUT BACKTEST SERIES • {backtestData.held_out_evaluation_window}
                </span>
                <h3 className="panel-title">
                  Actual Generation vs. Official Elexon Forecast, Baselines &amp; Experimental
                  Model (MW)
                </h3>
                <p className="panel-subtitle">
                  Visually distinguishes observed Elexon actuals (solid dark pine), official Elexon
                  WINDFOR forecast (solid emerald), experimental lagged Ridge regression (dashed
                  violet), and Persistence baseline (dotted slate).
                </p>
              </div>
            </div>
            <div style={{ width: '100%', height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={heldOutSeries}
                  margin={{ top: 12, right: 32, left: 16, bottom: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3DECF" />
                  <XAxis
                    dataKey="target_start_london"
                    minTickGap={56}
                    tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                    tickFormatter={(v) => (v ? v.slice(5, 16) : '')}
                  />
                  <YAxis
                    width={82}
                    tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                    tickFormatter={(v) => `${Number(v).toLocaleString('en-GB')} MW`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FAF8F3',
                      borderColor: '#1B5E3C',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      color: '#11261A',
                    }}
                    formatter={(val, name) => [`${Number(val).toLocaleString('en-GB')} MW`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }} />
                  <Line
                    type="monotone"
                    dataKey="actual_hourly_mw"
                    name="Observed Actual Generation (FUELHH)"
                    stroke="#11261A"
                    strokeWidth={2.4}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="elexon_forecast_mw"
                    name="Official Elexon WINDFOR Forecast"
                    stroke="#237A4B"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="experimental_ridge_mw"
                    name="Experimental Model (Lagged Ridge)"
                    stroke="#6D4C93"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="persistence_baseline_mw"
                    name="Baseline A — Persistence"
                    stroke="#7C8B80"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Historical Trend Analysis: 24h Rolling Mean + Diurnal Hour-of-Day Pattern */}
          <div className="grid-2col">
            <div className="editorial-panel">
              <div className="panel-header">
                <div>
                  <span className="section-eyebrow">
                    OBSERVED HISTORICAL TREND • JANUARY 2026
                  </span>
                  <h3 className="panel-title">
                    24-Hour Rolling Average &amp; Synoptic Variability Band
                  </h3>
                  <p className="panel-subtitle">
                    January 2026 Mean: {formatMw(regime.mean_mw, 0)} | Std Dev:{' '}
                    {formatMw(regime.std_mw, 0)} (CV: {formatPct(regime.coefficient_of_variation_pct, 1)}
                    )
                  </p>
                </div>
              </div>
              <div style={{ width: '100%', height: 290 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={rollingSeries}
                    margin={{ top: 10, right: 16, left: 6, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3DECF" />
                    <XAxis
                      dataKey="target_start_london"
                      minTickGap={52}
                      tick={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                      tickFormatter={(v) => (v ? v.slice(5, 10) : '')}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                      unit=" MW"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FAF8F3',
                        borderColor: '#1B5E3C',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        color: '#11261A',
                      }}
                      itemStyle={{ color: '#11261A', fontWeight: 600 }}
                      formatter={(val, name) => [`${Number(val).toLocaleString('en-GB')} MW`, name]}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }} />
                    <Area
                      type="monotone"
                      dataKey="upper_band_mw"
                      name="Rolling 24h Mean + 1σ"
                      fill="rgba(118, 190, 100, 0.25)"
                      stroke="#237A4B"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <Line
                      type="monotone"
                      dataKey="actual_hourly_mw"
                      name="Hourly Actual (MW)"
                      stroke="#475569"
                      strokeWidth={1.2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="rolling_24h_mean_mw"
                      name="24h Rolling Mean (MW)"
                      stroke="#11261A"
                      strokeWidth={2.3}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="editorial-panel">
              <div className="panel-header">
                <div>
                  <span className="section-eyebrow">DIURNAL HOUR-OF-DAY PROFILE (00:00 TO 23:00)</span>
                  <h3 className="panel-title">
                    Mean Generation &amp; Forecast Error by Hour of Day
                  </h3>
                  <p className="panel-subtitle">
                    Aggregated across all 31 days of January 2026 (n = 31 observations per clock
                    hour).
                  </p>
                </div>
              </div>
              <div style={{ width: '100%', height: 290 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={diurnal}
                    margin={{ top: 10, right: 16, left: 6, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3DECF" />
                    <XAxis
                      dataKey="hour_label"
                      tick={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                      unit=" MW"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FAF8F3',
                        borderColor: '#1B5E3C',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }} />
                    <Line
                      type="monotone"
                      dataKey="mean_actual_mw"
                      name="Mean Actual (MW)"
                      stroke="#11261A"
                      strokeWidth={2.5}
                    />
                    <Line
                      type="monotone"
                      dataKey="mean_forecast_mw"
                      name="Mean Selected Forecast (MW)"
                      stroke="#237A4B"
                      strokeWidth={2.2}
                      strokeDasharray="5 3"
                    />
                    <Bar
                      dataKey="mae_mw"
                      name="Hour-of-Day MAE (MW)"
                      fill="#76BE64"
                      radius={[3, 3, 0, 0]}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Walk-Forward Fold Summary Table */}
          <div className="editorial-panel">
            <div className="panel-header">
              <div>
                <span className="section-eyebrow">WALK-FORWARD DAILY FOLDS</span>
                <h3 className="panel-title">
                  Expanding-Window Chronological Backtest Folds (2026-01-21 to 2026-01-31)
                </h3>
              </div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Evaluation Date</th>
                    <th>Prediction Origin (UTC)</th>
                    <th>Prior Training Hours</th>
                    <th>Eval Hours</th>
                    <th>Official Elexon MAE</th>
                    <th>Persistence Baseline MAE</th>
                    <th>Seasonal Naive MAE</th>
                    <th>Experimental Ridge MAE</th>
                  </tr>
                </thead>
                <tbody>
                  {folds.map((f) => (
                    <tr key={f.eval_date_london}>
                      <td>
                        <strong>{f.eval_date_london}</strong>
                      </td>
                      <td>{f.prediction_origin_utc}</td>
                      <td>{f.training_samples_count}h</td>
                      <td>{f.eval_hours_count}h</td>
                      <td style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
                        {formatMw(f.elexon_mae_mw, 1)}
                      </td>
                      <td>{formatMw(f.persistence_mae_mw, 1)}</td>
                      <td>{formatMw(f.seasonal_naive_mae_mw, 1)}</td>
                      <td>{formatMw(f.experimental_ridge_mae_mw, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
