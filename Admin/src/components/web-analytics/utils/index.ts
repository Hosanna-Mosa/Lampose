import type { GaRangePreset } from '../../../api/types';

/* ── Date range control ───────────────────────────────────────────────── */


export const PRESETS: Array<{ id: Exclude<GaRangePreset, 'custom'>; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
];

export const todayISO = () => new Date().toISOString().slice(0, 10);
