import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { apiClient } from '../services/apiClient';
import {
  JAN_2026_DATES,
  formatHours,
  formatMw,
  formatPct,
  formatSignedMw,
} from '../utils/formatters';
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanners';

export function AccuracyLabPage({ cutoffTimeLondon, cutoffDayOffset }) {
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-01-31');
  const [summary, setSummary] = useState(null);
  const [dailyData, setDailyData] = useState(null);
  const [leadTimeData, setLeadTimeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAccuracyData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, dayRes, leadRes] = await Promise.all([
        apiClient.getMetricsSummary({
          startDate,
          endDate,
          cutoffTimeLondon,
          cutoffDayOffset,
        }),
        apiClient.getDailyMetrics({
          startDate,
          endDate,
          cutoffTimeLondon,
          cutoffDayOffset,
        }),
        apiClient.getLeadTimeMetrics({ startDate, endDate }),
      ]);
      setSummary(sumRes);
      setDailyData(dayRes);
      setLeadTimeData(leadRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, cutoffTimeLondon, cutoffDayOffset]);

  useEffect(() => {
    loadAccuracyData();
  }, [loadAccuracyData]);

  const csvUrl = apiClient.getCsvExportUrl({
    startDate,
    endDate,
    cutoffTimeLondon,
    cutoffDayOffset,
  });

  const ep = summary?.error_percentiles_mw || {};
  const aep = summary?.abs_error_percentiles_mw || {};

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-eyebrow">
            <span>PAGE 04 • ACCURACY LAB &amp; ERROR CHARTS</span>
          </div>
          <h1 className="section-title">
            Forecast Error Breakdown, Daily Charts &amp; Lead-Time Comparison
          </h1>
          <p className="section-desc">
            See how often forecasts were too high or too low, how accuracy changes from 3 hours to
            48 hours before delivery, and download the full CSV dataset.
          </p>
        </div>

        <div className="control-group">
          <span className="control-label">FROM:</span>
          <select
            aria-label="Accuracy Start Date"
            className="field-select"
            value={startDate}
            onChange={(e) => {
              const v = e.target.value;
              setStartDate(v);
              if (v > endDate) setEndDate(v);
            }}
          >
            {JAN_2026_DATES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <span className="control-label">TO:</span>
          <select
            aria-label="Accuracy End Date"
            className="field-select"
            value={endDate}
            onChange={(e) => {
              const v = e.target.value;
              setEndDate(v);
              if (v < startDate) setStartDate(v);
            }}
          >
            {JAN_2026_DATES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <a
            href={csvUrl}
            download
            className="btn-pistachio"
            style={{ textDecoration: 'none' }}
          >
            Export Aligned CSV ↓
          </a>
        </div>
      </div>

      {loading && <LoadingState message="Computing error percentiles, daily accuracy, and horizon buckets..." />}
      {error && <ErrorState error={error} onRetry={loadAccuracyData} />}

      {!loading && !error && summary && !summary.sufficient_sample && <EmptyState />}

      {!loading && !error && summary && summary.sufficient_sample && (
        <>
          {/* KPI Strip */}
          <div className="kpi-strip">
            <div className="kpi-cell highlight-pistachio">
              <span className="kpi-label">Scope MAE ({summary.unit})</span>
              <div className="kpi-value">
                {Number(summary.mae_mw).toLocaleString('en-GB')}
                <span className="kpi-unit">MW</span>
              </div>
              <div className="kpi-sub">
                Scope: {startDate} to {endDate}
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Scope RMSE ({summary.unit})</span>
              <div className="kpi-value">
                {Number(summary.rmse_mw).toLocaleString('en-GB')}
                <span className="kpi-unit">MW</span>
              </div>
              <div className="kpi-sub">
                RMSE / MAE Ratio: {(summary.rmse_mw / summary.mae_mw).toFixed(2)}x
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Mean Bias (Fcst − Actual)</span>
              <div className="kpi-value">
                {formatSignedMw(summary.mean_bias_mw, 1)}
              </div>
              <div className="kpi-sub">
                {summary.mean_bias_mw > 0
                  ? 'Net Overforecasting tendency'
                  : 'Net Underforecasting tendency'}
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">MAPE &amp; Near-Zero Safeguard</span>
              <div className="kpi-value">
                {summary.mape_pct !== null ? formatPct(summary.mape_pct, 2) : 'Suppressed'}
              </div>
              <div className="kpi-sub">
                {summary.mape_suppressed_count === 0
                  ? 'All intervals >= 100 MW threshold (0h suppressed)'
                  : `Excluded ${summary.mape_suppressed_count}h near-zero intervals (< 100 MW)`}
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Data Coverage &amp; Sample Size</span>
              <div className="kpi-value">
                {formatPct(summary.coverage_pct, 1)}
              </div>
              <div className="kpi-sub">
                {summary.valid_paired_count} valid pairs / {summary.total_target_hours} target hours
              </div>
            </div>
          </div>

          {/* 2-Column: Error Distribution Histogram + Lead-Time Horizon Accuracy Curve */}
          <div className="grid-2col">
            <div className="editorial-panel">
              <div className="panel-header">
                <div>
                  <span className="section-eyebrow">EMPIRICAL ERROR HISTOGRAM</span>
                  <h3 className="panel-title">
                    Forecast Error Distribution (MW Bins)
                  </h3>
                  <p className="panel-subtitle">
                    Distribution of hourly errors (forecast_mw − actual_mw) across{' '}
                    {summary.valid_paired_count} paired hours.
                  </p>
                </div>
              </div>
              <div style={{ width: '100%', height: 290 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={summary.error_histogram || []}
                    margin={{ top: 10, right: 16, left: 6, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3DECF" />
                    <XAxis
                      dataKey="bin_label"
                      angle={-20}
                      textAnchor="end"
                      height={54}
                      tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
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
                    <Bar
                      dataKey="overforecast_count"
                      name="Overforecast Hours (+)"
                      stackId="a"
                      fill="#C47416"
                    />
                    <Bar
                      dataKey="underforecast_count"
                      name="Underforecast Hours (−)"
                      stackId="a"
                      fill="#B83A2A"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="editorial-panel">
              <div className="panel-header">
                <div>
                  <span className="section-eyebrow">
                    MODE B • LEAD-TIME HORIZON DEGRADATION (3H TO 48H)
                  </span>
                  <h3 className="panel-title">
                    Accuracy vs. Forecast Horizon Lead Time
                  </h3>
                  <p className="panel-subtitle">
                    Evaluates selected forecast vintages at fixed lead-time horizons (3h, 6h, 12h,
                    18h, 24h, 36h, 48h prior to delivery).
                  </p>
                </div>
              </div>
              <div style={{ width: '100%', height: 290 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={(leadTimeData?.buckets || []).filter((b) => b.sufficient_sample)}
                    margin={{ top: 10, right: 16, left: 6, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3DECF" />
                    <XAxis
                      dataKey="bucket_label"
                      tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                      tickFormatter={(v) => v.split(' ')[0]}
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
                    <Bar
                      dataKey="mae_mw"
                      name="Horizon MAE (MW)"
                      fill="#237A4B"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="rmse_mw"
                      name="Horizon RMSE (MW)"
                      stroke="#11261A"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#11261A' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Percentile Matrix Table */}
          <div className="editorial-panel">
            <div className="panel-header">
              <div>
                <span className="section-eyebrow">QUANTILE &amp; PERCENTILE STRUCTURE</span>
                <h3 className="panel-title">
                  Signed Error &amp; Absolute Error Percentiles (P05 to P95)
                </h3>
              </div>
              <span className="badge badge-official">
                SAMPLE SIZE: {summary.valid_paired_count} PAIRED HOURS
              </span>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Metric Distribution</th>
                    <th>P05 (5th)</th>
                    <th>P10 (10th)</th>
                    <th>P25 (Quartile 1)</th>
                    <th>P50 (Median)</th>
                    <th>P75 (Quartile 3)</th>
                    <th>P90 (90th)</th>
                    <th>P95 (95th)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Signed Error (forecast − actual)</strong>
                    </td>
                    <td>{formatSignedMw(ep.p05, 1)}</td>
                    <td>{formatSignedMw(ep.p10, 1)}</td>
                    <td>{formatSignedMw(ep.p25, 1)}</td>
                    <td style={{ fontWeight: 700 }}>{formatSignedMw(ep.p50_median, 1)}</td>
                    <td>{formatSignedMw(ep.p75, 1)}</td>
                    <td>{formatSignedMw(ep.p90, 1)}</td>
                    <td>{formatSignedMw(ep.p95, 1)}</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Absolute Error |forecast − actual|</strong>
                    </td>
                    <td>{formatMw(aep.p05, 1)}</td>
                    <td>{formatMw(aep.p10, 1)}</td>
                    <td>{formatMw(aep.p25, 1)}</td>
                    <td style={{ fontWeight: 700 }}>{formatMw(aep.p50_median, 1)}</td>
                    <td>{formatMw(aep.p75, 1)}</td>
                    <td>{formatMw(aep.p90, 1)}</td>
                    <td>{formatMw(aep.p95, 1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Daily Accuracy Chart */}
          <div className="editorial-panel">
            <div className="panel-header">
              <div>
                <span className="section-eyebrow">DAILY ACCURACY BREAKDOWN</span>
                <h3 className="panel-title">
                  Daily MAE, RMSE &amp; Mean Bias Across Delivery Dates (MW)
                </h3>
              </div>
            </div>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={dailyData?.days || []}
                  margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3DECF" />
                  <XAxis
                    dataKey="delivery_date_london"
                    tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                    unit=" MW"
                  />
                  <ReferenceLine y={0} stroke="#11261A" strokeWidth={1} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FAF8F3',
                      borderColor: '#1B5E3C',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }} />
                  <Bar
                    dataKey="mae_mw"
                    name="Daily MAE (MW)"
                    fill="#76BE64"
                    radius={[3, 3, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="rmse_mw"
                    name="Daily RMSE (MW)"
                    stroke="#11261A"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="mean_bias_mw"
                    name="Daily Mean Bias (MW)"
                    stroke="#C47416"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lead-Time Horizon Table */}
          <div className="editorial-panel">
            <div className="panel-header">
              <div>
                <span className="section-eyebrow">FIXED LEAD-TIME HORIZON TABLE</span>
                <h3 className="panel-title">
                  Accuracy Grouped by Forecast Horizon (3h to 48h Lead Times)
                </h3>
                <p className="panel-subtitle">{leadTimeData?.methodology_note}</p>
              </div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Horizon Bucket</th>
                    <th>Target Lead</th>
                    <th>Mean Realized Lead</th>
                    <th>Paired Hours</th>
                    <th>Coverage (%)</th>
                    <th>MAE (MW)</th>
                    <th>RMSE (MW)</th>
                    <th>Mean Bias (MW)</th>
                    <th>Median |Error|</th>
                    <th>Over / Under (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {(leadTimeData?.buckets || []).map((b) => (
                    <tr key={b.bucket_id}>
                      <td>
                        <strong>{b.bucket_label}</strong>
                      </td>
                      <td>{formatHours(b.min_lead_hours, 0)}</td>
                      <td>{formatHours(b.mean_actual_lead_hours, 1)}</td>
                      <td>{b.paired_hours_count}</td>
                      <td>{formatPct(b.coverage_pct, 1)}</td>
                      <td style={{ fontWeight: 700 }}>{formatMw(b.mae_mw, 1)}</td>
                      <td>{formatMw(b.rmse_mw, 1)}</td>
                      <td>{formatSignedMw(b.mean_bias_mw, 1)}</td>
                      <td>{formatMw(b.median_abs_error_mw, 1)}</td>
                      <td>
                        {formatPct(b.overforecast_pct, 1)} / {formatPct(b.underforecast_pct, 1)}
                      </td>
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
