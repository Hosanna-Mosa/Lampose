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
