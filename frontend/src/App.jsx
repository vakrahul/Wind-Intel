import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from './services/apiClient';
import { LandingPage } from './pages/LandingPage';
import { OverviewPage } from './pages/OverviewPage';
import { IntelligenceTreePage } from './pages/IntelligenceTreePage';
import { ForecastTimelinePage } from './pages/ForecastTimelinePage';
import { AccuracyLabPage } from './pages/AccuracyLabPage';
import { PredictiveInsightsPage } from './pages/PredictiveInsightsPage';
import { DataObservatoryPage } from './pages/DataObservatoryPage';
import { LiveControlRoomDemo } from './pages/LiveControlRoomDemo';

const NAV_ITEMS = [
  { id: 'landing', index: '00', label: 'Home' },
  { id: 'overview', index: '01', label: 'Overview' },
  { id: 'tree', index: '02', label: 'Intelligence Tree' },
  { id: 'timeline', index: '03', label: 'Forecast Timeline' },
  { id: 'accuracy', index: '04', label: 'Accuracy Lab' },
  { id: 'predictive', index: '05', label: 'Predictive Insights' },
  { id: 'observatory', index: '06', label: 'Data Observatory' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('landing');
  const [cutoffTimeLondon, setCutoffTimeLondon] = useState('11:00');
  const [cutoffDayOffset, setCutoffDayOffset] = useState(-1);
  const [selectedDate, setSelectedDate] = useState('2026-01-15');
  const [selectedHour, setSelectedHour] = useState(17);
  const [healthData, setHealthData] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiClient.getHealth();
      setHealthData(res);
    } catch {
      // Handled by individual page error states
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const handleInspectInterval = (targetStartUtc) => {
    if (targetStartUtc && targetStartUtc.length >= 13) {
      const dStr = targetStartUtc.slice(0, 10);
      const hInt = Number(targetStartUtc.slice(11, 13));
      setSelectedDate(dStr);
      if (!Number.isNaN(hInt)) setSelectedHour(hInt);
      setActiveTab('tree');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openWorkspaceTab = (tabId) => {
    setActiveTab(tabId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (activeTab === 'live-demo') {
    return (
      <LiveControlRoomDemo
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        selectedHour={selectedHour}
        setSelectedHour={setSelectedHour}
        cutoffTimeLondon={cutoffTimeLondon}
        setCutoffTimeLondon={setCutoffTimeLondon}
        cutoffDayOffset={cutoffDayOffset}
        setCutoffDayOffset={setCutoffDayOffset}
        onBackToDashboard={() => openWorkspaceTab('landing')}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation Bar */}
      <header className="top-navbar">
        <div className="navbar-inner">
          <button
            type="button"
            className="brand-cluster"
            onClick={() => openWorkspaceTab('landing')}
          >
            <div className="brand-mark" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
                <path
                  d="M8 16C16 16 19 10 26 10C32 10 35 14 40 14"
                  stroke="#8CCB7C"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <path
                  d="M8 26C17 26 21 20 29 20C34 20 37 23 40 25"
                  stroke="#FAF8F3"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <circle cx="29" cy="20" r="4.5" fill="#8CCB7C" />
              </svg>
            </div>
            <div>
              <span className="brand-title">WINDLINE</span>
              <span className="brand-subtitle">
                UK Wind Forecast Intelligence • Jan 2026
              </span>
            </div>
          </button>

          <nav className="nav-tabs" aria-label="Primary Workspace Navigation">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-tab-btn ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => openWorkspaceTab(item.id)}
              >
                <span className="tab-index">{item.index}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => openWorkspaceTab('live-demo')}
              style={{
                padding: '0.42rem 0.9rem',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-pill)',
              }}
            >
              Launch Live Demo
            </button>
            <div className="status-pill" title="Backend & Elexon Data Status">
              <span className="status-dot" />
              <span>
                {healthData?.january_2026_ready
                  ? `ELEXON DATA READY (${healthData.cached_hourly_actuals_jan2026}h)`
                  : 'CONNECTING API'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Simple Decision Deadline Control Bar (Shown on Pages 01 to 06) */}
      {activeTab !== 'landing' && (
        <div className="control-ribbon">
          <div className="control-ribbon-inner">
            <div className="control-group">
              <span className="badge badge-official">DATA: JANUARY 2026</span>
              <span className="control-label">
                BUYING DECISION DEADLINE (LONDON TIME):
              </span>
              <select
                aria-label="Global Procurement Cutoff Time"
                className="field-select"
                value={cutoffTimeLondon}
                onChange={(e) => setCutoffTimeLondon(e.target.value)}
              >
                <option value="06:00">06:00 AM London</option>
                <option value="09:00">09:00 AM London</option>
                <option value="11:00">11:00 AM London (Default Day-Ahead Deadline)</option>
                <option value="12:00">12:00 PM London</option>
                <option value="15:00">03:00 PM London</option>
                <option value="18:00">06:00 PM London</option>
                <option value="23:30">11:30 PM London</option>
              </select>

              <span className="control-label">DECISION DAY:</span>
              <select
                aria-label="Global Cutoff Day Offset"
                className="field-select"
                value={cutoffDayOffset}
                onChange={(e) => setCutoffDayOffset(Number(e.target.value))}
              >
                <option value={-1}>1 Day Before Delivery (D-1 Default)</option>
                <option value={-2}>2 Days Before Delivery (D-2)</option>
                <option value={0}>Same Day Morning (D-0)</option>
              </select>
            </div>

            <div className="control-group">
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                }}
              >
                Uses only forecasts published before deadline • Error = Forecast − Actual
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main style={{ flex: 1 }}>
        {activeTab === 'landing' && (
          <LandingPage
            healthData={healthData}
            cutoffTimeLondon={cutoffTimeLondon}
            setCutoffTimeLondon={setCutoffTimeLondon}
            onOpenWorkspace={openWorkspaceTab}
          />
        )}

        {activeTab !== 'landing' && (
          <div className="workspace-container">
            {activeTab === 'overview' && (
              <OverviewPage
                cutoffTimeLondon={cutoffTimeLondon}
                cutoffDayOffset={cutoffDayOffset}
                onInspectInterval={handleInspectInterval}
              />
            )}

            {activeTab === 'tree' && (
              <IntelligenceTreePage
                cutoffTimeLondon={cutoffTimeLondon}
                cutoffDayOffset={cutoffDayOffset}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                selectedHour={selectedHour}
                setSelectedHour={setSelectedHour}
              />
            )}

            {activeTab === 'timeline' && (
              <ForecastTimelinePage
                cutoffTimeLondon={cutoffTimeLondon}
                cutoffDayOffset={cutoffDayOffset}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                selectedHour={selectedHour}
                setSelectedHour={setSelectedHour}
              />
            )}

            {activeTab === 'accuracy' && (
              <AccuracyLabPage
                cutoffTimeLondon={cutoffTimeLondon}
                cutoffDayOffset={cutoffDayOffset}
              />
            )}

            {activeTab === 'predictive' && (
              <PredictiveInsightsPage
                cutoffTimeLondon={cutoffTimeLondon}
                cutoffDayOffset={cutoffDayOffset}
              />
            )}

            {activeTab === 'observatory' && (
              <DataObservatoryPage
                cutoffTimeLondon={cutoffTimeLondon}
                cutoffDayOffset={cutoffDayOffset}
                onIngestionCompleted={fetchHealth}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-hairline)',
          background: 'var(--bg-ivory)',
          padding: '1.5rem',
          marginTop: 'auto',
        }}
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.74rem',
            color: 'var(--text-secondary)',
          }}
        >
          <div>
            <strong>WINDLINE — Wind Forecast Intelligence</strong> • Official UK Elexon Data (
            <code>FUELHH</code> Actuals &amp; <code>WINDFOR</code> Forecasts • January 2026)
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            <a
              href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-emerald)', textDecoration: 'none' }}
            >
              FUELHH Docs ↗
            </a>
            <a
              href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent-emerald)', textDecoration: 'none' }}
            >
              WINDFOR Docs ↗
            </a>
            <span>Time: UTC Internal / London Local Display</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
