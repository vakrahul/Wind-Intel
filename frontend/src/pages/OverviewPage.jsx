import React, { useState, useEffect, useCallback } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  Cell,
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
  formatMwh,
  formatPct,
  formatShortUtc,
  formatSignedMw,
} from '../utils/formatters';
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanners';

export function OverviewPage({
  cutoffTimeLondon,
  cutoffDayOffset,
  onInspectInterval,
}) {
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-01-31');
  const [summary, setSummary] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, selRes] = await Promise.all([
        apiClient.getMetricsSummary({
          startDate,
          endDate,
          cutoffTimeLondon,
          cutoffDayOffset,
        }),
        apiClient.getSelectedForecasts({
          startDate,
          endDate,
          cutoffTimeLondon,
          cutoffDayOffset,
        }),
      ]);
      setSummary(sumRes);
      setSelectedSeries(selRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, cutoffTimeLondon, cutoffDayOffset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const records = selectedSeries?.records || [];
  const latestValidRecord =
    records.length > 0
      ? [...records]
          .reverse()
          .find((r) => r.forecast_mw !== null && r.actual_hourly_mw !== null) || records[0]
      : null;

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-eyebrow">
            <span>PAGE 01 • JANUARY 2026 OVERVIEW</span>
          </div>
          <h1 className="section-title">
            Wind Forecast vs. Actual Generation Summary
          </h1>
          <p className="section-desc">
            Shows the wind forecast available before your buying deadline ({cutoffTimeLondon} London
            time, D{cutoffDayOffset}) and compares it with the actual wind power generated in
            January 2026.
          </p>
        </div>

        {/* Date Filter Controls */}
        <div className="control-group">
          <span className="control-label">FROM:</span>
          <select
            aria-label="Start Date"
            className="field-select"
            value={startDate}
            onChange={(e) => {
              const val = e.target.value;
              setStartDate(val);
              if (val > endDate) setEndDate(val);
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
            aria-label="End Date"
            className="field-select"
            value={endDate}
            onChange={(e) => {
              const val = e.target.value;
              setEndDate(val);
              if (val < startDate) setStartDate(val);
            }}
          >
            {JAN_2026_DATES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setStartDate('2026-01-01');
              setEndDate('2026-01-31');
            }}
          >
            Full Month (Jan 1–31)
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setStartDate('2026-01-08');
              setEndDate('2026-01-15');
            }}
          >
            Jan 8–15 Storm Week
          </button>
        </div>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState error={error} onRetry={loadData} />}

      {!loading && !error && summary && !summary.sufficient_sample && (
        <EmptyState />
      )}

      {!loading && !error && summary && summary.sufficient_sample && (
        <>
          {/* Simple Deadline Info Bar */}
          <div
            className="editorial-panel pistachio-panel"
            style={{
              padding: '0.9rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span className="badge badge-official">JANUARY 2026 DATA</span>
              <span className="badge badge-observation">
                DEADLINE: D{cutoffDayOffset} AT {cutoffTimeLondon} LONDON
              </span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Only forecasts published at or before {cutoffTimeLondon} (D{cutoffDayOffset}) are
                used. Later forecast updates are excluded.
              </span>
            </div>
            {latestValidRecord && (
              <div
                className="tabular-nums"
                style={{ fontSize: '0.76rem', color: 'var(--accent-emerald)', fontWeight: 600 }}
              >
                Avg Lead Time: {formatHours(summary.mean_lead_time_hours)} | Latest Forecast Used:{' '}
                {formatShortUtc(latestValidRecord.forecast_publish_utc)}
              </div>
            )}
          </div>

          {/* 6-Cell Primary KPI Strip */}
          <div className="kpi-strip">
            <div className="kpi-cell highlight-pistachio">
              <span className="kpi-label">Average Error (MAE)</span>
              <div className="kpi-value">
                {Number(summary.mae_mw).toLocaleString('en-GB')}
                <span className="kpi-unit">MW</span>
              </div>
              <div className="kpi-sub">
                Typical (Median) Miss: {formatMw(summary.median_abs_error_mw, 0)}
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Root Mean Sq Error (RMSE)</span>
              <div className="kpi-value">
                {Number(summary.rmse_mw).toLocaleString('en-GB')}
                <span className="kpi-unit">MW</span>
              </div>
              <div className="kpi-sub">
                Gives extra weight to large misses
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Average Bias (Forecast − Actual)</span>
              <div
                className="kpi-value"
                style={{
                  color:
                    summary.mean_bias_mw > 0
                      ? 'var(--status-amber)'
                      : 'var(--status-crimson)',
                }}
              >
                {summary.mean_bias_mw > 0 ? '+' : ''}
                {Number(summary.mean_bias_mw).toLocaleString('en-GB')}
                <span className="kpi-unit">MW</span>
              </div>
              <div className="kpi-sub">
                + means forecast was too high
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Too High vs. Too Low Split</span>
              <div className="kpi-value">
                {formatPct(summary.overforecast_pct, 1)}
                <span className="kpi-unit">/ {formatPct(summary.underforecast_pct, 1)}</span>
              </div>
              <div className="kpi-sub">
                {summary.overforecast_count}h Too High (+), {summary.underforecast_count}h Too Low (−)
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Average Wind Power</span>
              <div className="kpi-value">
                {Number(summary.mean_actual_mw).toLocaleString('en-GB')}
                <span className="kpi-unit">MW actual</span>
              </div>
              <div className="kpi-sub">
                Avg Forecast: {formatMw(summary.mean_forecast_mw, 0)}
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Data Completeness</span>
              <div className="kpi-value">
                {formatPct(summary.coverage_pct, 1)}
                <span className="kpi-unit">
                  ({summary.valid_paired_count}/{summary.total_target_hours}h)
                </span>
              </div>
              <div className="kpi-sub">
                Avg Forecast Lead: {formatHours(summary.mean_lead_time_hours)} early
              </div>
            </div>
          </div>

          {/* Simple Backup Power Guide */}
          <div className="editorial-panel">
            <div className="panel-header">
              <div>
                <span className="section-eyebrow">
                  BUYER&apos;S GUIDE • HOW MUCH BACKUP POWER TO HOLD
                </span>
                <h3 className="panel-title">
                  Recommended Thermal Backup Buffer (Based on January 2026 Errors)
                </h3>
                <p className="panel-subtitle">
                  Because the wind forecast was higher than actual wind in{' '}
                  {formatPct(summary.overforecast_pct, 1)} of hours, buyers should hold extra backup
                  power (gas/thermal) using one of these three safety levels:
                </p>
              </div>
            </div>

            <div className="grid-3col">
              <div
                style={{
                  background: 'var(--bg-pistachio-soft)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                }}
              >
                <div className="kpi-label">50% SAFE BUFFER (P50 MEDIAN)</div>
                <div className="kpi-value" style={{ color: 'var(--accent-emerald)' }}>
                  {formatMw(summary.error_percentiles_mw?.p50_median, 0)}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Subtract <strong>{formatMw(summary.error_percentiles_mw?.p50_median, 0)}</strong>{' '}
                  from the wind forecast to cover a normal hour&apos;s wind shortfall.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--bg-amber-tint)',
                  border: '1px solid var(--border-amber)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                }}
              >
                <div className="kpi-label">75% SAFE BUFFER (P75 PRUDENT)</div>
                <div className="kpi-value" style={{ color: 'var(--status-amber)' }}>
                  {formatMw(summary.error_percentiles_mw?.p75, 0)}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Hold <strong>{formatMw(summary.error_percentiles_mw?.p75, 0)}</strong> of extra
                  backup power to stay safe across 75% of all hours.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--bg-crimson-tint)',
                  border: '1px solid var(--border-crimson)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                }}
              >
                <div className="kpi-label">90% SAFE BUFFER (P90 HIGH SECURITY)</div>
                <div className="kpi-value" style={{ color: 'var(--status-crimson)' }}>
                  {formatMw(summary.error_percentiles_mw?.p90, 0)}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Hold <strong>{formatMw(summary.error_percentiles_mw?.p90, 0)}</strong> of standby
                  thermal power to cover 90% of all wind shortfalls in January 2026.
                </p>
              </div>
            </div>
          </div>

          {/* Primary Chart: Forecast vs Actual Wind Generation */}
          <div className="editorial-panel">
            <div className="panel-header">
              <div>
                <span className="section-eyebrow">
                  HOURLY CHART • {startDate} TO {endDate}
                </span>
                <h3 className="panel-title">
                  Wind Forecast vs. Actual Wind Generation (MW)
                </h3>
                <p className="panel-subtitle">
                  Green area is the wind forecast available before {cutoffTimeLondon} (D
                  {cutoffDayOffset}). Dark line is the actual wind power generated.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="badge badge-official">
                  TOTAL FORECAST ENERGY: {formatMwh(summary.total_forecast_energy_mwh, 0)}
                </span>
                <span className="badge badge-observation">
                  TOTAL ACTUAL ENERGY: {formatMwh(summary.total_actual_energy_mwh, 0)}
                </span>
              </div>
            </div>

            <div style={{ width: '100%', height: 370 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={records}
                  margin={{ top: 12, right: 32, left: 16, bottom: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3DECF" />
                  <XAxis
                    dataKey="target_start_london"
                    minTickGap={64}
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
                    }}
                    formatter={(val, name) => [`${Number(val).toLocaleString('en-GB')} MW`, name]}
                    labelFormatter={(label, payload) => {
                      const row = payload?.[0]?.payload;
                      if (!row) return label;
                      return `Hour: ${row.target_start_london} | Published: ${formatShortUtc(
                        row.forecast_publish_utc
                      )} (${row.lead_time_hours}h early)`;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }} />
                  <Area
                    type="monotone"
                    dataKey="forecast_mw"
                    name="Wind Forecast (MW)"
                    fill="rgba(118, 190, 100, 0.25)"
                    stroke="#237A4B"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual_hourly_mw"
                    name="Actual Wind Generated (MW)"
                    stroke="#11261A"
                    strokeWidth={1.8}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Hourly Forecast Error Chart */}
          <div className="editorial-panel">
            <div className="panel-header">
              <div>
                <span className="section-eyebrow">
                  HOURLY DIFFERENCE • ORANGE = WIND SHORTFALL (+), RED = EXTRA WIND (−)
                </span>
                <h3 className="panel-title">
                  Hourly Forecast Error (Forecast MW − Actual MW)
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="badge badge-over">OVERFORECAST / SHORTFALL (+ MW)</span>
                <span className="badge badge-under">UNDERFORECAST / EXTRA WIND (− MW)</span>
              </div>
            </div>

            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={records} margin={{ top: 12, right: 32, left: 16, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3DECF" />
                  <XAxis
                    dataKey="target_start_london"
                    minTickGap={64}
                    tick={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                    tickFormatter={(v) => (v ? v.slice(5, 16) : '')}
                  />
                  <YAxis
                    width={82}
                    tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                    tickFormatter={(v) => `${Number(v).toLocaleString('en-GB')} MW`}
                  />
                  <ReferenceLine y={0} stroke="#11261A" strokeWidth={1.5} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FAF8F3',
                      borderColor: '#1B5E3C',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                    }}
                    formatter={(val) => [formatSignedMw(val, 1), 'Error (Forecast - Actual)']}
                  />
                  <Bar dataKey="error_mw" name="Forecast Error (MW)">
                    {records.map((entry) => (
                      <Cell
                        key={entry.target_start_utc}
                        fill={(entry.error_mw || 0) >= 0 ? '#C47416' : '#B83A2A'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Biggest Misses Tables */}
          <div className="grid-2col">
            <div className="editorial-panel">
              <div className="panel-header">
                <div>
                  <span className="badge badge-over">BIGGEST WIND SHORTFALLS (+ ERROR)</span>
                  <h3 className="panel-title" style={{ marginTop: '0.4rem' }}>
                    Top 5 Hours Where Actual Wind Was Much Lower Than Forecast
                  </h3>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Delivery Hour</th>
                      <th>Forecast</th>
                      <th>Actual</th>
                      <th>Error (MW)</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.largest_overforecasts || []).map((ev) => (
                      <tr key={ev.target_start_utc}>
                        <td>{ev.target_start_london}</td>
                        <td>{formatMw(ev.forecast_mw, 0)}</td>
                        <td>{formatMw(ev.actual_hourly_mw, 0)}</td>
                        <td style={{ color: 'var(--status-amber)', fontWeight: 700 }}>
                          {formatSignedMw(ev.error_mw, 0)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-outline"
                            style={{ padding: '0.22rem 0.5rem', fontSize: '0.7rem' }}
                            onClick={() => onInspectInterval && onInspectInterval(ev.target_start_utc)}
                          >
                            View in Tree →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="editorial-panel">
              <div className="panel-header">
                <div>
                  <span className="badge badge-under">BIGGEST EXTRA WIND SURPLUSES (− ERROR)</span>
                  <h3 className="panel-title" style={{ marginTop: '0.4rem' }}>
                    Top 5 Hours Where Actual Wind Was Much Higher Than Forecast
                  </h3>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Delivery Hour</th>
                      <th>Forecast</th>
                      <th>Actual</th>
                      <th>Error (MW)</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.largest_underforecasts || []).map((ev) => (
                      <tr key={ev.target_start_utc}>
                        <td>{ev.target_start_london}</td>
                        <td>{formatMw(ev.forecast_mw, 0)}</td>
                        <td>{formatMw(ev.actual_hourly_mw, 0)}</td>
                        <td style={{ color: 'var(--status-crimson)', fontWeight: 700 }}>
                          {formatSignedMw(ev.error_mw, 0)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-outline"
                            style={{ padding: '0.22rem 0.5rem', fontSize: '0.7rem' }}
                            onClick={() => onInspectInterval && onInspectInterval(ev.target_start_utc)}
                          >
                            View in Tree →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
