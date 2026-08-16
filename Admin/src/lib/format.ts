/** Shared formatting helpers — one implementation so numbers and dates read the
 *  same everywhere in the panel. */

/** 1284 → "1,284"; 12903 → "12.9K"; 4200000 → "4.2M" */
export const compactNumber = (value: number): string => {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toLocaleString('en-IN');
};

export const fullNumber = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString('en-IN') : '—';

/** Indian rupee, no decimals — the currency every rent figure is stored in. */
export const rupees = (value: number, compact = false): string => {
  if (!Number.isFinite(value)) return '—';
  return `₹${compact ? compactNumber(value) : value.toLocaleString('en-IN')}`;
};

export const percent = (value: number | null, digits = 1): string =>
  value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)}%`;

export const bytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export const duration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATETIME_FMT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (input?: string | Date | null): string => {
  if (!input) return '—';
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? '—' : DATE_FMT.format(d);
};

export const formatDateTime = (input?: string | Date | null): string => {
  if (!input) return '—';
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? '—' : DATETIME_FMT.format(d);
};

/** "3 hours ago" — falls back to an absolute date past a week. */
export const relativeTime = (input?: string | Date | null): string => {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';

  const diff = Date.now() - d.getTime();
  const minutes = Math.round(diff / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `${days}d ago`;
  return DATE_FMT.format(d);
};

/** Deterministic initials for the avatar fallback. */
export const initials = (name?: string): string => {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/** Change between two periods, expressed as a signed percentage. */
export const deltaPercent = (current: number, previous: number): number | null => {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
};
