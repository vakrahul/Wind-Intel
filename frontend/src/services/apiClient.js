const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function requestJson(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody && errBody.detail) {
        errorDetail =
          typeof errBody.detail === 'string'
            ? errBody.detail
            : JSON.stringify(errBody.detail);
      }
    } catch {
      // Fallback to status text
      errorDetail = response.statusText || errorDetail;
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export const apiClient = {
  getHealth: () => requestJson('/api/health'),

  getIngestionStatus: () => requestJson('/api/ingest/status'),

  runIngestion: (forceRefresh = false) =>
    requestJson('/api/ingest/run', {
      method: 'POST',
      body: JSON.stringify({ force_refresh: Boolean(forceRefresh) }),
    }),

  getSelectedForecasts: ({
    startDate = '2026-01-01',
    endDate = '2026-01-31',
    cutoffTimeLondon = '11:00',
    cutoffDayOffset = -1,
    fixedHorizonHours = null,
  } = {}) => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      cutoff_time_london: cutoffTimeLondon,
      cutoff_day_offset: String(cutoffDayOffset),
    });
    if (fixedHorizonHours !== null && fixedHorizonHours !== undefined) {
      params.set('fixed_horizon_hours', String(fixedHorizonHours));
    }
    return requestJson(`/api/forecasts/selected?${params.toString()}`);
  },

  getForecastVintages: ({
    targetStartUtc = '2026-01-15T17:00:00Z',
    cutoffTimeLondon = '11:00',
    cutoffDayOffset = -1,
    fixedHorizonHours = null,
  } = {}) => {
    const params = new URLSearchParams({
      target_start_utc: targetStartUtc,
      cutoff_time_london: cutoffTimeLondon,
      cutoff_day_offset: String(cutoffDayOffset),
    });
    if (fixedHorizonHours !== null && fixedHorizonHours !== undefined) {
      params.set('fixed_horizon_hours', String(fixedHorizonHours));
    }
    return requestJson(`/api/forecasts/vintages?${params.toString()}`);
  },

  getIntelligenceTree: ({
    targetStartUtc = '2026-01-15T17:00:00Z',
    cutoffTimeLondon = '11:00',
    cutoffDayOffset = -1,
  } = {}) => {
    const params = new URLSearchParams({
      target_start_utc: targetStartUtc,
      cutoff_time_london: cutoffTimeLondon,
      cutoff_day_offset: String(cutoffDayOffset),
    });
    return requestJson(`/api/intelligence/tree?${params.toString()}`);
  },

  simulateScenario: (payload) =>
    requestJson('/api/scenario/simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMetricsSummary: ({
    startDate = '2026-01-01',
    endDate = '2026-01-31',
    cutoffTimeLondon = '11:00',
    cutoffDayOffset = -1,
    fixedHorizonHours = null,
  } = {}) => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      cutoff_time_london: cutoffTimeLondon,
      cutoff_day_offset: String(cutoffDayOffset),
    });
    if (fixedHorizonHours !== null && fixedHorizonHours !== undefined) {
      params.set('fixed_horizon_hours', String(fixedHorizonHours));
    }
    return requestJson(`/api/metrics/summary?${params.toString()}`);
  },

  getDailyMetrics: ({
    startDate = '2026-01-01',
    endDate = '2026-01-31',
    cutoffTimeLondon = '11:00',
    cutoffDayOffset = -1,
  } = {}) => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      cutoff_time_london: cutoffTimeLondon,
      cutoff_day_offset: String(cutoffDayOffset),
    });
    return requestJson(`/api/metrics/daily?${params.toString()}`);
  },

  getLeadTimeMetrics: ({ startDate = '2026-01-01', endDate = '2026-01-31' } = {}) => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return requestJson(`/api/metrics/lead-time?${params.toString()}`);
  },

  getPredictiveSummary: ({
    cutoffTimeLondon = '11:00',
    cutoffDayOffset = -1,
  } = {}) => {
    const params = new URLSearchParams({
      cutoff_time_london: cutoffTimeLondon,
      cutoff_day_offset: String(cutoffDayOffset),
    });
    return requestJson(`/api/predictive/summary?${params.toString()}`);
  },

  getPredictiveBacktest: ({
    cutoffTimeLondon = '11:00',
    cutoffDayOffset = -1,
    trainEndDate = '2026-01-20',
    evalStartDate = '2026-01-21',
    evalEndDate = '2026-01-31',
  } = {}) => {
    const params = new URLSearchParams({
      cutoff_time_london: cutoffTimeLondon,
      cutoff_day_offset: String(cutoffDayOffset),
      train_end_date: trainEndDate,
      eval_start_date: evalStartDate,
      eval_end_date: evalEndDate,
    });
    return requestJson(`/api/predictive/backtest?${params.toString()}`);
  },

  getDataQuality: ({ cutoffTimeLondon = '11:00', cutoffDayOffset = -1 } = {}) => {
    const params = new URLSearchParams({
      cutoff_time_london: cutoffTimeLondon,
      cutoff_day_offset: String(cutoffDayOffset),
    });
    return requestJson(`/api/data-quality?${params.toString()}`);
  },

  getCsvExportUrl: ({
    startDate = '2026-01-01',
    endDate = '2026-01-31',
    cutoffTimeLondon = '11:00',
    cutoffDayOffset = -1,
  } = {}) => {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      cutoff_time_london: cutoffTimeLondon,
      cutoff_day_offset: String(cutoffDayOffset),
    });
    return `${API_BASE_URL}/api/export/csv?${params.toString()}`;
  },
};
