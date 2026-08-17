/**
 * The seven lead statuses, in one place.
 *
 * The rep's cards, the rep's modal and the admin's table were each carrying
 * their own copy of this list with their own colours and their own labels, so
 * "Qualified" was amber in one view and unstyled in another. An admin checking
 * a rep's work should be reading the same word in the same colour the rep
 * chose it in — that is what makes the admin panel a reflection of the
 * employee's pipeline rather than a second opinion about it.
 */
export type LeadStatusValue =
  | 'NEW'
  | 'CONTACTED'
  | 'INTERESTED'
  | 'QUALIFIED'
  | 'CALLBACK'
  | 'CLOSED_WON'
  | 'CLOSED_LOST';

export interface LeadStatusMeta {
  value: LeadStatusValue;
  /** With its emoji, as the rep picks it. */
  label: string;
  /** Without the emoji, for a dense table cell. */
  short: string;
  /** Tailwind classes for the chip. */
  chip: string;
}

export const LEAD_STATUSES: readonly LeadStatusMeta[] = [
  { value: 'NEW', label: '🆕 New Lead', short: 'New', chip: 'bg-slate-100 text-slate-600 border-slate-300' },
  { value: 'CONTACTED', label: '📞 Contacted / Called', short: 'Contacted', chip: 'bg-blue-100 text-blue-600 border-blue-200' },
  { value: 'INTERESTED', label: '🔥 Interested', short: 'Interested', chip: 'bg-cyan-100 text-cyan-600 border-cyan-200' },
  { value: 'QUALIFIED', label: '⭐ Qualified Opportunity', short: 'Qualified', chip: 'bg-amber-100 text-amber-600 border-amber-200' },
  { value: 'CALLBACK', label: '⏰ Call Back Requested', short: 'Call back', chip: 'bg-purple-100 text-purple-600 border-purple-200' },
  { value: 'CLOSED_WON', label: '🎉 Closed Won / Client', short: 'Closed won', chip: 'bg-emerald-100 text-emerald-600 border-emerald-200' },
  { value: 'CLOSED_LOST', label: '❌ Closed Lost', short: 'Closed lost', chip: 'bg-rose-100 text-rose-600 border-rose-200' },
];

const FALLBACK = LEAD_STATUSES[0];

/** Never throws on an unknown value — an old row reads as New rather than blank. */
export const leadStatusMeta = (status?: string): LeadStatusMeta =>
  LEAD_STATUSES.find((entry) => entry.value === status) || FALLBACK;

/** "2 hours ago" — how fresh a rep's last touch is, at a glance. */
export const timeAgo = (iso?: string): string => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
};
