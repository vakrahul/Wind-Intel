import React, { useState, useEffect, useCallback } from 'react';
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { apiClient } from '../services/apiClient';
import {
  JAN_2026_DATES,
  HOURS_OF_DAY,
  buildTargetUtc,
  formatHours,
  formatMw,
  formatShortUtc,
  formatSignedMw,
} from '../utils/formatters';
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanners';

export function ForecastTimelinePage({
  cutoffTimeLondon,
  cutoffDayOffset,
  selectedDate,
  setSelectedDate,
  selectedHour,
  setSelectedHour,
}) {
  const [timelineData, setTimelineData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const targetStartUtc = buildTargetUtc(selectedDate, selectedHour);

  const loadVintages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getForecastVintages({
        targetStartUtc,
        cutoffTimeLondon,
        cutoffDayOffset,
      });
      setTimelineData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [targetStartUtc, cutoffTimeLondon, cutoffDayOffset]);

  useEffect(() => {
    loadVintages();
  }, [loadVintages]);

  const vintages = timelineData?.vintages || [];
  const selectedVintage = timelineData?.selected_vintage || null;

  const chartSeries = vintages.map((v) => ({
    ...v,
    pubShort: v.publish_time_london.slice(5, 16),
    eligibleForecastMw: v.qualifies_at_cutoff ? v.forecast_mw : null,
    excludedForecastMw: !v.qualifies_at_cutoff ? v.forecast_mw : null,
    selectedPointMw: v.is_selected ? v.forecast_mw : null,
    actualLineMw: timelineData?.actual_hourly_mw ?? null,
  }));

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-eyebrow">
            <span>PAGE 03 • FORECAST UPDATE HISTORY</span>
          </div>
          <h1 className="section-title">
            All Forecast Updates Before &amp; After Your Buying Deadline
          </h1>
          <p className="section-desc">
            See every wind forecast update Elexon released for your chosen hour. Forecasts published
            before your buying deadline are shown in green; updates published after the deadline are
            shown in grey and blocked.
          </p>
        </div>

        {/* Interval Selector */}
        <div className="control-group">
          <span className="control-label">DELIVERY DATE:</span>
          <select
            aria-label="Timeline Delivery Date"
            className="field-select"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {JAN_2026_DATES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <span className="control-label">DELIVERY HOUR:</span>
          <select
            aria-label="Timeline Delivery Hour"
            className="field-select"
            value={selectedHour}
            onChange={(e) => setSelectedHour(Number(e.target.value))}
          >
            {HOURS_OF_DAY.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <LoadingState message="Retrieving historical WINDFOR vintages for target interval..." />}
      {error && <ErrorState error={error} onRetry={loadVintages} />}

      {!loading && !error && timelineData && vintages.length === 0 && (
        <EmptyState title="No historical WINDFOR vintages found for this interval" />
      )}

      {!loading && !error && timelineData && vintages.length > 0 && (
        <>
          {/* 5-Cell Interval Vintage Summary Strip */}
          <div className="kpi-strip">
            <div className="kpi-cell highlight-pistachio">
              <span className="kpi-label">Selected Forecast at Cutoff</span>
              <div className="kpi-value">
                {selectedVintage
                  ? Number(selectedVintage.forecast_mw).toLocaleString('en-GB')
                  : '—'}
                <span className="kpi-unit">MW</span>
              </div>
              <div className="kpi-sub">
                Pub: {selectedVintage ? selectedVintage.publish_time_london : 'None'}
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Forecast Lead Time at Cutoff</span>
              <div className="kpi-value">
                {selectedVintage ? formatHours(selectedVintage.lead_time_hours, 1) : '—'}
              </div>
              <div className="kpi-sub">
                Cutoff: {timelineData.cutoff_london}
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Aligned Actual Generation</span>
              <div className="kpi-value">
                {timelineData.actual_hourly_mw !== null
                  ? Number(timelineData.actual_hourly_mw).toLocaleString('en-GB')
                  : '—'}
                <span className="kpi-unit">MW</span>
              </div>
              <div className="kpi-sub">
                HH(:00) {formatMw(timelineData.actual_hh_00_mw, 0)} | HH(:30){' '}
                {formatMw(timelineData.actual_hh_30_mw, 0)}
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Forecast Error (Fcst − Actual)</span>
              <div
                className="kpi-value"
                style={{
                  color:
                    (timelineData.error_mw || 0) >= 0
                      ? 'var(--status-amber)'
                      : 'var(--status-crimson)',
                }}
              >
                {formatSignedMw(timelineData.error_mw, 1)}
              </div>
              <div className="kpi-sub">
                Direction: {String(timelineData.error_direction || '—').toUpperCase()}
              </div>
            </div>

            <div className="kpi-cell">
              <span className="kpi-label">Vintage Eligibility Count</span>
              <div className="kpi-value">
                {timelineData.eligible_vintages_count}
                <span className="kpi-unit">
                  / {timelineData.total_vintages_count} eligible
                </span>
              </div>
              <div className="kpi-sub">
                {timelineData.excluded_future_vintages_count} post-cutoff vintages excluded
              </div>
            </div>
          </div>

          {/* Interactive Publication Evolution Chart */}
          <div className="editorial-panel">
            <div className="panel-header">
              <div>
                <span className="section-eyebrow">
                  CHRONOLOGICAL PUBLICATION TRAJECTORY • TARGET {timelineData.target_start_london}
                </span>
                <h3 className="panel-title">
                  Forecast Vintage Evolution Across Publication Time vs. Decision Cutoff
                </h3>
                <p className="panel-subtitle">
                  Solid emerald line shows vintages published at or before the{' '}
                  {timelineData.cutoff_london} cutoff. Dashed muted line shows later publications
                  excluded from the procurement replay. Horizontal pine line marks the actual
                  delivered generation ({formatMw(timelineData.actual_hourly_mw, 1)}).
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <span className="badge badge-official">
                  SELECTED VINTAGE: {formatShortUtc(selectedVintage?.publish_time_utc)}
                </span>
                <span className="badge badge-excluded">
                  EXCLUDED POST-CUTOFF ({timelineData.excluded_future_vintages_count})
                </span>
              </div>
            </div>

            <div style={{ width: '100%', height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartSeries}
                  margin={{ top: 28, right: 24, left: 16, bottom: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3DECF" />
                  <XAxis
                    dataKey="pubShort"
                    tickMargin={10}
                    tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
                  />
                  <YAxis
                    domain={[(dataMin) => Math.floor(dataMin * 0.94), (dataMax) => Math.ceil(dataMax * 1.04)]}
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
                    formatter={(val, name) => [
                      val !== null ? `${Number(val).toLocaleString('en-GB')} MW` : '—',
                      name,
                    ]}
                    labelFormatter={(_, payload) => {
                      const v = payload?.[0]?.payload;
                      if (!v) return '';
                      return `Published: ${v.publish_time_london} (${v.lead_time_hours}h before delivery) • ${v.status_label}`;
                    }}
                  />
                  {timelineData.actual_hourly_mw !== null && (
                    <ReferenceLine
                      y={timelineData.actual_hourly_mw}
                      stroke="#11261A"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      label={{
                        value: `Actual Delivered: ${formatMw(timelineData.actual_hourly_mw, 0)}`,
                        fill: '#11261A',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        position: 'insideTopRight',
                      }}
                    />
                  )}
                  {selectedVintage && (
                    <ReferenceLine
                      x={selectedVintage.publish_time_london.slice(5, 16)}
                      stroke="#1B5E3C"
                      strokeWidth={2}
                      label={{
                        value: `Selected Cutoff Gate (${timelineData.cutoff_london})`,
                        fill: '#1B5E3C',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        position: 'top',
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="eligibleForecastMw"
                    name="Eligible Vintage (<= Cutoff)"
                    stroke="#1B5E3C"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#1B5E3C' }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="excludedForecastMw"
                    name="Excluded Post-Cutoff Vintage (> Cutoff)"
                    stroke="#94A3B8"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3.5, fill: '#94A3B8' }}
                    connectNulls
                  />
                  <Scatter
                    dataKey="selectedPointMw"
                    name="Selected Procurement Vintage"
                    fill="#76BE64"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Complete Vintage Audit Ledger Table */}
          <div className="editorial-panel">
            <div className="panel-header">
              <div>
                <span className="section-eyebrow">COMPLETE VINTAGE AUDIT LEDGER</span>
                <h3 className="panel-title">
                  All Historical WINDFOR Vintages Targeting {timelineData.target_start_london}
                </h3>
              </div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Publish Time (UTC)</th>
                    <th>Publish Time (Europe/London)</th>
                    <th>Lead Time (Hours)</th>
                    <th>Forecast Power (MW)</th>
                    <th>Implied Error vs. Actual</th>
                    <th>Cutoff Qualification Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vintages.map((v) => {
                    const impErr =
                      timelineData.actual_hourly_mw !== null
                        ? v.forecast_mw - timelineData.actual_hourly_mw
                        : null;
                    return (
                      <tr
                        key={v.publish_time_utc}
                        className={
                          v.is_selected
                            ? 'selected-row'
                            : !v.qualifies_at_cutoff
                            ? 'excluded-row'
                            : ''
                        }
                      >
                        <td>{v.publish_time_utc}</td>
                        <td>{v.publish_time_london}</td>
                        <td>{formatHours(v.lead_time_hours, 1)}</td>
                        <td style={{ fontWeight: 700 }}>{formatMw(v.forecast_mw, 1)}</td>
                        <td>{formatSignedMw(impErr, 1)}</td>
                        <td>
                          {v.is_selected ? (
                            <span className="badge badge-official">{v.status_label}</span>
                          ) : v.qualifies_at_cutoff ? (
                            <span className="badge badge-observation">{v.status_label}</span>
                          ) : (
                            <span className="badge badge-excluded">{v.status_label}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
