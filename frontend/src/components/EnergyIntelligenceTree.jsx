import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  formatHours,
  formatMw,
  formatPct,
  formatShortUtc,
  formatSignedMw,
} from '../utils/formatters';

export function EnergyIntelligenceTree({ treeData, onOpenScenarioTab }) {
  const [selectedNodeId, setSelectedNodeId] = useState('l3_evaluation');
  const [zoomScale, setZoomScale] = useState(1.0);
  const [expandedLevels, setExpandedLevels] = useState({
    level2: true,
    level3: true,
    level4: true,
  });

  const vCtx = treeData?.interval_vintages || {};
  const dayMetrics = treeData?.day_metrics || {};
  const monthMetrics = treeData?.month_metrics || {};
  const decisionInterp = treeData?.decision_interpretation || {};
  const selVintage = vCtx.selected_vintage || null;

  const nodes = useMemo(() => {
    const forecastMw = selVintage ? selVintage.forecast_mw : null;
    const actualMw = vCtx.actual_hourly_mw ?? null;
    const errorMw = vCtx.error_mw ?? null;
    const errDir = vCtx.error_direction
      ? vCtx.error_direction.toUpperCase()
      : 'INCOMPLETE';

    return [
      {
        id: 'l1_overview',
        level: 1,
        parentId: null,
        code: 'LEVEL 01 / ROOT',
        title: 'Analysis Overview & Cutoff',
        badgeType: 'official',
        badgeText: 'JANUARY 2026 SCOPE',
        primaryMetric: `${vCtx.target_start_london || vCtx.target_start_utc || '—'}`,
        secondaryMetric: `Cutoff: ${vCtx.cutoff_london || '—'}`,
        tertiaryMetric: `Coverage: ${formatPct(monthMetrics.coverage_pct)} (${
          monthMetrics.valid_paired_count || 744
        }h)`,
        x: 24,
        y: 175,
        width: 242,
        height: 122,
        formula:
          'cutoff_utc = to_utc(delivery_date_london + cutoff_day_offset, cutoff_time_london)',
        source: 'Elexon BMRS FUELHH & WINDFOR Official Streams',
        details: [
          { label: 'Evaluation Period', value: 'January 2026 (2026-01-01 to 2026-01-31)' },
          { label: 'Target Delivery Interval (UTC)', value: vCtx.target_start_utc || '—' },
          { label: 'Target Delivery (Europe/London)', value: vCtx.target_start_london || '—' },
          { label: 'Configured Decision Cutoff (UTC)', value: vCtx.cutoff_utc || '—' },
          { label: 'Configured Cutoff (Europe/London)', value: vCtx.cutoff_london || '—' },
          {
            label: 'January 2026 Valid Paired Hours',
            value: `${monthMetrics.valid_paired_count || 0} / ${
              monthMetrics.total_target_hours || 744
            } hours (${formatPct(monthMetrics.coverage_pct)})`,
          },
        ],
        explanation:
          'Defines the target delivery hour and the D-1 decision deadline. Only forecast vintages published at or before the configured cutoff timestamp are eligible for selection.',
      },
      {
        id: 'l2_forecast',
        level: 2,
        parentId: 'l1_overview',
        code: 'LEVEL 02 / NODE A',
        title: 'Selected Elexon Wind Forecast',
        badgeType: 'official',
        badgeText: 'OFFICIAL WINDFOR (<= CUTOFF)',
        primaryMetric: formatMw(forecastMw, 1),
        secondaryMetric: selVintage
          ? `Pub: ${formatShortUtc(selVintage.publish_time_utc)}`
          : 'Missing Forecast',
        tertiaryMetric: selVintage
          ? `Lead: ${formatHours(selVintage.lead_time_hours)} | ${
              vCtx.eligible_vintages_count ?? 0
            } eligible`
          : '—',
        x: 312,
        y: 52,
        width: 248,
        height: 124,
        formula:
          'selected_forecast = argmax_{publishTime}(WINDFOR where startTime == t and publishTime <= cutoff_utc)',
        source: 'Elexon BMRS WINDFOR Dataset Stream',
        details: [
          { label: 'Selected Forecast Generation', value: formatMw(forecastMw, 1) },
          {
            label: 'Publication Timestamp (UTC)',
            value: selVintage?.publish_time_utc || '—',
          },
          {
            label: 'Publication Timestamp (London)',
            value: selVintage?.publish_time_london || '—',
          },
          {
            label: 'Forecast Lead Time Before Delivery',
            value: formatHours(selVintage?.lead_time_hours, 1),
          },
          {
            label: 'Eligible Vintages (<= Cutoff)',
            value: `${vCtx.eligible_vintages_count ?? 0} publications`,
          },
          {
            label: 'Excluded Future Vintages (> Cutoff)',
            value: `${vCtx.excluded_future_vintages_count ?? 0} publications rejected`,
          },
        ],
        explanation:
          'Represents the exact national wind generation forecast available to the utility procurement desk at the decision cutoff. Newer vintages published after the cutoff are strictly excluded.',
      },
      {
        id: 'l2_actual',
        level: 2,
        parentId: 'l1_overview',
        code: 'LEVEL 02 / NODE B',
        title: 'Actual Wind Generation',
        badgeType: 'observation',
        badgeText: 'OFFICIAL FUELHH ACTUAL',
        primaryMetric: formatMw(actualMw, 1),
        secondaryMetric: `HH(:00) ${formatMw(vCtx.actual_hh_00_mw, 0)}`,
        tertiaryMetric: `HH(:30) ${formatMw(vCtx.actual_hh_30_mw, 0)} (Averaged)`,
        x: 312,
        y: 296,
        width: 248,
        height: 124,
        formula: 'actual_hourly_mw = (actual_at_hour_start_mw + actual_at_half_hour_mw) / 2',
        source: 'Elexon BMRS FUELHH Stream (fuelType = WIND)',
        details: [
          { label: 'Aligned Hourly Actual Power', value: formatMw(actualMw, 1) },
          {
            label: 'Half-Hour :00 Settlement Actual',
            value: formatMw(vCtx.actual_hh_00_mw, 1),
          },
          {
            label: 'Half-Hour :30 Settlement Actual',
            value: formatMw(vCtx.actual_hh_30_mw, 1),
          },
          {
            label: 'Delivered Energy Over 1h Interval',
            value: actualMw !== null ? `${actualMw.toLocaleString('en-GB')} MWh` : '—',
          },
          {
            label: 'Telemetry Settlement Publish UTC',
            value: vCtx.actual_publish_utc || 'Verified Settlement Record',
          },
        ],
        explanation:
          'FUELHH reports actual wind output in 30-minute settlement periods, whereas WINDFOR forecasts are hourly. Both half-hourly observations are averaged without fabricating half-hourly forecasts.',
      },
      {
        id: 'l3_evaluation',
        level: 3,
        parentId: 'l2_forecast',
        code: 'LEVEL 03 / EVALUATION',
        title: 'Forecast Error & Accuracy',
        badgeType: errorMw > 0 ? 'over' : errorMw < 0 ? 'under' : 'official',
        badgeText: `${errDir} (${formatSignedMw(errorMw, 1)})`,
        primaryMetric: `Error: ${formatSignedMw(errorMw, 1)}`,
        secondaryMetric: `Day MAE: ${formatMw(dayMetrics.mae_mw, 0)}`,
        tertiaryMetric: `Jan MAE: ${formatMw(monthMetrics.mae_mw, 0)} | Bias: ${formatSignedMw(
          monthMetrics.mean_bias_mw,
          0
        )}`,
        x: 606,
        y: 175,
        width: 248,
        height: 124,
        formula: 'error_mw = forecast_mw - actual_hourly_mw (+ Overforecast, - Underforecast)',
        source: 'WINDLINE Deterministic Evaluation Service',
        details: [
          { label: 'Interval Error (forecast - actual)', value: formatSignedMw(errorMw, 1) },
          { label: 'Interval Absolute Error', value: formatMw(vCtx.abs_error_mw, 1) },
          { label: 'Classification', value: errDir },
          {
            label: `Delivery Day (${dayMetrics.date}) MAE / RMSE`,
            value: `${formatMw(dayMetrics.mae_mw, 1)} / ${formatMw(dayMetrics.rmse_mw, 1)}`,
          },
          {
            label: 'January 2026 Full-Month MAE / RMSE',
            value: `${formatMw(monthMetrics.mae_mw, 1)} / ${formatMw(
              monthMetrics.rmse_mw,
              1
            )}`,
          },
          {
            label: 'January 2026 Mean Bias',
            value: formatSignedMw(monthMetrics.mean_bias_mw, 1),
          },
        ],
        explanation:
          'Quantifies both the specific interval discrepancy (Forecast minus Actual) and the broader systematic error distribution across the delivery day and full January 2026 evaluation scope.',
      },
      {
        id: 'l4_decision',
        level: 4,
        parentId: 'l3_evaluation',
        code: 'LEVEL 04 / INTERPRETATION',
        title: 'Procurement Decision Impact',
        badgeType: 'official',
        badgeText: 'PLANNING IMPACT',
        primaryMetric:
          errorMw !== null
            ? `${errorMw > 0 ? 'Wind Deficit' : 'Wind Surplus'}: ${formatMw(
                Math.abs(errorMw),
                1
              )}`
            : 'Pending Pair',
        secondaryMetric:
          errorMw !== null
            ? `${errorMw > 0 ? 'Less wind than forecast' : 'More wind than forecast'}`
            : '—',
        tertiaryMetric: 'Open Scenario Calculator below ↓',
        x: 900,
        y: 175,
        width: 256,
        height: 124,
        formula:
          'wind_discrepancy_mw = actual_hourly_mw - forecast_mw = -error_mw (National Grid scale)',
        source: 'WINDLINE Decision Intelligence Engine',
        details: [
          {
            label: 'Forecast vs. Actual Wind Discrepancy',
            value:
              errorMw !== null
                ? `${formatSignedMw(
                    errorMw,
                    1
                  )} (${errorMw > 0 ? 'Less wind delivered than forecast' : 'More wind delivered than forecast'})`
                : '—',
          },
          {
            label: '1-Hour Energy Discrepancy',
            value:
              errorMw !== null
                ? `${Math.abs(errorMw).toLocaleString('en-GB', {
                    maximumFractionDigits: 1,
                  })} MWh (${(Math.abs(errorMw) * 1000).toLocaleString('en-GB', {
                    maximumFractionDigits: 0,
                  })} kWh)`
                : '—',
          },
          {
            label: 'Jan 2026 Overforecast / Underforecast Split',
            value: `${formatPct(monthMetrics.overforecast_pct)} Over / ${formatPct(
              monthMetrics.underforecast_pct
            )} Under`,
          },
          {
            label: 'Scope Boundary Limitation',
            value:
              'Actual utility procurement volume requires consumer demand & contracted supply inputs (available in Optional Scenario Simulator).',
          },
        ],
        explanation:
          decisionInterp.headline ||
          'Explains how the discrepancy between forecast and actual wind generation alters residual balancing exposure.',
      },
    ];
  }, [vCtx, dayMetrics, monthMetrics, decisionInterp, selVintage]);

  const visibleNodes = nodes.filter((n) => {
    if (n.level === 1) return true;
    if (n.level === 2) return expandedLevels.level2;
    if (n.level === 3) return expandedLevels.level2 && expandedLevels.level3;
    if (n.level === 4)
      return expandedLevels.level2 && expandedLevels.level3 && expandedLevels.level4;
    return true;
  });

  const selectedNode =
    nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  const toggleLevel = (lvlKey) => {
    setExpandedLevels((prev) => ({
      ...prev,
      [lvlKey]: !prev[lvlKey],
    }));
  };

  return (
    <div className="editorial-panel">
      <div className="panel-header">
        <div>
          <span className="section-eyebrow">
            INTERACTIVE 4-STEP DECISION TREE
          </span>
          <h3 className="panel-title">
            Step-by-Step Flow: From Wind Forecast to Buying Impact
          </h3>
          <p className="panel-subtitle">
            Click any of the 5 boxes below to view its numbers, formula, and explanation in the
            details panel underneath.
          </p>
        </div>

        {/* Progressive Disclosure Level Controls + Accessible Zoom/Fit Controls */}
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn-outline ${expandedLevels.level2 ? 'active' : ''}`}
            onClick={() => toggleLevel('level2')}
          >
            {expandedLevels.level2 ? '▾' : '▸'} Level 2: Wind Generation
          </button>
          <button
            type="button"
            className={`btn-outline ${expandedLevels.level3 ? 'active' : ''}`}
            onClick={() => toggleLevel('level3')}
            disabled={!expandedLevels.level2}
          >
            {expandedLevels.level3 ? '▾' : '▸'} Level 3: Forecast Evaluation
          </button>
          <button
            type="button"
            className={`btn-outline ${expandedLevels.level4 ? 'active' : ''}`}
            onClick={() => toggleLevel('level4')}
            disabled={!expandedLevels.level2 || !expandedLevels.level3}
          >
            {expandedLevels.level4 ? '▾' : '▸'} Level 4: Decision Impact
          </button>

          <div
            role="group"
            aria-label="Tree Zoom and Fit Controls"
            style={{
              display: 'inline-flex',
              gap: '0.25rem',
              marginLeft: '0.35rem',
              background: 'var(--bg-ivory)',
              padding: '0.2rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-hairline)',
            }}
          >
            <button
              type="button"
              className="btn-outline"
              aria-label="Zoom Out Tree"
              onClick={() => setZoomScale((z) => Math.max(0.85, Number((z - 0.1).toFixed(2))))}
              style={{ padding: '0.22rem 0.55rem' }}
            >
              −
            </button>
            <button
              type="button"
              className="btn-outline"
              aria-label="Fit Tree to Viewport"
              onClick={() => setZoomScale(1.0)}
              style={{ padding: '0.22rem 0.6rem' }}
            >
              Fit ({Math.round(zoomScale * 100)}%)
            </button>
            <button
              type="button"
              className="btn-outline"
              aria-label="Zoom In Tree"
              onClick={() => setZoomScale((z) => Math.min(1.3, Number((z + 0.1).toFixed(2))))}
              style={{ padding: '0.22rem 0.55rem' }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Top Full-Width Responsive SVG Tree Canvas (Fits 100% of Viewport Without Clipping) */}
      <div
        style={{
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-hairline)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem',
          marginBottom: '1.25rem',
          overflowX: zoomScale > 1.0 ? 'auto' : 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.round(zoomScale * 100)}%`,
            minWidth: '100%',
            transition: 'width 0.18s ease',
          }}
        >
          <svg
            viewBox="0 0 1180 450"
            style={{ width: '100%', height: 'auto', display: 'block' }}
            role="tree"
            aria-label="4-Level Energy Intelligence Tree"
          >
            <defs>
              <pattern
                id="treeDotGrid"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="1" fill="#C9D3C3" />
              </pattern>
            </defs>

            <rect x="0" y="0" width="1180" height="450" fill="url(#treeDotGrid)" rx="8" />

            {/* Column Level Guide Headers */}
            {[
              { x: 24, label: 'LEVEL 01 • OVERVIEW' },
              { x: 312, label: 'LEVEL 02 • WIND GENERATION' },
              { x: 606, label: 'LEVEL 03 • EVALUATION' },
              { x: 900, label: 'LEVEL 04 • DECISION IMPACT' },
            ].map((col) => (
              <text
                key={col.label}
                x={col.x}
                y={28}
                fill="#627568"
                fontFamily="var(--font-mono)"
                fontSize="10.5"
                fontWeight="600"
                letterSpacing="0.06em"
              >
                {col.label}
              </text>
            ))}

            {/* Animated Bezier Connections */}
            {expandedLevels.level2 && (
              <>
                {/* L1 -> L2 Forecast */}
                <path
                  d="M 266 236 C 289 236, 289 114, 312 114"
                  fill="none"
                  stroke="#1B5E3C"
                  strokeWidth="2.5"
                />
                <motion.path
                  d="M 266 236 C 289 236, 289 114, 312 114"
                  fill="none"
                  stroke="#8BD477"
                  strokeWidth="2.5"
                  strokeDasharray="6 6"
                  initial={{ strokeDashoffset: 24 }}
                  animate={{ strokeDashoffset: 0 }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                />

                {/* L1 -> L2 Actual */}
                <path
                  d="M 266 236 C 289 236, 289 358, 312 358"
                  fill="none"
                  stroke="#11261A"
                  strokeWidth="2.5"
                />
              </>
            )}

            {expandedLevels.level2 && expandedLevels.level3 && (
              <>
                {/* L2 Forecast -> L3 Evaluation */}
                <path
                  d="M 560 114 C 583 114, 583 236, 606 236"
                  fill="none"
                  stroke="#1B5E3C"
                  strokeWidth="2.5"
                />
                {/* L2 Actual -> L3 Evaluation */}
                <path
                  d="M 560 358 C 583 358, 583 236, 606 236"
                  fill="none"
                  stroke="#11261A"
                  strokeWidth="2.5"
                />
              </>
            )}

            {expandedLevels.level2 && expandedLevels.level3 && expandedLevels.level4 && (
              <>
                {/* L3 Evaluation -> L4 Decision */}
                <path
                  d="M 854 236 L 900 236"
                  fill="none"
                  stroke="#1B5E3C"
                  strokeWidth="3"
                />
                <motion.path
                  d="M 854 236 L 900 236"
                  fill="none"
                  stroke="#8BD477"
                  strokeWidth="3"
                  strokeDasharray="6 6"
                  initial={{ strokeDashoffset: 24 }}
                  animate={{ strokeDashoffset: 0 }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                />
              </>
            )}

            {/* Render Visible Tree Nodes */}
            {visibleNodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              const fillBg = isSelected
                ? '#11261A'
                : node.badgeType === 'observation'
                ? '#F3EFE6'
                : node.level === 4
                ? '#EBF4E7'
                : '#FFFFFF';
              const strokeCol = isSelected
                ? '#76BE64'
                : node.badgeType === 'over'
                ? '#C47416'
                : node.badgeType === 'under'
                ? '#B83A2A'
                : '#1B5E3C';

              return (
                <g
                  key={node.id}
                  className="svg-tree-node"
                  tabIndex={0}
                  role="treeitem"
                  aria-selected={isSelected}
                  aria-label={`${node.code} ${node.title}: ${node.primaryMetric}`}
                  onClick={() => setSelectedNodeId(node.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedNodeId(node.id);
                    }
                  }}
                >
                  <rect
                    className="node-box"
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx="10"
                    fill={fillBg}
                    stroke={strokeCol}
                    strokeWidth={isSelected ? '3' : '1.5'}
                  />

                  {/* Top Level Tag */}
                  <text
                    x={node.x + 14}
                    y={node.y + 22}
                    fill={isSelected ? '#9EE08C' : '#1B5E3C'}
                    fontFamily="var(--font-mono)"
                    fontSize="9.5"
                    fontWeight="600"
                  >
                    {node.code}
                  </text>

                  {/* Node Title */}
                  <text
                    x={node.x + 14}
                    y={node.y + 42}
                    fill={isSelected ? '#FAF8F3' : '#11261A'}
                    fontFamily="var(--font-display)"
                    fontSize="13.5"
                    fontWeight="600"
                  >
                    {node.title}
                  </text>

                  {/* Primary Figure */}
                  <text
                    x={node.x + 14}
                    y={node.y + 70}
                    fill={isSelected ? '#FFFFFF' : '#11261A'}
                    fontFamily="var(--font-mono)"
                    fontSize="15"
                    fontWeight="700"
                  >
                    {node.primaryMetric}
                  </text>

                  {/* Secondary Timestamp / Lead Context */}
                  <text
                    x={node.x + 14}
                    y={node.y + 92}
                    fill={isSelected ? '#D7EBCD' : '#3C5244'}
                    fontFamily="var(--font-mono)"
                    fontSize="10"
                  >
                    {node.secondaryMetric}
                  </text>

                  {/* Tertiary Line (No Truncation Needed) */}
                  <text
                    x={node.x + 14}
                    y={node.y + 110}
                    fill={isSelected ? '#9EE08C' : '#627568'}
                    fontFamily="var(--font-mono)"
                    fontSize="9.8"
                  >
                    {node.tertiaryMetric}
                  </text>

                  {/* Connector Port Dots */}
                  {node.level > 1 && (
                    <circle
                      cx={node.x}
                      cy={node.y + node.height / 2}
                      r="4.5"
                      fill="#76BE64"
                      stroke="#11261A"
                      strokeWidth="1.5"
                    />
                  )}
                  {node.level < 4 && (
                    <circle
                      cx={node.x + node.width}
                      cy={node.y + node.height / 2}
                      r="4.5"
                      fill="#1B5E3C"
                      stroke="#FAF8F3"
                      strokeWidth="1.5"
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Bottom Contextual Node Detail Inspector Panel (Full Width 2-Column Inside) */}
      <div
        className="editorial-panel pistachio-panel"
        style={{ marginBottom: 0, border: '1.5px solid var(--border-strong)' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '0.85rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span className="badge badge-official">
              SELECTED NODE INSPECTOR • {selectedNode.code}
            </span>
            <h4
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.3rem',
                color: 'var(--text-primary)',
              }}
            >
              {selectedNode.title}
            </h4>
          </div>

          <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
            {selectedNode.parentId && (
              <button
                type="button"
                className="btn-outline"
                onClick={() => setSelectedNodeId(selectedNode.parentId)}
              >
                ← Go to Parent Node
              </button>
            )}
            {selectedNode.id === 'l4_decision' && onOpenScenarioTab && (
              <button
                type="button"
                className="btn-primary"
                onClick={onOpenScenarioTab}
              >
                Open Hypothetical Business Scenario Simulator →
              </button>
            )}
          </div>
        </div>

        <div className="grid-2col" style={{ alignItems: 'start' }}>
          <div>
            <div
              className="tabular-nums"
              style={{
                fontSize: '1.55rem',
                fontWeight: 700,
                color: 'var(--accent-emerald)',
                marginBottom: '0.5rem',
              }}
            >
              {selectedNode.primaryMetric}
            </div>
            <p
              style={{
                fontSize: '0.88rem',
                color: 'var(--text-secondary)',
                marginBottom: '1rem',
                lineHeight: 1.6,
              }}
            >
              {selectedNode.explanation}
            </p>

            {/* Mathematical Formula & Source Attribution */}
            <div
              style={{
                background: 'var(--bg-ivory)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.75rem 0.85rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
              }}
            >
              <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                DERIVATION RULE:
              </div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {selectedNode.formula}
              </div>
              <div style={{ color: 'var(--accent-emerald)', marginTop: '0.45rem' }}>
                SOURCE: {selectedNode.source}
              </div>
            </div>
          </div>

          {/* Key-Value Figures Table */}
          <div
            style={{
              background: 'var(--bg-paper)',
              border: '1px solid var(--border-hairline)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.85rem 1rem',
            }}
          >
            {selectedNode.details.map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.45rem 0',
                  borderBottom: '1px solid var(--border-hairline)',
                  fontSize: '0.8rem',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                <span
                  className="tabular-nums"
                  style={{
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    textAlign: 'right',
                  }}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
