export function formatMw(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return `${Number(value).toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} MW`;
}

export function formatSignedMw(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} MW`;
}

export function formatMwh(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return `${Number(value).toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} MWh`;
}

export function formatPct(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return `${Number(value).toFixed(decimals)}%`;
}

export function formatHours(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return `${Number(value).toFixed(decimals)}h`;
}

export function formatShortUtc(isoUtc) {
  if (!isoUtc) return '—';
  return isoUtc.replace('T', ' ').replace(':00Z', ' UTC');
}

export function buildTargetUtc(dateStr, hourInt) {
  const h = String(hourInt).padStart(2, '0');
  return `${dateStr}T${h}:00:00Z`;
}

export const JAN_2026_DATES = Array.from({ length: 31 }, (_, i) => {
  const day = String(i + 1).padStart(2, '0');
  return `2026-01-${day}`;
});

export const HOURS_OF_DAY = Array.from({ length: 24 }, (_, i) => i);
