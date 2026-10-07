/* ══════════════════════════════════════════════════════════════════════════
   When something happened, in as few words as carry the meaning.

   Written for the support screens, which show a timestamp twice on every
   screen and in two different jobs: a list row wants "how long ago", a message
   wants "at what time". Both were about to be hand-rolled in three files, and
   three copies of a date format is three of them saying a different thing
   about the same instant.

   Everything is local time, via the platform formatter — a kitchen reads these
   against the clock on its own wall, and nothing here is ever sent back.
   ══════════════════════════════════════════════════════════════════════════ */

const parse = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "14:32" — the time alone, for something that happened today. */
export const clockWords = (iso: string | null | undefined): string => {
  const d = parse(iso);
  if (!d) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/**
 * A short stamp for a list row: today is a time, yesterday is a word, and
 * anything older is a date.
 *
 * An empty string when the date is missing or unparseable, never "Invalid
 * Date" — a row with no timestamp reads fine, a row with an error in it does
 * not.
 */
export const whenWords = (iso: string | null | undefined): string => {
  const d = parse(iso);
  if (!d) return "";

  const now = new Date();
  if (sameDay(d, now)) return clockWords(iso);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";

  return d.toLocaleDateString([], {
    day: "2-digit",
    month: "short",
    ...(d.getFullYear() === now.getFullYear() ? null : { year: "numeric" }),
  });
};

/** The long form, for the head of a thread: "03 Sep, 14:32". */
export const stampWords = (iso: string | null | undefined): string => {
  const d = parse(iso);
  if (!d) return "";
  return d.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/* ── Calendar dates and wall-clock times, as dine-in sends them ───────────
   A table booking arrives with its day and time already in words
   (`dayLabel`, `timeLabel`), and those are what a card shows. A BLOCKED day
   does not — the settings answer carries `"2026-10-08"` and `"19:30"` bare —
   so these write them the way the server writes a booking's, and build the
   `YYYY-MM-DD` it expects back from what a picker returns.

   Built from the date's own parts rather than `toISOString`, which is UTC:
   a date picked before 05:30 in India would otherwise be sent as yesterday. */

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** A picked date as the server's `YYYY-MM-DD`, on this device's calendar. */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `YYYY-MM-DD` back into a local midnight, for a picker's starting value. */
export const fromDayKey = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** "Today", "Tomorrow" or "Thu 8 Oct" — the server's own words for a day. */
export const dayWords = (key: string): string => {
  const d = fromDayKey(key);
  if (Number.isNaN(d.getTime())) return key;
  const today = new Date();
  if (dayKey(today) === key) return "Today";
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (dayKey(tomorrow) === key) return "Tomorrow";
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
};

/** "19:30" → "7:30 pm", as the server writes a booking's time. */
export const slotWords = (hhmm: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!match) return hhmm;
  const h = Number(match[1]);
  return `${((h + 11) % 12) + 1}:${match[2]} ${h >= 12 ? "pm" : "am"}`;
};
