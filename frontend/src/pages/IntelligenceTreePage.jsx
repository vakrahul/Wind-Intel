import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/apiClient';
import {
  JAN_2026_DATES,
  HOURS_OF_DAY,
  buildTargetUtc,
  formatMw,
  formatSignedMw,
} from '../utils/formatters';
import { DataLineagePipeline } from '../components/DataLineagePipeline';
import { EnergyIntelligenceTree } from '../components/EnergyIntelligenceTree';
import { BusinessScenarioSimulator } from '../components/BusinessScenarioSimulator';
import { ErrorState, LoadingState } from '../components/StateBanners';

export function IntelligenceTreePage({
  cutoffTimeLondon,
  cutoffDayOffset,
  selectedDate,
  setSelectedDate,
  selectedHour,
  setSelectedHour,
}) {
  const [activeSubTab, setActiveSubTab] = useState('both'); // 'tree', 'scenario', 'both'
  const [treeData, setTreeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const targetStartUtc = buildTargetUtc(selectedDate, selectedHour);

  const fetchTreeContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getIntelligenceTree({
        targetStartUtc,
        cutoffTimeLondon,
        cutoffDayOffset,
      });
      setTreeData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [targetStartUtc, cutoffTimeLondon, cutoffDayOffset]);

  useEffect(() => {
    fetchTreeContext();
  }, [fetchTreeContext]);

  const vCtx = treeData?.interval_vintages || {};
  const selVintage = vCtx.selected_vintage;

  return (
    <div>
      {/* Header & Target Interval Controls */}
      <div className="section-header">
        <div>
          <div className="section-eyebrow">
            <span>PAGE 02 • DECISION TREE &amp; POWER CALCULATOR</span>
          </div>
          <h1 className="section-title">
            Single-Hour Decision Tree, Data Flow &amp; Power Calculator
          </h1>
          <p className="section-desc">
            Pick any date and hour in January 2026 to see the wind forecast, the actual wind
            generated, the forecast error, and calculate how much extra power your business needs to
            buy.
          </p>
        </div>

        {/* Sub-view mode switcher */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn-outline ${activeSubTab === 'both' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('both')}
          >
            Show Everything (Tree + Flow + Calculator)
          </button>
          <button
            type="button"
            className={`btn-outline ${activeSubTab === 'tree' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('tree')}
          >
            Decision Tree &amp; Flow Only
          </button>
          <button
            type="button"
            className={`btn-outline ${activeSubTab === 'scenario' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('scenario')}
          >
            Business Power Calculator Only
          </button>
        </div>
      </div>

      {/* Interval Selector Bar */}
      <div
        className="editorial-panel pistachio-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          padding: '0.95rem 1.25rem',
        }}
      >
        <div className="control-group">
          <span className="control-label">DELIVERY DATE (JAN 2026):</span>
          <select
            aria-label="Target Delivery Date"
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
            aria-label="Target Delivery Hour"
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

          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setSelectedDate('2026-01-15');
              setSelectedHour(17);
            }}
          >
            Sample 1: Jan 15 at 17:00
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setSelectedDate('2026-01-09');
              setSelectedHour(12);
            }}
          >
            Sample 2: Jan 09 at 12:00
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge badge-official">
            FORECAST: {formatMw(selVintage?.forecast_mw, 0)}
          </span>
          <span className="badge badge-observation">
            ACTUAL: {formatMw(vCtx.actual_hourly_mw, 0)}
          </span>
          <span
            className={`badge ${
              (vCtx.error_mw || 0) >= 0 ? 'badge-over' : 'badge-under'
            }`}
          >
            ERROR: {formatSignedMw(vCtx.error_mw, 0)}
          </span>
        </div>
      </div>

      {loading && <LoadingState message="Loading decision tree and data flow..." />}
      {error && <ErrorState error={error} onRetry={fetchTreeContext} />}

      {!loading && !error && treeData && (
        <>
          {(activeSubTab === 'both' || activeSubTab === 'tree') && (
            <>
              <EnergyIntelligenceTree
                treeData={treeData}
                onOpenScenarioTab={() => setActiveSubTab('scenario')}
              />
              <DataLineagePipeline
                lineageStages={treeData.lineage_stages}
                intervalVintages={treeData.interval_vintages}
              />
            </>
          )}

          {(activeSubTab === 'both' || activeSubTab === 'scenario') && (
            <BusinessScenarioSimulator
              targetStartUtc={targetStartUtc}
              cutoffTimeLondon={cutoffTimeLondon}
              cutoffDayOffset={cutoffDayOffset}
            />
          )}
        </>
      )}
    </div>
  );
}
