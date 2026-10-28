import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { formatMw, formatSignedMw } from '../utils/formatters';

export function DataLineagePipeline({ lineageStages = [], intervalVintages = null }) {
  const [activeStage, setActiveStage] = useState(4);

  if (!lineageStages || lineageStages.length === 0) {
    return null;
  }

  const selectedStageObj =
    lineageStages.find((s) => s.stage_number === activeStage) || lineageStages[0];

  const excludedCount = intervalVintages?.excluded_future_vintages_count ?? 0;
  const eligibleCount = intervalVintages?.eligible_vintages_count ?? 0;
  const selectedVintage = intervalVintages?.selected_vintage;

  return (
    <div className="editorial-panel" style={{ marginBottom: '1.5rem' }}>
      <div className="panel-header">
        <div>
          <span className="section-eyebrow">
            ANIMATED DATA FLOW PIPELINE
          </span>
          <h3 className="panel-title">
            7-Stage Data Check &amp; Deadline Filter
          </h3>
          <p className="panel-subtitle">
            Shows how raw Elexon data is checked, averaged into hourly values, and filtered at the
            buying deadline. Click any of the 7 stages to see its details.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="badge badge-official">
            ALLOWED BEFORE DEADLINE: {eligibleCount}
          </span>
          <span className="badge badge-excluded">
            BLOCKED AFTER DEADLINE: {excludedCount}
          </span>
        </div>
      </div>

      {/* SVG Animated Pipeline Diagram */}
      <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        <svg
          viewBox="0 0 1180 215"
          style={{ width: '100%', minWidth: '920px', height: 'auto', display: 'block' }}
          role="img"
          aria-label="7-stage animated data lineage flow from raw Elexon records to decision interpretation"
        >
          <defs>
            <linearGradient id="lineageTrackGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#1B5E3C" />
              <stop offset="55%" stopColor="#76BE64" />
              <stop offset="100%" stopColor="#11261A" />
            </linearGradient>
          </defs>

          {/* Main Horizontal Flow Spine */}
          <line
            x1="75"
            y1="78"
            x2="1105"
            y2="78"
            stroke="#DDD7C8"
            strokeWidth="3"
          />
          <motion.line
            x1="75"
            y1="78"
            x2="1105"
            y2="78"
            stroke="url(#lineageTrackGrad)"
            strokeWidth="3"
            strokeDasharray="10 6"
            initial={{ strokeDashoffset: 60 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
          />

          {/* Stage 4 Rejected Post-Cutoff Deflection Branch */}
          <path
            d="M 578 98 C 578 152, 625 168, 690 168"
            fill="none"
            stroke="#B83A2A"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <g transform="translate(695, 146)">
            <rect
              x="0"
              y="0"
              width="315"
              height="44"
              rx="6"
              fill="#FDECE9"
              stroke="#E5988E"
              strokeDasharray="4 3"
            />
            <text
              x="12"
              y="18"
              fill="#B83A2A"
              fontFamily="var(--font-mono)"
              fontSize="10"
              fontWeight="600"
            >
              DEFLECTED AT CUTOFF GATE (publishTime &gt; cutoff)
            </text>
            <text
              x="12"
              y="34"
              fill="#627568"
              fontFamily="var(--font-mono)"
              fontSize="10"
            >
              {excludedCount} later WINDFOR publications excluded from replay
            </text>
          </g>

          {/* 7 Interactive Stage Nodes */}
          {lineageStages.map((stage, idx) => {
            const cx = 82 + idx * 168;
            const isSelected = stage.stage_number === activeStage;
            const isGate = stage.stage_number === 4;

            return (
              <g
                key={stage.stage_id}
                className="svg-tree-node"
                tabIndex={0}
                role="button"
                aria-label={`Stage ${stage.stage_number}: ${stage.title} - ${stage.primary_metric}`}
                onClick={() => setActiveStage(stage.stage_number)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveStage(stage.stage_number);
                  }
                }}
              >
                <rect
                  className="node-box"
                  x={cx - 72}
                  y={18}
                  width="144"
                  height="112"
                  rx="8"
                  fill={
                    isSelected
                      ? '#11261A'
                      : isGate
                      ? '#D7EBCD'
                      : '#FFFFFF'
                  }
                  stroke={
                    isSelected
                      ? '#76BE64'
                      : isGate
                      ? '#1B5E3C'
                      : '#BFC9B9'
                  }
                  strokeWidth={isSelected ? '2.5' : '1.25'}
                />

                {/* Stage Number Pill */}
                <rect
                  x={cx - 62}
                  y={28}
                  width="54"
                  height="18"
                  rx="4"
                  fill={isSelected ? '#237A4B' : '#EBF4E7'}
                />
                <text
                  x={cx - 35}
                  y={40}
                  textAnchor="middle"
                  fill={isSelected ? '#FAF8F3' : '#1B5E3C'}
                  fontFamily="var(--font-mono)"
                  fontSize="9.5"
                  fontWeight="600"
                >
                  STAGE 0{stage.stage_number}
                </text>

                {/* Title */}
                <text
                  x={cx - 62}
                  y={62}
                  fill={isSelected ? '#FAF8F3' : '#11261A'}
                  fontFamily="var(--font-sans)"
                  fontSize="11"
                  fontWeight="700"
                >
                  {stage.title.length > 21
                    ? `${stage.title.slice(0, 20)}…`
                    : stage.title}
                </text>

                {/* Subtitle */}
                <text
                  x={cx - 62}
                  y={78}
                  fill={isSelected ? '#9EE08C' : '#627568'}
                  fontFamily="var(--font-mono)"
                  fontSize="9.2"
                >
                  {stage.subtitle.length > 24
                    ? `${stage.subtitle.slice(0, 23)}…`
                    : stage.subtitle}
                </text>

                {/* Primary Value */}
                <text
                  x={cx - 62}
                  y={108}
                  fill={isSelected ? '#FAF8F3' : '#1B5E3C'}
                  fontFamily="var(--font-mono)"
                  fontSize="10.2"
                  fontWeight="600"
                >
                  {stage.primary_metric.length > 22
                    ? `${stage.primary_metric.slice(0, 21)}…`
                    : stage.primary_metric}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Stage Audit Detail Bar */}
      <div
        style={{
          marginTop: '0.75rem',
          padding: '1rem 1.25rem',
          background: 'var(--bg-pistachio-soft)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--accent-emerald)',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            STAGE 0{selectedStageObj.stage_number} AUDIT • {selectedStageObj.title} (
            {selectedStageObj.subtitle})
          </div>
          <div
            style={{
              fontSize: '0.88rem',
              color: 'var(--text-primary)',
              marginTop: '0.25rem',
            }}
          >
            {selectedStageObj.detail}
          </div>
        </div>
        <div
          className="tabular-nums"
          style={{
            background: 'var(--bg-paper)',
            padding: '0.45rem 0.85rem',
            borderRadius: 'var(--radius-xs)',
            border: '1px solid var(--border-hairline)',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {selectedStageObj.primary_metric}
        </div>
      </div>
    </div>
  );
}
