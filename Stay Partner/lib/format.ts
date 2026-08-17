/**
 * Money and date formatting.
 *
 * Indian digit grouping is done by hand rather than via `toLocaleString('en-IN')`
 * — Hermes ships a trimmed ICU and silently falls back to Western grouping, which
 * would render ₹1,84,200 as ₹184,200.
 */

export function formatINR(amount: number): string {
  const rounded = Math.round(Math.abs(amount));
  const s = String(rounded);
  let grouped: string;
  if (s.length <= 3) {
    grouped = s;
  } else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    grouped = `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
  }
  // U+2212 minus, not a hyphen — it aligns with digits in tabular figures.
  return `${amount < 0 ? '\u2212' : ''}₹${grouped}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Thu, Aug 20" — the weekday is derived, never written down. */
export function formatDayDate(d: Date): string {
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Aug 4" — reviews and notifications, where the year and weekday are noise. */
export function formatShortDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Aug 20 – 22", collapsing the month when both ends share it. */
export function formatRange(from: Date, to: Date): string {
  const left = `${MONTHS[from.getMonth()]} ${from.getDate()}`;
  const right =
    from.getMonth() === to.getMonth()
      ? String(to.getDate())
      : `${MONTHS[to.getMonth()]} ${to.getDate()}`;
  return `${left} – ${right}`;
}

/** "Aug 12, 2026" — used where a payout's paper trail needs the year. */
export function formatDateLong(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Aug 17, 6:40 PM" */
export function formatDateTime(d: Date): string {
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${hour12}:${mins} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Nights, not days — the app states every range in nights. */
export function nightsBetween(from: Date, to: Date): number {
  const ms = to.setHours(0, 0, 0, 0) - new Date(from).setHours(0, 0, 0, 0);
  return Math.max(1, Math.round(ms / 86_400_000));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * "Today – Aug 15" · "Aug 20 – 22"
 *
 * The designs hardcode "Today", which is only true on the day the mockup was
 * drawn; this earns the word from the actual date.
 */
export function formatStayRange(checkIn: Date, checkOut: Date, now = new Date()): string {
  const startsToday = isSameDay(checkIn, now);
  const left = startsToday ? 'Today' : `${MONTHS[checkIn.getMonth()]} ${checkIn.getDate()}`;
  const sameMonth = checkIn.getMonth() === checkOut.getMonth();
  const right =
    sameMonth && !startsToday
      ? String(checkOut.getDate())
      : `${MONTHS[checkOut.getMonth()]} ${checkOut.getDate()}`;
  return `${left} – ${right}`;
}

/** "25/08/2026" as you type digits — the same instinct as PhoneField's spacing. */
export function formatDateInput(digits: string): string {
  const d = digits.slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
}

/** Parses a DD/MM/YYYY entry (8 raw digits) into a real calendar date, or null until it is one. */
export function parseDateInput(digits: string): Date | null {
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const date = new Date(year, month - 1, day);
  const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return valid ? date : null;
}

/** Initials for an avatar: "Priya Nair" -> "PN". */
export function initials(name?: string): string {
  if (!name || typeof name !== 'string') return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
