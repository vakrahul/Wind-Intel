import React, { useEffect, useState, useCallback } from 'react';
import {
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
import { formatMw, formatMwh, formatSignedMw } from '../utils/formatters';
import { ErrorState, LoadingState } from './StateBanners';

export function BusinessScenarioSimulator({
  targetStartUtc,
  cutoffTimeLondon,
  cutoffDayOffset,
}) {
  const [baselineDemandMw, setBaselineDemandMw] = useState(28000);
  const [otherSupplyMw, setOtherSupplyMw] = useState(6500);
  const [customGrowthPct, setCustomGrowthPct] = useState(15);
  const [windScalingPct, setWindScalingPct] = useState(100);
  const [windBasis, setWindBasis] = useState('selected_forecast');

  const [simData, setSimData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.simulateScenario({
        target_start_utc: targetStartUtc,
        cutoff_time_london: cutoffTimeLondon,
        cutoff_day_offset: cutoffDayOffset,
        baseline_demand_mw: Number(baselineDemandMw) || 0,
        other_supply_mw: Number(otherSupplyMw) || 0,
        custom_growth_pct: Number(customGrowthPct) || 0,
        wind_scaling_pct: Number(windScalingPct) || 100,
        wind_basis: windBasis,
      });
      setSimData(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [
    targetStartUtc,
    cutoffTimeLondon,
    cutoffDayOffset,
    baselineDemandMw,
    otherSupplyMw,
    customGrowthPct,
    windScalingPct,
    windBasis,
  ]);

  useEffect(() => {
    runSimulation();
  }, [runSimulation]);

  const applyScalePreset = (preset) => {
    if (preset === 'national') {
      setBaselineDemandMw(28000);
      setOtherSupplyMw(6500);
      setWindScalingPct(100);
    } else if (preset === 'regional_utility') {
      setBaselineDemandMw(2800);
      setOtherSupplyMw(650);
      setWindScalingPct(10);
    } else if (preset === 'industrial_portfolio') {
      setBaselineDemandMw(280);
      setOtherSupplyMw(65);
      setWindScalingPct(1);
    }
  };

  if (loading && !simData) {
    return <LoadingState message="Calculating hypothetical residual power scenarios..." />;
  }

  if (error && !simData) {
    return <ErrorState error={error} onRetry={runSimulation} />;
  }

  if (!simData) return null;

  const allScenarios = [
    ...(simData.comparison_scenarios || []),
    ...(simData.custom_scenario ? [simData.custom_scenario] : []),
  ];

  const chartData = allScenarios.map((sc) => ({
    name: sc.scenario_label,
    projectedDemandMw: sc.projected_demand_mw,
    windContributionMw: sc.wind_contribution_mw,
    otherSupplyMw: sc.other_supply_mw,
    illustrativeResidualMw: sc.illustrative_residual_mw,
  }));

  return (
    <div className="editorial-panel hypothetical-panel">
      {/* Mandatory Hypothetical Isolation Banner */}
      <div
        style={{
          background: 'var(--bg-amber-tint)',
          border: '1px solid var(--border-amber)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.85rem 1.15rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <span className="badge badge-hypothetical">
            OPTIONAL SCENARIO WORKSPACE • USER-ENTERED HYPOTHETICAL ASSUMPTIONS
          </span>
          <p
            style={{
              fontSize: '0.82rem',
              color: 'var(--text-primary)',
              marginTop: '0.4rem',
              maxWidth: '92ch',
            }}
          >
            {simData.disclaimer}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={() => applyScalePreset('national')}
          >
            Preset: 100% Grid Scale
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => applyScalePreset('regional_utility')}
          >
            Preset: 10% UK Supplier Share
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => applyScalePreset('industrial_portfolio')}
          >
            Preset: 1% Portfolio Share
          </button>
        </div>
      </div>

      {/* Interactive Parameter Controls */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
          background: 'var(--bg-paper)',
          padding: '1.1rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-hairline)',
          marginBottom: '1.25rem',
        }}
      >
        <div>
          <label
            htmlFor="scen-baseline-demand"
            className="control-label"
            style={{ display: 'block', marginBottom: '0.35rem' }}
          >
            Assumed Baseline Demand (MW)
          </label>
          <input
            id="scen-baseline-demand"
            type="number"
            min="0"
            max="100000"
            step="100"
            className="field-input"
            style={{ width: '100%' }}
            value={baselineDemandMw}
            onChange={(e) => setBaselineDemandMw(e.target.value)}
          />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            User-entered hypothetical demand
          </span>
        </div>

        <div>
          <label
            htmlFor="scen-other-supply"
            className="control-label"
            style={{ display: 'block', marginBottom: '0.35rem' }}
          >
            Other Contracted Supply (MW)
          </label>
          <input
            id="scen-other-supply"
            type="number"
            min="0"
            max="100000"
            step="100"
            className="field-input"
            style={{ width: '100%' }}
            value={otherSupplyMw}
            onChange={(e) => setOtherSupplyMw(e.target.value)}
          />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Non-wind available supply
          </span>
        </div>

        <div>
          <label
            htmlFor="scen-growth-pct"
            className="control-label"
            style={{ display: 'block', marginBottom: '0.35rem' }}
          >
            Custom Demand Growth (%): {customGrowthPct}%
          </label>
          <input
            id="scen-growth-pct"
            type="range"
            min="-20"
            max="50"
            step="1"
            style={{ width: '100%', accentColor: 'var(--accent-emerald)' }}
            value={customGrowthPct}
            onChange={(e) => setCustomGrowthPct(Number(e.target.value))}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}
          >
            <span>-20%</span>
            <span>0%</span>
            <span>+10%</span>
            <span>+20%</span>
            <span>+30%</span>
            <span>+50%</span>
          </div>
        </div>

        <div>
          <label
            htmlFor="scen-wind-share"
            className="control-label"
            style={{ display: 'block', marginBottom: '0.35rem' }}
          >
            National Wind Share (%): {windScalingPct}%
          </label>
          <input
            id="scen-wind-share"
            type="number"
            min="0.1"
            max="100"
            step="0.5"
            className="field-input"
            style={{ width: '100%' }}
            value={windScalingPct}
            onChange={(e) => setWindScalingPct(e.target.value)}
          />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Scaled Elexon wind: {formatMw(simData.selected_wind_contribution_mw, 1)}
          </span>
        </div>

        <div>
          <label
            htmlFor="scen-wind-basis"
            className="control-label"
            style={{ display: 'block', marginBottom: '0.35rem' }}
          >
            Wind Contribution Basis
          </label>
          <select
            id="scen-wind-basis"
            className="field-select"
            style={{ width: '100%' }}
            value={windBasis}
            onChange={(e) => setWindBasis(e.target.value)}
          >
            <option value="selected_forecast">
              Selected Elexon Forecast ({formatMw(simData.official_selected_forecast_mw, 0)})
            </option>
            <option value="actual_generation">
              Aligned Elexon Actual ({formatMw(simData.official_actual_hourly_mw, 0)})
            </option>
          </select>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Official Elexon interval source
          </span>
        </div>
      </div>

      {/* Explicit Formula & Power vs. Energy Distinction Bar */}
      <div
        className="grid-2col"
        style={{ marginBottom: '1.25rem', gap: '1rem' }}
      >
        <div
          style={{
            background: 'var(--bg-ivory)',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-hairline)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
          }}
        >
          <div style={{ color: 'var(--accent-emerald)', fontWeight: 700, marginBottom: '0.25rem' }}>
            SCENARIO CALCULATION FORMULAS
          </div>
          <div>1. {simData.formula_documentation.projected_demand_formula}</div>
          <div style={{ marginTop: '0.2rem' }}>
            2. {simData.formula_documentation.illustrative_residual_formula}
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-pistachio-soft)',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-strong)',
            fontSize: '0.78rem',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent-emerald)',
              fontWeight: 700,
              marginBottom: '0.25rem',
            }}
          >
            UNIT DISTINCTION: POWER (MW) VS. ENERGY (MWh / kWh)
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>
            {simData.unit_distinction_note}
          </p>
        </div>
      </div>

      {/* Visual Scenario Growth Tree + Chart */}
      <div className="grid-2col" style={{ marginBottom: '1.25rem', alignItems: 'stretch' }}>
        {/* Left: SVG Scenario Branch Tree */}
        <div
          style={{
            background: 'var(--bg-paper)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-sm)',
            padding: '1rem',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--status-amber)',
              fontWeight: 600,
              marginBottom: '0.6rem',
            }}
          >
            HYPOTHETICAL SCENARIO GROWTH TREE ({simData.target_start_london})
          </div>
          <svg
            viewBox="0 0 600 320"
            style={{ width: '100%', height: 'auto', display: 'block' }}
            role="img"
            aria-label="Scenario comparison tree showing Current, +10%, +20%, and +30% demand growth branches"
          >
            {/* Root Supply + Wind Node */}
            <rect
              x="16"
              y="105"
              width="195"
              height="108"
              rx="8"
              fill="#11261A"
              stroke="#76BE64"
              strokeWidth="2"
            />
            <text
              x="28"
              y="128"
              fill="#9EE08C"
              fontFamily="var(--font-mono)"
              fontSize="9.5"
              fontWeight="600"
            >
              BASELINE &amp; SUPPLY INPUTS
            </text>
            <text
              x="28"
              y="150"
              fill="#FAF8F3"
              fontFamily="var(--font-mono)"
              fontSize="11.5"
              fontWeight="700"
            >
              Base Demand: {formatMw(baselineDemandMw, 0)}
            </text>
            <text
              x="28"
              y="172"
              fill="#D7EBCD"
              fontFamily="var(--font-mono)"
              fontSize="10.5"
            >
              Other Supply: {formatMw(otherSupplyMw, 0)}
            </text>
            <text
              x="28"
              y="194"
              fill="#8BD477"
              fontFamily="var(--font-mono)"
              fontSize="10.5"
              fontWeight="600"
            >
              Wind ({windScalingPct}%): {formatMw(simData.selected_wind_contribution_mw, 0)}
            </text>

            {/* 4 Preset Scenario Branches */}
            {(simData.comparison_scenarios || []).map((sc, idx) => {
              const by = 16 + idx * 76;
              const cy = by + 30;
              return (
                <g key={sc.scenario_id}>
                  <path
                    d={`M 211 159 C 260 159, 260 ${cy}, 310 ${cy}`}
                    fill="none"
                    stroke="#C47416"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                  <rect
                    x="310"
                    y={by}
                    width="275"
                    height="62"
                    rx="7"
                    fill="#FCF9F2"
                    stroke="#E5B473"
                    strokeWidth="1.5"
                  />
                  <text
                    x="322"
                    y={by + 19}
                    fill="#C47416"
                    fontFamily="var(--font-mono)"
                    fontSize="10"
                    fontWeight="700"
                  >
                    {sc.scenario_label.toUpperCase()} (Projected: {formatMw(sc.projected_demand_mw, 0)})
                  </text>
                  <text
                    x="322"
                    y={by + 40}
                    fill="#11261A"
                    fontFamily="var(--font-mono)"
                    fontSize="12.5"
                    fontWeight="700"
                  >
                    Residual: {formatMw(sc.illustrative_residual_mw, 1)}
                  </text>
                  <text
                    x="322"
                    y={by + 55}
                    fill="#627568"
                    fontFamily="var(--font-mono)"
                    fontSize="9.2"
                  >
                    Energy (1h): {formatMwh(sc.illustrative_residual_mwh_per_hour, 1)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right: Recharts Scenario Comparison Bar Chart */}
        <div
          style={{
            background: 'var(--bg-paper)',
            border: '1px solid var(--border-hairline)',
            borderRadius: 'var(--radius-sm)',
            padding: '1rem',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--accent-emerald)',
              fontWeight: 600,
              marginBottom: '0.6rem',
            }}
          >
            PROJECTED DEMAND VS. WIND CONTRIBUTION &amp; RESIDUAL REQUIREMENT (MW)
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3DECF" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: '#3C5244' }}
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
                  dataKey="projectedDemandMw"
                  name="Projected Demand (MW)"
                  fill="#11261A"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="windContributionMw"
                  name="Selected Wind Contribution (MW)"
                  fill="#76BE64"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="illustrativeResidualMw"
                  name="Illustrative Residual Requirement (MW)"
                  fill="#C47416"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Scenario Comparison Table */}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Scenario Case</th>
              <th>Growth (%)</th>
              <th>Baseline Demand (MW)</th>
              <th>Projected Demand (MW)</th>
              <th>Other Supply (MW)</th>
              <th>Wind Contribution (MW)</th>
              <th>Illustrative Residual Power (MW)</th>
              <th>1-Hour Energy (MWh / kWh)</th>
              <th>Actual vs. Forecast Wind Residual Delta</th>
            </tr>
          </thead>
          <tbody>
            {allScenarios.map((sc) => (
              <tr
                key={sc.scenario_id}
                className={sc.scenario_id === 'custom' ? 'selected-row' : ''}
              >
                <td>
                  <strong>{sc.scenario_label}</strong>
                </td>
                <td>{sc.growth_pct >= 0 ? `+${sc.growth_pct}%` : `${sc.growth_pct}%`}</td>
                <td>{formatMw(sc.baseline_demand_mw, 1)}</td>
                <td>{formatMw(sc.projected_demand_mw, 1)}</td>
                <td>{formatMw(sc.other_supply_mw, 1)}</td>
                <td>{formatMw(sc.wind_contribution_mw, 1)}</td>
                <td style={{ fontWeight: 700, color: 'var(--status-amber)' }}>
                  {formatMw(sc.illustrative_residual_mw, 1)}
                </td>
                <td>
                  {formatMwh(sc.illustrative_residual_mwh_per_hour, 1)} (
                  {Number(sc.illustrative_residual_kwh_per_hour).toLocaleString('en-GB')} kWh)
                </td>
                <td>
                  {formatSignedMw(sc.forecast_vs_actual_residual_delta_mw, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
