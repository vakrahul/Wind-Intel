import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { apiClient } from '../services/apiClient';
import {
  formatHours,
  formatMw,
  formatPct,
  formatSignedMw,
} from '../utils/formatters';

export function LandingPage({
  healthData,
  cutoffTimeLondon,
  setCutoffTimeLondon,
  onOpenWorkspace,
}) {
  const [heroVintages, setHeroVintages] = useState(null);
  const [heroSummary, setHeroSummary] = useState(null);
  const [sampleHour, setSampleHour] = useState(17);

  useEffect(() => {
    let active = true;
    const hStr = String(sampleHour).padStart(2, '0');
    Promise.all([
      apiClient.getForecastVintages({
        targetStartUtc: `2026-01-15T${hStr}:00:00Z`,
        cutoffTimeLondon,
        cutoffDayOffset: -1,
      }),
      apiClient.getMetricsSummary({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        cutoffTimeLondon,
        cutoffDayOffset: -1,
      }),
    ])
      .then(([vRes, sRes]) => {
        if (active) {
          setHeroVintages(vRes);
          setHeroSummary(sRes);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [cutoffTimeLondon, sampleHour]);

  const selVintage = heroVintages?.selected_vintage;
  const allVintages = heroVintages?.vintages || [];

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.5rem 1.5rem 4rem' }}>
      {/* Hero Section */}
      <div
        className="editorial-panel"
        style={{
          background:
            'linear-gradient(135deg, #FFFFFF 0%, #FAF8F3 52%, #EBF4E7 100%)',
          border: '1px solid var(--border-strong)',
          padding: '2.5rem 2.25rem',
          marginBottom: '2rem',
        }}
      >
        <div className="grid-sidebar-right" style={{ alignItems: 'center', gap: '2rem' }}>
          {/* Left Column: Simple Headline & Buttons */}
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.35rem 0.85rem',
                background: 'var(--bg-pistachio-tint)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-pill)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--accent-emerald)',
                marginBottom: '1.1rem',
              }}
            >
              <span className="status-dot" />
              {healthData?.january_2026_ready
                ? `OFFICIAL UK ELEXON DATA READY • ${healthData.cached_hourly_actuals_jan2026} JAN 2026 HOURS LOADED`
                : 'LOADING ELEXON DATA...'}
            </div>

            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(2.1rem, 3.6vw, 3.1rem)',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.025em',
                color: 'var(--text-primary)',
                marginBottom: '1rem',
              }}
            >
              Know Your Wind Power Forecast &amp; Backup Needs Before Buying Tomorrow&apos;s Electricity.
            </h1>

            <p
              style={{
                fontSize: '1rem',
                color: 'var(--text-secondary)',
                maxWidth: '62ch',
                lineHeight: 1.6,
                marginBottom: '1.5rem',
              }}
            >
              Every day by <strong className="tabular-nums">{cutoffTimeLondon} London time</strong>,
              UK power buyers must decide how much electricity to buy for tomorrow.{' '}
              <strong>WINDLINE</strong> shows the exact wind forecast available before that
              deadline, compares it with the actual wind that showed up, and calculates how much
              backup power you need so you never run short.
            </p>

            {/* Primary CTA Buttons */}
            <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', marginBottom: '1.75rem' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => onOpenWorkspace('overview')}
                style={{ padding: '0.8rem 1.45rem', fontSize: '0.92rem' }}
              >
                Open January 2026 Overview →
              </button>
              <button
                type="button"
                className="btn-pistachio"
                onClick={() => onOpenWorkspace('tree')}
                style={{ padding: '0.8rem 1.35rem', fontSize: '0.92rem' }}
              >
                Open Interactive Decision Tree &amp; Calculator
              </button>
            </div>

            {/* Live Grounded KPI Micro-Strip */}
            {heroSummary && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                  gap: '0.75rem',
                  paddingTop: '1.15rem',
                  borderTop: '1px solid var(--border-hairline)',
                }}
              >
                <div>
                  <div className="kpi-label">Average Miss (MAE)</div>
                  <div className="tabular-nums" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                    {formatMw(heroSummary.mae_mw, 0)}
                  </div>
                </div>
                <div>
                  <div className="kpi-label">Root Mean Sq Error</div>
                  <div className="tabular-nums" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                    {formatMw(heroSummary.rmse_mw, 0)}
                  </div>
                </div>
                <div>
                  <div className="kpi-label">Average Bias (Fcst − Act)</div>
                  <div
                    className="tabular-nums"
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: 700,
                      color:
                        heroSummary.mean_bias_mw > 0
                          ? 'var(--status-amber)'
                          : 'var(--status-crimson)',
                    }}
                  >
                    {formatSignedMw(heroSummary.mean_bias_mw, 0)}
                  </div>
                </div>
                <div>
                  <div className="kpi-label">Jan 2026 Data Complete</div>
                  <div
                    className="tabular-nums"
                    style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-emerald)' }}
                  >
                    {formatPct(heroSummary.coverage_pct, 1)} ({heroSummary.valid_paired_count}h)
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Animated 2D SVG Wind & Deadline Preview */}
          <div
            style={{
              background: 'var(--bg-pine-deep)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.35rem',
              color: 'var(--text-on-pine)',
              boxShadow: 'var(--shadow-elevated)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  color: 'var(--text-pistachio-on-pine)',
                  letterSpacing: '0.06em',
                }}
              >
                SAMPLE HOUR PREVIEW • JAN 15, 2026 AT {String(sampleHour).padStart(2, '0')}:00
              </span>

              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {['06:00', '11:00', '15:00', '18:00'].map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => setCutoffTimeLondon(ct)}
                    style={{
                      background:
                        cutoffTimeLondon === ct ? '#76BE64' : 'rgba(255,255,255,0.1)',
                      color: cutoffTimeLondon === ct ? '#11261A' : '#FAF8F3',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '0.2rem 0.45rem',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    D-1 {ct}
                  </button>
                ))}
              </div>
            </div>

            <svg
              viewBox="0 0 520 270"
              style={{ width: '100%', height: 'auto', display: 'block' }}
              role="img"
              aria-label="Animated wind field and forecast deadline gate"
            >
              {[38, 76, 114, 152].map((yPos, idx) => (
                <motion.path
                  key={yPos}
                  d={`M 10 ${yPos} C 140 ${yPos - 18}, 260 ${yPos + 18}, 390 ${yPos - 8} S 470 ${
                    yPos + 10
                  }, 510 ${yPos}`}
                  fill="none"
                  stroke={idx % 2 === 0 ? 'rgba(158, 224, 140, 0.22)' : 'rgba(250, 248, 243, 0.12)'}
                  strokeWidth="1.75"
                  strokeDasharray="12 8"
                  initial={{ strokeDashoffset: 80 }}
                  animate={{ strokeDashoffset: 0 }}
                  transition={{
                    duration: 4 + idx * 0.6,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
              ))}

              {/* Deadline Vertical Line */}
              <line
                x1="310"
                y1="20"
                x2="310"
                y2="195"
                stroke="#8BD477"
                strokeWidth="2"
                strokeDasharray="5 4"
              />
              <rect x="215" y="14" width="190" height="20" rx="4" fill="#237A4B" />
              <text
                x="310"
                y="28"
                textAnchor="middle"
                fill="#FAF8F3"
                fontFamily="var(--font-mono)"
                fontSize="9.5"
                fontWeight="600"
              >
                DEADLINE: D-1 {cutoffTimeLondon} LONDON
              </text>

              <line x1="24" y1="195" x2="496" y2="195" stroke="rgba(255,255,255,0.25)" />

              {allVintages.slice(-8).map((v, i, arr) => {
                const x = 42 + (i / Math.max(arr.length - 1, 1)) * 390;
                const minMw = Math.min(...arr.map((a) => a.forecast_mw), heroVintages?.actual_hourly_mw || 10000);
                const maxMw = Math.max(...arr.map((a) => a.forecast_mw), heroVintages?.actual_hourly_mw || 20000);
                const span = Math.max(maxMw - minMw, 500);
                const y = 165 - ((v.forecast_mw - minMw) / span) * 105;

                return (
                  <g key={v.publish_time_utc}>
                    <circle
                      cx={x}
                      cy={y}
                      r={v.is_selected ? 7 : 4.5}
                      fill={
                        v.is_selected
                          ? '#8BD477'
                          : v.qualifies_at_cutoff
                          ? '#5EA876'
                          : '#64748B'
                      }
                      stroke={v.is_selected ? '#FAF8F3' : 'none'}
                      strokeWidth="2"
                    />
                    <text
                      x={x}
                      y={212}
                      textAnchor="middle"
                      fill={v.qualifies_at_cutoff ? '#D7EBCD' : '#94A3B8'}
                      fontFamily="var(--font-mono)"
                      fontSize="8.5"
                    >
                      {v.publish_time_utc.slice(11, 16)}
                    </text>
                  </g>
                );
              })}

              <rect
                x="16"
                y="224"
                width="488"
                height="36"
                rx="6"
                fill="rgba(255, 255, 255, 0.07)"
              />
              <text
                x="28"
                y="246"
                fill="#9EE08C"
                fontFamily="var(--font-mono)"
                fontSize="10.5"
                fontWeight="600"
              >
                Forecast: {formatMw(selVintage?.forecast_mw, 0)} ({formatHours(selVintage?.lead_time_hours, 1)} early)
              </text>
              <text
                x="260"
                y="246"
                fill="#FAF8F3"
                fontFamily="var(--font-mono)"
                fontSize="10.5"
              >
                Actual: {formatMw(heroVintages?.actual_hourly_mw, 0)}
              </text>
              <text
                x="395"
                y="246"
                fill={(heroVintages?.error_mw || 0) >= 0 ? '#FBBF24' : '#F87171'}
                fontFamily="var(--font-mono)"
                fontSize="10.5"
                fontWeight="700"
              >
                Diff: {formatSignedMw(heroVintages?.error_mw, 0)}
              </text>
            </svg>

            <div
              style={{
                marginTop: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
              }}
            >
              <span>CHANGE HOUR ({String(sampleHour).padStart(2, '0')}:00):</span>
              <input
                aria-label="Sample Delivery Hour Scrubber"
                type="range"
                min="0"
                max="23"
                value={sampleHour}
                onChange={(e) => setSampleHour(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#8BD477' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3 Simple Steps Strip */}
      <div className="editorial-panel pistachio-panel" style={{ marginBottom: '2rem' }}>
        <div className="panel-header">
          <div>
            <span className="section-eyebrow">HOW THIS PLATFORM WORKS</span>
            <h2 className="panel-title">
              3 Simple Steps from Elexon Data to Your Buying Decision
            </h2>
          </div>
          <span className="badge badge-official">NO FUTURE DATA LEAKAGE</span>
        </div>

        <div className="grid-3col">
          <div
            style={{
              background: 'var(--bg-paper)',
              padding: '1.15rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-hairline)',
            }}
          >
            <div className="section-eyebrow">STEP 01 • GET FORECAST UPDATES</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.4rem' }}>
              Download All Elexon Wind Forecasts
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Elexon releases updated wind forecasts every few hours. We collect all forecast
              updates published in late December 2025 and January 2026.
            </p>
          </div>

          <div
            style={{
              background: 'var(--bg-paper)',
              padding: '1.15rem',
              borderRadius: 'var(--radius-sm)',
              border: '2px solid var(--accent-emerald)',
            }}
          >
            <div className="section-eyebrow">STEP 02 • APPLY BUYING DEADLINE</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.4rem' }}>
              Pick Latest Forecast Before {cutoffTimeLondon} (D-1)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              For each hour tomorrow, we pick the latest forecast published at or before{' '}
              <strong>{cutoffTimeLondon} today</strong>. Any forecast published after the deadline
              is blocked so we never cheat with future data.
            </p>
          </div>

          <div
            style={{
              background: 'var(--bg-paper)',
              padding: '1.15rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-hairline)',
            }}
          >
            <div className="section-eyebrow">STEP 03 • COMPARE WITH ACTUAL WIND</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.4rem' }}>
              Measure Error &amp; Backup Power Needed
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              We average the two 30-minute actual wind readings in each hour and compare them to the
              forecast (<code className="tabular-nums">Error = Forecast − Actual</code>) so you know
              how much extra thermal power to buy.
            </p>
          </div>
        </div>
      </div>

      {/* 6 Modules Grid */}
      <div className="editorial-panel" style={{ marginBottom: '2rem' }}>
        <div className="panel-header">
          <div>
            <span className="section-eyebrow">ALL 6 APPLICATION PAGES</span>
            <h2 className="panel-title">Explore Each Tool in the Workspace</h2>
          </div>
        </div>

        <div className="grid-3col">
          {[
            {
              tab: 'overview',
              code: '01 / OVERVIEW',
              title: 'January 2026 Summary',
              desc: 'See full-month forecast vs. actual wind charts, average error numbers, and recommended backup power buffers.',
            },
            {
              tab: 'tree',
              code: '02 / INTELLIGENCE TREE',
              title: 'Decision Tree & Power Calculator',
              desc: 'Click through a 4-step visual tree for any single hour and calculate how much extra power your company needs to buy.',
            },
            {
              tab: 'timeline',
              code: '03 / FORECAST TIMELINE',
              title: 'Forecast Update History',
              desc: 'See all 24 forecast updates for a chosen hour—showing which one was used before the deadline and which later ones were blocked.',
            },
            {
              tab: 'accuracy',
              code: '04 / ACCURACY LAB',
              title: 'Error Charts & CSV Download',
              desc: 'View error distributions, daily error charts, 3h to 48h lead-time comparisons, and download the full CSV dataset.',
            },
            {
              tab: 'predictive',
              code: '05 / PREDICTIVE INSIGHTS',
              title: 'Model Comparison & Wind Trends',
              desc: 'Compare Official Elexon forecasts against simple math baselines and our experimental machine learning model.',
            },
            {
              tab: 'observatory',
              code: '06 / DATA OBSERVATORY',
              title: 'Data Proof & Record Counts',
              desc: 'Check live Elexon database counts, 31-day data completeness (100%), and official UK data source links.',
            },
          ].map((cap) => (
            <div
              key={cap.code}
              style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-sm)',
                padding: '1.15rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div className="section-eyebrow">{cap.code}</div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.12rem',
                    marginBottom: '0.4rem',
                  }}
                >
                  {cap.title}
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  {cap.desc}
                </p>
              </div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => onOpenWorkspace(cap.tab)}
                style={{ alignSelf: 'flex-start' }}
              >
                Open Page →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Data Sources & Notes */}
      <div className="grid-2col">
        <div className="editorial-panel">
          <div className="panel-header">
            <div>
              <span className="section-eyebrow">DATA SOURCES</span>
              <h3 className="panel-title">Where the Data Comes From</h3>
            </div>
          </div>
          <ul
            style={{
              listStyle: 'none',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              display: 'grid',
              gap: '0.65rem',
            }}
          >
            <li>
              <strong>Actual Wind Power (FUELHH):</strong> Official Elexon half-hourly wind
              generation (<code className="tabular-nums">fuelType = WIND</code>). Two 30-minute
              readings are averaged to get each hour&apos;s actual MW.
            </li>
            <li>
              <strong>Wind Forecasts (WINDFOR):</strong> Official Elexon hourly wind forecasts,
              including December 2025 updates needed for early January 2026 decisions.
            </li>
            <li>
              <strong>Timezones:</strong> Stored in <code className="tabular-nums">UTC</code> and
              displayed in <code className="tabular-nums">Europe/London</code> local time.
            </li>
          </ul>
        </div>

        <div className="editorial-panel">
          <div className="panel-header">
            <div>
              <span className="section-eyebrow">IMPORTANT NOTES</span>
              <h3 className="panel-title">Key Assumptions &amp; Scope</h3>
            </div>
          </div>
          <ul
            style={{
              listStyle: 'none',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              display: 'grid',
              gap: '0.65rem',
            }}
          >
            <li>
              <strong>Buying Deadline (11:00 AM D-1):</strong> Defaulted to 11:00 AM London time the
              day before delivery to represent the UK day-ahead market auction deadline.
            </li>
            <li>
              <strong>One-Month Scope:</strong> Covers all 744 hours of January 2026. One winter
              month does not represent all four seasons of the year.
            </li>
            <li>
              <strong>Separate Business Calculator:</strong> The scenario calculator on Page 02 uses
              user-entered demand numbers and never changes official Elexon accuracy scores.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
