import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
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
  formatPct,
  formatShortUtc,
  formatSignedMw,
} from '../utils/formatters';

export function LiveControlRoomDemo({
  selectedDate,
  setSelectedDate,
  selectedHour,
  setSelectedHour,
  cutoffTimeLondon,
  setCutoffTimeLondon,
  cutoffDayOffset,
  setCutoffDayOffset,
  onBackToDashboard,
}) {
  const [liveLondonClock, setLiveLondonClock] = useState('');
  const [treeData, setTreeData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState('n6_error');

  // 7. Live UK Clock (Europe/London) updating automatically every second
  useEffect(() => {
    const updateClock = () => {
      try {
        const formatted = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/London',
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        }).format(new Date());
        setLiveLondonClock(formatted);
      } catch {
        setLiveLondonClock(new Date().toUTCString());
      }
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const targetStartUtc = buildTargetUtc(selectedDate, selectedHour);

  const fetchControlRoomState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, sRes] = await Promise.all([
        apiClient.getIntelligenceTree({
          targetStartUtc,
          cutoffTimeLondon,
          cutoffDayOffset,
        }),
        apiClient.getMetricsSummary({
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          cutoffTimeLondon,
          cutoffDayOffset,
        }),
      ]);
      setTreeData(tRes);
      setSummaryData(sRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [targetStartUtc, cutoffTimeLondon, cutoffDayOffset]);

  useEffect(() => {
    fetchControlRoomState();
  }, [fetchControlRoomState]);

  const vCtx = treeData?.interval_vintages || {};
  const selVintage = vCtx.selected_vintage || null;
  const vintages = vCtx.vintages || [];
  const dayMetrics = treeData?.day_metrics || {};
  const monthMetrics = treeData?.month_metrics || {};

  const forecastMw = selVintage ? selVintage.forecast_mw : null;
  const actualMw = vCtx.actual_hourly_mw ?? null;
  const errorMw = vCtx.error_mw ?? null;
  const errorDir = vCtx.error_direction ? vCtx.error_direction.toUpperCase() : 'INCOMPLETE';

  // 5. 7-Node Connected Interactive Energy Intelligence Tree
  const treeNodes = useMemo(() => {
    const missingWarning =
      forecastMw === null
        ? 'WARNING: No eligible forecast published at or before the selected cutoff.'
        : actualMw === null
        ? 'WARNING: Missing or incomplete half-hourly actual settlement pair.'
        : 'Verified complete pair (0 missing observations for this interval).';

    return [
      {
        id: 'n1_delivery',
        step: '01',
        title: 'Delivery Hour',
        metric: vCtx.target_start_london || targetStartUtc,
        sub: `UTC: ${vCtx.target_start_utc || targetStartUtc}`,
        rule: 'Target 1-hour settlement window in January 2026 (Europe/London & UTC).',
        provenance: 'Elexon Settlement Calendar (January 1–31, 2026)',
        warning: missingWarning,
        details: [
          { k: 'Historical Delivery Date', v: vCtx.delivery_date_london || selectedDate },
          { k: 'Delivery Hour (London)', v: `${String(selectedHour).padStart(2, '0')}:00` },
          { k: 'Canonical UTC Start', v: vCtx.target_start_utc || targetStartUtc },
        ],
      },
      {
        id: 'n2_cutoff',
        step: '02',
        title: 'Decision Cutoff',
        metric: vCtx.cutoff_london || `D${cutoffDayOffset} ${cutoffTimeLondon}`,
        sub: `UTC Gate: ${vCtx.cutoff_utc || '—'}`,
        rule: 'cutoff_utc = to_utc(delivery_date_london + cutoff_day_offset, cutoff_time_london) [Default 11:00 London D-1 assignment assumption].',
        provenance: 'WINDLINE Historical Decision Time Machine',
        warning: 'Default 11:00 D-1 is an explicit assignment assumption representing day-ahead gate closure.',
        details: [
          { k: 'Cutoff Time (Europe/London)', v: vCtx.cutoff_london || '—' },
          { k: 'Cutoff Timestamp (UTC)', v: vCtx.cutoff_utc || '—' },
          { k: 'Day Offset Rule', v: `D${cutoffDayOffset} (${cutoffTimeLondon} London)` },
        ],
      },
      {
        id: 'n3_vintages',
        step: '03',
        title: 'Eligible Forecast Vintages',
        metric: `${vCtx.eligible_vintages_count ?? 0} Eligible`,
        sub: `${vCtx.excluded_future_vintages_count ?? 0} Post-Cutoff Excluded`,
        rule: 'Retains all WINDFOR vintages where startTime == t and publishTime <= cutoff_utc; rejects publishTime > cutoff_utc.',
        provenance: 'Elexon BMRS WINDFOR Stream (/datasets/WINDFOR/stream)',
        warning: missingWarning,
        details: [
          { k: 'Total Vintages for Interval', v: `${vCtx.total_vintages_count ?? 0} publications` },
          { k: 'Qualified at Cutoff (<= Cutoff)', v: `${vCtx.eligible_vintages_count ?? 0} publications` },
          { k: 'Excluded Later Vintages (> Cutoff)', v: `${vCtx.excluded_future_vintages_count ?? 0} publications` },
        ],
      },
      {
        id: 'n4_selected',
        step: '04',
        title: 'Latest Eligible Forecast',
        metric: formatMw(forecastMw, 1),
        sub: selVintage
          ? `Pub: ${formatShortUtc(selVintage.publish_time_utc)} (${formatHours(
              selVintage.lead_time_hours
            )} lead)`
          : 'No Eligible Vintage',
        rule: 'selected_forecast = argmax_{publishTime}(eligible_vintages <= cutoff_utc).',
        provenance: 'Elexon BMRS WINDFOR Official Historical Publication',
        warning: missingWarning,
        details: [
          { k: 'Selected Forecast Power', v: formatMw(forecastMw, 1) },
          { k: 'Publication Timestamp (UTC)', v: selVintage?.publish_time_utc || '—' },
          { k: 'Publication Timestamp (London)', v: selVintage?.publish_time_london || '—' },
          { k: 'Lead Time Before Delivery', v: formatHours(selVintage?.lead_time_hours, 1) },
        ],
      },
      {
        id: 'n5_actual',
        step: '05',
        title: 'Actual Generation',
        metric: formatMw(actualMw, 1),
        sub: `HH(:00) ${formatMw(vCtx.actual_hh_00_mw, 0)} | HH(:30) ${formatMw(
          vCtx.actual_hh_30_mw,
          0
        )}`,
        rule: 'actual_hourly_mw = (actual_at_hour_start_mw + actual_at_half_hour_mw) / 2 [No interpolation of forecasts].',
        provenance: 'Elexon BMRS FUELHH Stream (fuelType = WIND)',
        warning: missingWarning,
        details: [
          { k: 'Aligned Hourly Actual (MW)', v: formatMw(actualMw, 1) },
          { k: 'Half-Hour :00 Reading (FUELHH)', v: formatMw(vCtx.actual_hh_00_mw, 1) },
          { k: 'Half-Hour :30 Reading (FUELHH)', v: formatMw(vCtx.actual_hh_30_mw, 1) },
          { k: 'Settlement Publish Timestamp', v: vCtx.actual_publish_utc || 'Verified' },
        ],
      },
      {
        id: 'n6_error',
        step: '06',
        title: 'Forecast Error',
        metric: formatSignedMw(errorMw, 1),
        sub: `${errorDir} (|Err|: ${formatMw(vCtx.abs_error_mw, 1)})`,
        rule: 'error_mw = forecast_mw - actual_hourly_mw (Positive = Overforecast, Negative = Underforecast).',
        provenance: 'WINDLINE Deterministic Evaluation Service',
        warning: missingWarning,
        details: [
          { k: 'Signed Error (Forecast − Actual)', v: formatSignedMw(errorMw, 1) },
          { k: 'Absolute Error Magnitude', v: formatMw(vCtx.abs_error_mw, 1) },
          { k: 'Status Classification', v: errorDir },
          { k: `Delivery Day (${dayMetrics.date}) MAE`, v: formatMw(dayMetrics.mae_mw, 1) },
          { k: 'January 2026 Full-Month MAE', v: formatMw(monthMetrics.mae_mw, 1) },
        ],
      },
      {
        id: 'n7_insight',
        step: '07',
        title: 'Procurement Insight',
        metric:
          errorMw !== null
            ? `${errorMw > 0 ? 'Overforecast' : 'Underforecast'} ${formatMw(
                Math.abs(errorMw),
                0
              )}`
            : 'Pending',
        sub: `Jan P90 Buffer: ${formatMw(
          summaryData?.error_percentiles_mw?.p90,
          0
        )}`,
        rule: 'Quantifies national wind forecast uncertainty at decision cutoff without fabricating company-specific demand or thermal plant schedules.',
        provenance: 'WINDLINE Risk & Quantile Engine (January 2026)',
        warning:
          'Does not claim to compute actual unmet consumer demand or thermal plant dispatch without external demand/supply data.',
        details: [
          {
            k: 'Interval National Wind Discrepancy',
            v:
              errorMw !== null
                ? `${formatSignedMw(errorMw, 1)} (${
                    errorMw > 0
                      ? 'National wind generated less than forecast'
                      : 'National wind generated more than forecast'
                  })`
                : '—',
          },
          {
            k: 'Jan 2026 P50 / P75 / P90 Error Quantiles',
            v: `${formatMw(summaryData?.error_percentiles_mw?.p50_median, 0)} / ${formatMw(
              summaryData?.error_percentiles_mw?.p75,
              0
            )} / ${formatMw(summaryData?.error_percentiles_mw?.p90, 0)}`,
          },
          {
            k: 'Jan 2026 Overforecast Frequency',
            v: `${formatPct(summaryData?.overforecast_pct, 1)} of hours`,
          },
        ],
      },
    ];
  }, [
    vCtx,
    selVintage,
    forecastMw,
    actualMw,
    errorMw,
    errorDir,
    dayMetrics,
    monthMetrics,
    summaryData,
    targetStartUtc,
    selectedDate,
    selectedHour,
    cutoffDayOffset,
    cutoffTimeLondon,
  ]);

  const activeNode =
    treeNodes.find((n) => n.id === selectedNodeId) || treeNodes[5];

  const chartSeries = vintages.map((v) => ({
    ...v,
    pubLabel: v.publish_time_london.slice(5, 16),
    eligibleMw: v.qualifies_at_cutoff ? v.forecast_mw : null,
    excludedMw: !v.qualifies_at_cutoff ? v.forecast_mw : null,
    selectedMw: v.is_selected ? v.forecast_mw : null,
  }));

  // Scale visual wind particle animation speed by historical actual MW (purely visual indicator)
  const streamDuration = actualMw ? Math.max(1.8, 5.5 - (actualMw / 18000) * 3.2) : 3.5;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#07111A',
        backgroundImage:
          'radial-gradient(rgba(52, 211, 153, 0.08) 1px, transparent 1px), linear-gradient(180deg, #07111A 0%, #0B1926 100%)',
        backgroundSize: '28px 28px, 100% 100%',
        color: '#ECFDF5',
        fontFamily: 'var(--font-sans)',
        paddingBottom: '3rem',
      }}
    >
      {/* Top Control Room Header Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 120,
          background: 'rgba(7, 17, 26, 0.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(52, 211, 153, 0.22)',
          padding: '0.75rem 1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: '1480px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onBackToDashboard}
              style={{
                background: '#10B981',
                color: '#051017',
                border: 'none',
                borderRadius: '6px',
                padding: '0.5rem 1rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ← Back to Dashboard
            </button>

            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: '#F8FAFC',
                }}
              >
                WINDLINE • NATIONAL WIND CONTROL ROOM DEMO
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: '#6EE7B7',
                  letterSpacing: '0.06em',
                }}
              >
                OFFICIAL ELEXON BMRS FUELHH &amp; WINDFOR • HISTORICAL DECISION TIME MACHINE
              </div>
            </div>
          </div>

          {/* 7. Live Clock vs Historical Data Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.14)',
                border: '1px solid rgba(245, 158, 11, 0.45)',
                borderRadius: '6px',
                padding: '0.35rem 0.75rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: '#FCD34D',
              }}
            >
              <strong>HISTORICAL DATASET:</strong> {selectedDate}{' '}
              {String(selectedHour).padStart(2, '0')}:00 (JAN 2026 REPLAY)
            </div>

            <div
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(52, 211, 153, 0.35)',
                borderRadius: '6px',
                padding: '0.35rem 0.75rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: '#A7F3D0',
              }}
            >
              <strong>LIVE UK CLOCK (EUROPE/LONDON):</strong> {liveLondonClock}
            </div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: '1480px', margin: '0 auto', padding: '1.25rem 1.5rem' }}>
        {/* 3. Historical Decision Time Machine Control Strip */}
        <section
          aria-label="Historical Decision Time Machine Controls"
          style={{
            background: 'rgba(15, 29, 44, 0.9)',
            border: '1px solid rgba(52, 211, 153, 0.28)',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: '#6EE7B7',
                fontWeight: 700,
              }}
            >
              TIME MACHINE (JAN 1–31, 2026):
            </span>

            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#94A3B8' }}>
              Delivery Date:{' '}
              <select
                aria-label="Demo Delivery Date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  background: '#07111A',
                  color: '#F8FAFC',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '0.32rem 0.55rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                }}
              >
                {JAN_2026_DATES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#94A3B8' }}>
              Delivery Hour:{' '}
              <select
                aria-label="Demo Delivery Hour"
                value={selectedHour}
                onChange={(e) => setSelectedHour(Number(e.target.value))}
                style={{
                  background: '#07111A',
                  color: '#F8FAFC',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '0.32rem 0.55rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                }}
              >
                {HOURS_OF_DAY.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#94A3B8' }}>
              Decision Cutoff (London):{' '}
              <select
                aria-label="Demo Cutoff Time"
                value={cutoffTimeLondon}
                onChange={(e) => setCutoffTimeLondon(e.target.value)}
                style={{
                  background: '#07111A',
                  color: '#F8FAFC',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '0.32rem 0.55rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                }}
              >
                <option value="06:00">06:00 London</option>
                <option value="09:00">09:00 London</option>
                <option value="11:00">11:00 London (Default D-1 Assumption)</option>
                <option value="12:00">12:00 London</option>
                <option value="15:00">15:00 London</option>
                <option value="18:00">18:00 London</option>
              </select>
            </label>

            <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#94A3B8' }}>
              Offset:{' '}
              <select
                aria-label="Demo Cutoff Day Offset"
                value={cutoffDayOffset}
                onChange={(e) => setCutoffDayOffset(Number(e.target.value))}
                style={{
                  background: '#07111A',
                  color: '#F8FAFC',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '0.32rem 0.55rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                }}
              >
                <option value={-1}>D-1 (Day Before)</option>
                <option value={-2}>D-2 (2 Days Before)</option>
                <option value={0}>D-0 (Same Day)</option>
              </select>
            </label>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: '#94A3B8',
            }}
          >
            Note: 11:00 Europe/London on D-1 is an explicit assignment assumption, not an official
            market rule.
          </div>
        </section>

        {loading && (
          <div
            role="status"
            style={{
              padding: '1.5rem',
              background: 'rgba(15, 29, 44, 0.85)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              borderRadius: '10px',
              marginBottom: '1.25rem',
              fontFamily: 'var(--font-mono)',
              color: '#6EE7B7',
            }}
          >
            Loading historical Elexon telemetry for {targetStartUtc}...
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              padding: '1.25rem',
              background: 'rgba(185, 28, 28, 0.2)',
              border: '1px solid #EF4444',
              borderRadius: '10px',
              marginBottom: '1.25rem',
              color: '#FCA5A5',
            }}
          >
            Error loading control room data: {error}
          </div>
        )}

        {!loading && !error && treeData && (
          <>
            {/* Top Telemetry Readout Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '0.9rem',
                marginBottom: '1.25rem',
              }}
            >
              {[
                {
                  label: 'HISTORICAL DELIVERY TIME',
                  value: vCtx.target_start_london,
                  sub: `Cutoff Gate: ${vCtx.cutoff_london}`,
                  accent: '#34D399',
                },
                {
                  label: 'LATEST ELIGIBLE FORECAST (<= CUTOFF)',
                  value: formatMw(forecastMw, 1),
                  sub: selVintage
                    ? `Pub: ${selVintage.publish_time_london} (${formatHours(
                        selVintage.lead_time_hours
                      )} lead)`
                    : 'Missing Forecast',
                  accent: '#10B981',
                },
                {
                  label: 'ALIGNED ACTUAL WIND (FUELHH)',
                  value: formatMw(actualMw, 1),
                  sub: `HH(:00) ${formatMw(vCtx.actual_hh_00_mw, 0)} | HH(:30) ${formatMw(
                    vCtx.actual_hh_30_mw,
                    0
                  )}`,
                  accent: '#F8FAFC',
                },
                {
                  label: 'FORECAST ERROR (FCST − ACTUAL)',
                  value: formatSignedMw(errorMw, 1),
                  sub: `${errorDir} • ${vCtx.eligible_vintages_count} eligible / ${vCtx.excluded_future_vintages_count} excluded`,
                  accent: (errorMw || 0) >= 0 ? '#FBBF24' : '#F87171',
                },
              ].map((card) => (
                <div
                  key={card.label}
                  style={{
                    background: 'rgba(15, 29, 44, 0.92)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '8px',
                    padding: '1rem 1.15rem',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      color: '#94A3B8',
                      marginBottom: '0.35rem',
                    }}
                  >
                    {card.label}
                  </div>
                  <div
                    className="tabular-nums"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1.45rem',
                      fontWeight: 700,
                      color: card.accent,
                    }}
                  >
                    {card.value}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      color: '#CBD5E1',
                      marginTop: '0.35rem',
                    }}
                  >
                    {card.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Middle Split: Illustrative UK National Wind Map + Forecast vs Actual Vintage Chart */}
            <div className="grid-sidebar-right" style={{ marginBottom: '1.25rem' }}>
              {/* Left: Forecast vs Actual & Vintage Cutoff Chart */}
              <div
                style={{
                  background: 'rgba(15, 29, 44, 0.92)',
                  border: '1px solid rgba(52, 211, 153, 0.24)',
                  borderRadius: '10px',
                  padding: '1.15rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    marginBottom: '0.85rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.7rem',
                        color: '#34D399',
                        letterSpacing: '0.06em',
                      }}
                    >
                      HISTORICAL VINTAGE REPLAY • {vCtx.target_start_london}
                    </div>
                    <h2
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.15rem',
                        color: '#F8FAFC',
                        marginTop: '0.2rem',
                      }}
                    >
                      Eligible Forecast Publications vs. Excluded Post-Cutoff Vintages &amp; Actual
                      Generation
                    </h2>
                  </div>

                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: 'rgba(16, 185, 129, 0.2)',
                        border: '1px solid #10B981',
                        color: '#6EE7B7',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                      }}
                    >
                      ELIGIBLE (&lt;= CUTOFF): {vCtx.eligible_vintages_count}
                    </span>
                    <span
                      style={{
                        background: 'rgba(148, 163, 184, 0.15)',
                        border: '1px dashed #64748B',
                        color: '#94A3B8',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                      }}
                    >
                      EXCLUDED (&gt; CUTOFF): {vCtx.excluded_future_vintages_count}
                    </span>
                  </div>
                </div>

                <div style={{ width: '100%', height: 295 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartSeries}
                      margin={{ top: 24, right: 28, left: 16, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                      <XAxis
                        dataKey="pubLabel"
                        tickMargin={8}
                        tick={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', fill: '#94A3B8' }}
                      />
                      <YAxis
                        width={80}
                        domain={[
                          (dataMin) => Math.floor(dataMin * 0.94),
                          (dataMax) => Math.ceil(dataMax * 1.04),
                        ]}
                        tick={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', fill: '#94A3B8' }}
                        tickFormatter={(v) => `${Number(v).toLocaleString('en-GB')} MW`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#07111A',
                          borderColor: '#10B981',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          color: '#F8FAFC',
                        }}
                        formatter={(val, name) => [
                          val !== null ? `${Number(val).toLocaleString('en-GB')} MW` : '—',
                          name,
                        ]}
                        labelFormatter={(_, payload) => {
                          const v = payload?.[0]?.payload;
                          if (!v) return '';
                          return `Published: ${v.publish_time_london} (${v.lead_time_hours}h lead) • ${v.status_label}`;
                        }}
                      />
                      {actualMw !== null && (
                        <ReferenceLine
                          y={actualMw}
                          stroke="#38BDF8"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          label={{
                            value: `Actual Generation: ${formatMw(actualMw, 0)}`,
                            fill: '#38BDF8',
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)',
                            position: 'insideTopRight',
                          }}
                        />
                      )}
                      {selVintage && (
                        <ReferenceLine
                          x={selVintage.publish_time_london.slice(5, 16)}
                          stroke="#10B981"
                          strokeWidth={2}
                          label={{
                            value: `Decision Cutoff (${vCtx.cutoff_london})`,
                            fill: '#10B981',
                            fontSize: 10.5,
                            fontFamily: 'var(--font-mono)',
                            position: 'top',
                          }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="eligibleMw"
                        name="Eligible Forecast (<= Cutoff)"
                        stroke="#10B981"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#10B981' }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="excludedMw"
                        name="Excluded Future Vintage (> Cutoff)"
                        stroke="#64748B"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 3.5, fill: '#64748B' }}
                        connectNulls
                      />
                      <Scatter
                        dataKey="selectedMw"
                        name="Selected Forecast at Cutoff"
                        fill="#A7F3D0"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right: Illustrative UK National Wind Corridor Visualization */}
              <div
                style={{
                  background: 'rgba(15, 29, 44, 0.92)',
                  border: '1px solid rgba(52, 211, 153, 0.24)',
                  borderRadius: '10px',
                  padding: '1.15rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.4rem',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                        color: '#FCD34D',
                        fontWeight: 700,
                      }}
                    >
                      ILLUSTRATIVE NATIONAL WIND VISUALIZATION (VISUAL EFFECT)
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '0.76rem',
                      color: '#94A3B8',
                      marginBottom: '0.6rem',
                      lineHeight: 1.45,
                    }}
                  >
                    Elexon <code>FUELHH</code> &amp; <code>WINDFOR</code> provide aggregated UK
                    national wind generation only—not individual wind-farm telemetry.
                  </p>
                </div>

                <svg
                  viewBox="0 0 380 250"
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  role="img"
                  aria-label="Illustrative UK and North Sea national wind flow diagram"
                >
                  <rect width="380" height="250" rx="8" fill="#050D15" />

                  {/* Animated Wind Streamlines across UK / North Sea */}
                  {[42, 84, 126, 168, 210].map((yPos, i) => (
                    <motion.path
                      key={yPos}
                      d={`M 12 ${yPos} C 95 ${yPos - 16}, 190 ${yPos + 16}, 285 ${
                        yPos - 10
                      } S 345 ${yPos + 8}, 368 ${yPos}`}
                      fill="none"
                      stroke={
                        i % 2 === 0
                          ? 'rgba(52, 211, 153, 0.35)'
                          : 'rgba(56, 189, 248, 0.22)'
                      }
                      strokeWidth="2"
                      strokeDasharray="10 8"
                      initial={{ strokeDashoffset: 72 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{
                        duration: streamDuration + i * 0.25,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />
                  ))}

                  {/* Stylized Great Britain Outline Silhouette */}
                  <path
                    d="M 155 28 L 185 32 L 195 62 L 182 88 L 204 118 L 218 158 L 232 188 L 215 212 L 160 222 L 138 202 L 152 172 L 136 142 L 148 105 L 135 70 Z"
                    fill="rgba(16, 185, 129, 0.14)"
                    stroke="#10B981"
                    strokeWidth="1.75"
                  />

                  {/* Illustrative National Aggregation Readout Overlay */}
                  <rect
                    x="220"
                    y="24"
                    width="146"
                    height="92"
                    rx="6"
                    fill="rgba(7, 17, 26, 0.88)"
                    stroke="rgba(52, 211, 153, 0.4)"
                  />
                  <text
                    x="230"
                    y="43"
                    fill="#94A3B8"
                    fontFamily="var(--font-mono)"
                    fontSize="8.5"
                  >
                    NATIONAL AGGREGATE
                  </text>
                  <text
                    x="230"
                    y="64"
                    fill="#10B981"
                    fontFamily="var(--font-mono)"
                    fontSize="12"
                    fontWeight="700"
                  >
                    Fcst: {formatMw(forecastMw, 0)}
                  </text>
                  <text
                    x="230"
                    y="84"
                    fill="#38BDF8"
                    fontFamily="var(--font-mono)"
                    fontSize="12"
                    fontWeight="700"
                  >
                    Act: {formatMw(actualMw, 0)}
                  </text>
                  <text
                    x="230"
                    y="104"
                    fill={(errorMw || 0) >= 0 ? '#FBBF24' : '#F87171'}
                    fontFamily="var(--font-mono)"
                    fontSize="10.5"
                    fontWeight="700"
                  >
                    Err: {formatSignedMw(errorMw, 0)}
                  </text>
                </svg>
              </div>
            </div>

            {/* 5. Connected 7-Node Interactive Energy Intelligence Tree */}
            <section
              aria-label="Interactive Energy Intelligence Tree"
              style={{
                background: 'rgba(15, 29, 44, 0.92)',
                border: '1px solid rgba(52, 211, 153, 0.28)',
                borderRadius: '10px',
                padding: '1.25rem',
                marginBottom: '1.25rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      color: '#34D399',
                      letterSpacing: '0.06em',
                    }}
                  >
                    7-STAGE CONNECTED ENERGY INTELLIGENCE TREE • CLICK ANY NODE TO INSPECT
                  </span>
                  <h2
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.2rem',
                      color: '#F8FAFC',
                      marginTop: '0.2rem',
                    }}
                  >
                    Delivery Hour → Decision Cutoff → Eligible Vintages → Latest Forecast → Actual →
                    Error → Procurement Insight
                  </h2>
                </div>
              </div>

              {/* 7-Node Connected SVG Chain */}
              <div style={{ width: '100%', overflowX: 'auto', marginBottom: '1rem' }}>
                <svg
                  viewBox="0 0 1360 155"
                  style={{ width: '100%', minWidth: '980px', height: 'auto', display: 'block' }}
                  role="tree"
                  aria-label="7-node decision intelligence tree"
                >
                  <line
                    x1="90"
                    y1="76"
                    x2="1270"
                    y2="76"
                    stroke="rgba(52, 211, 153, 0.28)"
                    strokeWidth="3"
                  />
                  <motion.line
                    x1="90"
                    y1="76"
                    x2="1270"
                    y2="76"
                    stroke="#10B981"
                    strokeWidth="3"
                    strokeDasharray="8 6"
                    initial={{ strokeDashoffset: 56 }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
                  />

                  {treeNodes.map((node, idx) => {
                    const x = 14 + idx * 192;
                    const isSelected = node.id === selectedNodeId;
                    return (
                      <g
                        key={node.id}
                        role="treeitem"
                        aria-selected={isSelected}
                        tabIndex={0}
                        style={{ cursor: 'pointer', outline: 'none' }}
                        onClick={() => setSelectedNodeId(node.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedNodeId(node.id);
                          }
                        }}
                      >
                        <rect
                          x={x}
                          y={16}
                          width="176"
                          height="120"
                          rx="8"
                          fill={isSelected ? '#064E3B' : '#0B1926'}
                          stroke={isSelected ? '#34D399' : '#334155'}
                          strokeWidth={isSelected ? '2.5' : '1.25'}
                        />
                        <text
                          x={x + 12}
                          y={36}
                          fill="#6EE7B7"
                          fontFamily="var(--font-mono)"
                          fontSize="9.5"
                          fontWeight="700"
                        >
                          STEP {node.step}
                        </text>
                        <text
                          x={x + 12}
                          y={55}
                          fill="#F8FAFC"
                          fontFamily="var(--font-sans)"
                          fontSize="11.5"
                          fontWeight="700"
                        >
                          {node.title}
                        </text>
                        <text
                          x={x + 12}
                          y={84}
                          fill={isSelected ? '#A7F3D0' : '#38BDF8'}
                          fontFamily="var(--font-mono)"
                          fontSize="12.5"
                          fontWeight="700"
                        >
                          {String(node.metric).length > 21
                            ? `${String(node.metric).slice(0, 20)}…`
                            : node.metric}
                        </text>
                        <text
                          x={x + 12}
                          y={112}
                          fill="#94A3B8"
                          fontFamily="var(--font-mono)"
                          fontSize="9.2"
                        >
                          {String(node.sub).length > 25
                            ? `${String(node.sub).slice(0, 24)}…`
                            : node.sub}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Selected Node Inspector */}
              <div
                style={{
                  background: '#07111A',
                  border: '1px solid rgba(52, 211, 153, 0.35)',
                  borderRadius: '8px',
                  padding: '1rem 1.25rem',
                }}
              >
                <div className="grid-2col" style={{ alignItems: 'start' }}>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        color: '#34D399',
                        fontWeight: 700,
                      }}
                    >
                      NODE {activeNode.step} INSPECTOR • {activeNode.title.toUpperCase()}
                    </div>
                    <div
                      className="tabular-nums"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '1.4rem',
                        fontWeight: 700,
                        color: '#F8FAFC',
                        margin: '0.35rem 0',
                      }}
                    >
                      {activeNode.metric}
                    </div>
                    <p
                      style={{
                        fontSize: '0.84rem',
                        color: '#CBD5E1',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <strong>Selection / Calculation Rule:</strong> {activeNode.rule}
                    </p>
                    <p
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        color: '#6EE7B7',
                        marginBottom: '0.35rem',
                      }}
                    >
                      <strong>Data Provenance:</strong> {activeNode.provenance}
                    </p>
                    <p
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.74rem',
                        color: '#FCD34D',
                      }}
                    >
                      <strong>Data Quality / Scope Note:</strong> {activeNode.warning}
                    </p>
                  </div>

                  <div
                    style={{
                      background: 'rgba(15, 29, 44, 0.9)',
                      border: '1px solid #1E293B',
                      borderRadius: '6px',
                      padding: '0.75rem 1rem',
                    }}
                  >
                    {activeNode.details.map((row) => (
                      <div
                        key={row.k}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '1rem',
                          padding: '0.4rem 0',
                          borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.78rem',
                        }}
                      >
                        <span style={{ color: '#94A3B8' }}>{row.k}</span>
                        <span style={{ color: '#F8FAFC', fontWeight: 600 }}>{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* 6. Procurement Risk Insights & Quantile Generation-Level Breakdown */}
            <section
              aria-label="Procurement Risk Insights"
              className="grid-2col"
            >
              <div
                style={{
                  background: 'rgba(15, 29, 44, 0.92)',
                  border: '1px solid rgba(52, 211, 153, 0.24)',
                  borderRadius: '10px',
                  padding: '1.15rem',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    color: '#34D399',
                  }}
                >
                  PROCUREMENT RISK INSIGHTS • JANUARY 2026 QUANTILES
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.15rem',
                    color: '#F8FAFC',
                    margin: '0.25rem 0 0.75rem',
                  }}
                >
                  How Forecast Uncertainty Affects Day-Ahead Planning
                </h3>
                <p style={{ fontSize: '0.84rem', color: '#CBD5E1', marginBottom: '0.85rem' }}>
                  Across January 2026 ({summaryData?.valid_paired_count || 744} paired hours),
                  Elexon forecasts at the {cutoffTimeLondon} D{cutoffDayOffset} cutoff overestimated
                  wind generation in{' '}
                  <strong>{formatPct(summaryData?.overforecast_pct, 1)}</strong> of hours (Mean
                  Bias: <strong>{formatSignedMw(summaryData?.mean_bias_mw, 1)}</strong>, MAE:{' '}
                  <strong>{formatMw(summaryData?.mae_mw, 1)}</strong>).
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '0.65rem',
                    marginBottom: '0.85rem',
                  }}
                >
                  {[
                    {
                      label: 'P50 Median Error',
                      val: formatSignedMw(summaryData?.error_percentiles_mw?.p50_median, 0),
                    },
                    {
                      label: 'P75 Error Quantile',
                      val: formatSignedMw(summaryData?.error_percentiles_mw?.p75, 0),
                    },
                    {
                      label: 'P90 Error Quantile',
                      val: formatSignedMw(summaryData?.error_percentiles_mw?.p90, 0),
                    },
                  ].map((q) => (
                    <div
                      key={q.label}
                      style={{
                        background: '#07111A',
                        border: '1px solid #1E293B',
                        borderRadius: '6px',
                        padding: '0.65rem',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{q.label}</div>
                      <div
                        style={{
                          fontSize: '1.05rem',
                          fontWeight: 700,
                          color: '#FCD34D',
                          marginTop: '0.2rem',
                        }}
                      >
                        {q.val}
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '0.76rem', color: '#94A3B8' }}>
                  <strong>Boundary Note:</strong> Official Elexon datasets do not include utility
                  customer demand, thermal plant capacity, or battery storage; these quantiles
                  measure national wind forecast uncertainty only.
                </p>
              </div>

              <div
                style={{
                  background: 'rgba(15, 29, 44, 0.92)',
                  border: '1px solid rgba(52, 211, 153, 0.24)',
                  borderRadius: '10px',
                  padding: '1.15rem',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    color: '#34D399',
                  }}
                >
                  ACCURACY BY GENERATION LEVEL • EMPIRICAL QUANTILE REGIMES (P33 &amp; P67)
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.15rem',
                    color: '#F8FAFC',
                    margin: '0.25rem 0 0.75rem',
                  }}
                >
                  Forecast Error Across Low, Medium &amp; High Wind Output
                </h3>

                <div className="data-table-wrap">
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', color: '#94A3B8' }}>
                        <th style={{ textAlign: 'left', padding: '0.45rem' }}>Regime</th>
                        <th style={{ textAlign: 'left', padding: '0.45rem' }}>Quantile Range</th>
                        <th style={{ textAlign: 'right', padding: '0.45rem' }}>MAE</th>
                        <th style={{ textAlign: 'right', padding: '0.45rem' }}>Bias</th>
                        <th style={{ textAlign: 'right', padding: '0.45rem' }}>P90 Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summaryData?.generation_level_buckets || []).map((b) => (
                        <tr
                          key={b.bucket_id}
                          style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.12)' }}
                        >
                          <td style={{ padding: '0.5rem 0.45rem', color: '#F8FAFC' }}>
                            {b.bucket_label.split('(')[0].trim()}
                          </td>
                          <td style={{ padding: '0.5rem 0.45rem', color: '#94A3B8' }}>
                            {b.quantile_range_label}
                          </td>
                          <td
                            style={{
                              padding: '0.5rem 0.45rem',
                              textAlign: 'right',
                              color: '#34D399',
                              fontWeight: 700,
                            }}
                          >
                            {formatMw(b.mae_mw, 0)}
                          </td>
                          <td
                            style={{
                              padding: '0.5rem 0.45rem',
                              textAlign: 'right',
                              color: '#FCD34D',
                            }}
                          >
                            {formatSignedMw(b.mean_bias_mw, 0)}
                          </td>
                          <td
                            style={{
                              padding: '0.5rem 0.45rem',
                              textAlign: 'right',
                              color: '#F8FAFC',
                            }}
                          >
                            {formatSignedMw(b.p90_signed_error_mw, 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
