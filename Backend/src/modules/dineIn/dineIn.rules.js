/* ══════════════════════════════════════════════════════════════════════════
   Dine-in — the rules, with no database in them.

   A restaurant that switches dine-in on describes its floor (table types,
   AC / Non-AC, indoor / outdoor, parking …) and diners book a table for a
   party at a time. Everything here is a pure function of a restaurant
   document, a date and the clock, so the slot grid a diner sees, the check a
   booking passes and the test that pins them are the same code.

   ## The fixed numbers

   Chosen once for every restaurant rather than per kitchen, because a setting
   nobody asked for is a setting nobody maintains:

     SLOT_MINUTES          30   a booking starts on the half hour
     HOLD_MINUTES          90   a table is held for a sitting this long
     DAYS_AHEAD             7   today and the next six days
     LEAD_MINUTES          30   no booking for a table in under half an hour
     LAST_SLOT_BEFORE_CLOSE 60  the last sitting starts an hour before closing
     MAX_PARTY             10   the largest party one booking takes
     MAX_SPARE_SEATS        2   a table a party PICKS seats at most this many more
     RESPOND_MINUTES       15   the restaurant's window to accept or decline
     GRACE_MINUTES         15   a confirmed table waits this long past its time
     CUSTOMER_CANCEL_BEFORE 30  a confirmed table can be cancelled until then
     REMINDER_BEFORE       60   the diner is reminded an hour before

   ## Every table has a number

   A table type is `{ seats, count, prefix, numbers }` — "4-seater × 10,
   A1–A10". The prefix is the type's letter (A, B, C… in the order the
   restaurant lists them, editable) and `numbers` names each table; any
   number may be renamed ("T5", "Window 2") and every number is unique across
   the floor. A floor saved before numbering is read with the default letters
   and numbers (`normaliseTypes`), so it needs no migration.

   A hold on the ledger names its TABLE. A diner may ask for one ("A3"), which
   must seat the party with at most MAX_SPARE_SEATS to spare, so a couple
   cannot take the only ten-seater; with no table asked for, the smallest free
   table that seats the party is given, as before. A hold with no table (made
   before numbering) or naming a table since renamed is treated as holding the
   first free table of its size, so neither can ever be double-booked.

   ## Seating Capacity and Number of Tables are DERIVED

   From the table types (`2-seater × 6, 4-seater × 4`), never typed. Two
   numbers entered beside a list that already implies them is three answers
   to one question, and the first time they disagree a booking would be
   refused against one and accepted against another.

   ## Times are India's

   Every date here is a calendar date in Asia/Kolkata (`YYYY-MM-DD`) and every
   time a wall-clock `HH:MM` there — the same convention as `openingHours`.
   ══════════════════════════════════════════════════════════════════════════ */
const SLOT_MINUTES = 30;
const HOLD_MINUTES = 90;
const DAYS_AHEAD = 7;
const LEAD_MINUTES = 30;
const LAST_SLOT_BEFORE_CLOSE = 60;
const MAX_PARTY = 10;
const MAX_SPARE_SEATS = 2;
const RESPOND_MINUTES = 15;
const GRACE_MINUTES = 15;
const CUSTOMER_CANCEL_BEFORE = 30;
const REMINDER_BEFORE = 60;

const MAX_SEATS_PER_TABLE = 20;
const MAX_TABLES_PER_TYPE = 100;
const MAX_TABLES = 300;
/* A table's number: letters, digits, spaces and hyphens, up to 12. */
const TABLE_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 -]{0,11}$/;
const PREFIX = /^[A-Za-z]{1,3}$/;

const AC_SEATING = ['ac', 'non_ac', 'both'];
const SMOKING = ['non_smoking', 'smoking_area'];

/* Same order and spelling as `openingHours.day` on the restaurant. */
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const IST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});
const IST_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/* ── Clock ───────────────────────────────────────────────────────────────── */

/** Today's date in India, `YYYY-MM-DD`. */
const istDate = (at = new Date()) => IST_DATE.format(at);

/** Minutes since midnight in India. */
const istMinutes = (at = new Date()) => {
  const [h, m] = IST_TIME.format(at).split(':').map(Number);
  return (h * 60) + m;
};

const toMinutes = (hhmm) => {
  if (typeof hhmm !== 'string' || !HHMM.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return (h * 60) + m;
};

const toHHMM = (minutes) => {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** The instant a wall-clock time on an Indian date happens. */
const instantOf = (date, time) => new Date(`${date}T${time}:00+05:30`);

/** `YYYY-MM-DD` plus whole days, on the calendar rather than the clock. */
const addDays = (date, days) => {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
};

/** "Monday" … "Sunday" for a calendar date. */
const weekdayOf = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  const sundayFirst = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAYS[(sundayFirst + 6) % 7];
};

const isDate = (value) => typeof value === 'string' && DATE.test(value)
  && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Today and the next DAYS_AHEAD − 1 days. */
const bookableDates = (at = new Date()) => {
  const today = istDate(at);
  return Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
};

/* ── Settings ────────────────────────────────────────────────────────────── */

const yesNo = (value) => {
  if (value === true || value === false) return value;
  if (value === 'true' || value === 'yes') return true;
  if (value === 'false' || value === 'no') return false;
  return null;
};

/** The default letter of the type at `index`: A … Z, then AA, AB … */
const prefixFor = (index) => {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

const tidyNumber = (value) => String(value === null || value === undefined ? '' : value).trim().replace(/\s+/g, ' ');

/**
 * A type's table numbers, exactly `count` of them: the ones given (kept in
 * order), then `<prefix><n>` for the next n not already taken anywhere on the
 * floor. `taken` is shared across types and filled as numbers are handed out.
 */
const numbersFor = ({ prefix, count, given = [], taken }) => {
  const out = [];
  for (const raw of given) {
    if (out.length >= count) break;
    const number = tidyNumber(raw);
    if (number) out.push(number);
  }
  out.forEach((number) => taken.add(number.toLowerCase()));
  for (let n = 1; out.length < count; n += 1) {
    const number = `${prefix}${n}`;
    if (!taken.has(number.toLowerCase())) {
      out.push(number);
      taken.add(number.toLowerCase());
    }
  }
  return out;
};

/**
 * Table types as stored — `[{ seats, count, prefix, numbers }]` — from a
 * request body, in the order the restaurant listed them. Two rows with the
 * same seats are two types now (4-seaters inside, 4-seaters on the terrace),
 * each with its own letter and numbers.
 */
const readTableTypes = (raw, problems) => {
  if (!Array.isArray(raw)) return [];
  const rows = [];
  raw.forEach((row, index) => {
    const seats = Number(row && row.seats);
    const count = Number(row && row.count);
    if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS_PER_TABLE) {
      problems.push(`table type ${index + 1}: seats must be a whole number from 1 to ${MAX_SEATS_PER_TABLE}`);
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_TABLES_PER_TYPE) {
      problems.push(`table type ${index + 1}: number of tables must be a whole number from 1 to ${MAX_TABLES_PER_TYPE}`);
      return;
    }
    const prefixRaw = tidyNumber(row && row.prefix).toUpperCase();
    if (prefixRaw && !PREFIX.test(prefixRaw)) {
      problems.push(`table type ${index + 1}: the letter must be 1 to 3 letters, like A or VIP`);
      return;
    }
    const given = Array.isArray(row && row.numbers) ? row.numbers.map(tidyNumber).filter(Boolean) : [];
    const bad = given.find((number) => !TABLE_NUMBER.test(number));
    if (bad) {
      problems.push(`table "${bad}": a table number is up to 12 letters, digits, spaces or hyphens`);
      return;
    }
    rows.push({ seats, count, prefix: prefixRaw, given });
  });

  /* Letters first, so a default never reuses a letter typed on a later row. */
  const usedPrefixes = new Set(rows.map((row) => row.prefix).filter(Boolean));
  let next = 0;
  rows.forEach((row) => {
    if (row.prefix) return;
    while (usedPrefixes.has(prefixFor(next))) next += 1;
    row.prefix = prefixFor(next);
    usedPrefixes.add(row.prefix);
  });

  /* Typed numbers are reserved before any default is made, then checked for
     repeats across the whole floor. */
  const taken = new Set();
  const seen = new Map();
  rows.forEach((row) => row.given.slice(0, row.count).forEach((number) => {
    const key = number.toLowerCase();
    if (seen.has(key)) problems.push(`table number ${number} is used twice — every table needs its own`);
    seen.set(key, true);
    taken.add(key);
  }));

  return rows.map((row) => ({
    seats: row.seats,
    count: row.count,
    prefix: row.prefix,
    numbers: numbersFor({ prefix: row.prefix, count: row.count, given: row.given, taken }),
  }));
};

/**
 * Stored table types, made whole: a floor saved before tables had numbers is
 * given the default letters and numbers, and a list whose length no longer
 * matches its count is topped up or trimmed. Read-only — nothing is saved.
 */
const normaliseTypes = (tableTypes = []) => {
  const problems = [];
  const types = readTableTypes((tableTypes || []).map((t) => ({
    seats: t.seats,
    count: t.count,
    prefix: t.prefix,
    numbers: Array.isArray(t.numbers) ? [...t.numbers] : [],
  })), problems);
  return types;
};

/** Every table on the floor, `[{ number, seats }]`, in the restaurant's order. */
const tablesOf = (tableTypes = []) => normaliseTypes(tableTypes)
  .flatMap((type) => type.numbers.map((number) => ({ number, seats: type.seats })));

const totalsOf = (tableTypes = []) => ({
  tableCount: tableTypes.reduce((sum, t) => sum + t.count, 0),
  seatingCapacity: tableTypes.reduce((sum, t) => sum + (t.seats * t.count), 0),
});

/**
 * The dine-in section a restaurant saves, read from a request body.
 *
 * Returns `{ settings, problems }`. A restaurant may save a half-finished form
 * with dine-in OFF — the required fields are only required to switch it on,
 * because that is the moment a diner would see them.
 */
const buildSettings = (body = {}, previous = {}) => {
  const problems = [];
  const pick = (key) => (body[key] === undefined ? previous[key] : body[key]);

  const tableTypes = body.tableTypes === undefined
    ? normaliseTypes(previous.tableTypes || [])
    : readTableTypes(body.tableTypes, problems);
  const { tableCount, seatingCapacity } = totalsOf(tableTypes);
  if (tableCount > MAX_TABLES) problems.push(`at most ${MAX_TABLES} tables in all`);

  const acRaw = pick('acSeating');
  const acSeating = AC_SEATING.includes(acRaw) ? acRaw : null;
  if (acRaw !== undefined && acRaw !== null && acRaw !== '' && !acSeating) {
    problems.push('AC / Non-AC must be ac, non_ac or both');
  }

  const smokingRaw = pick('smoking');
  const smoking = SMOKING.includes(smokingRaw) ? smokingRaw : null;
  if (smokingRaw !== undefined && smokingRaw !== null && smokingRaw !== '' && !smoking) {
    problems.push('Smoking must be non_smoking or smoking_area');
  }

  const settings = {
    enabled: yesNo(pick('enabled')) === true,
    paused: yesNo(pick('paused')) === true,
    tableTypes,
    tableCount,
    seatingCapacity,
    acSeating,
    indoorSeating: yesNo(pick('indoorSeating')),
    outdoorSeating: yesNo(pick('outdoorSeating')) === true,
    familySeating: yesNo(pick('familySeating')) === true,
    coupleSeating: yesNo(pick('coupleSeating')) === true,
    smoking,
    wheelchairAccessible: yesNo(pick('wheelchairAccessible')) === true,
    parkingAvailable: yesNo(pick('parkingAvailable')),
    valetParking: yesNo(pick('valetParking')) === true,
    kidsFriendly: yesNo(pick('kidsFriendly')) === true,
    petFriendly: yesNo(pick('petFriendly')) === true,
  };

  if (settings.enabled) {
    if (!tableTypes.length) problems.push('at least one table type (seats and how many tables)');
    if (!settings.acSeating) problems.push('AC / Non-AC seating');
    if (settings.indoorSeating === null) problems.push('whether there is indoor seating');
    if (settings.parkingAvailable === null) problems.push('whether parking is available');
    if (settings.indoorSeating === false && !settings.outdoorSeating) {
      problems.push('indoor or outdoor seating — a table has to be somewhere');
    }
  }
  if (settings.valetParking && settings.parkingAvailable === false) {
    problems.push('valet parking needs parking available');
  }

  return { settings, problems };
};

/* ── Slots ───────────────────────────────────────────────────────────────── */

const roundUpToSlot = (minutes) => Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;

/**
 * Every start time on a date, from the restaurant's opening hours, before
 * anything is taken or blocked.
 *
 * A sitting starts on the half hour, no earlier than opening and no later than
 * an hour before closing. A slot that crosses midnight contributes its evening
 * to its own day and its small hours to the next; a sitting never starts
 * after 23:30 on the date it is booked for.
 */
const slotTimesFor = (openingHours = [], date) => {
  const weekday = weekdayOf(date);
  const yesterday = WEEKDAYS[(WEEKDAYS.indexOf(weekday) + 6) % 7];
  const times = new Set();
  const add = (from, to) => {
    for (let m = roundUpToSlot(from); m <= to; m += SLOT_MINUTES) {
      if (m >= 0 && m < 1440) times.add(toHHMM(m));
    }
  };

  for (const row of openingHours || []) {
    const opens = toMinutes(row && row.openTime);
    const closes = toMinutes(row && row.closeTime);
    if (opens === null || closes === null || opens === closes) continue;

    if (closes > opens) {
      if (row.day === weekday) add(opens, closes - LAST_SLOT_BEFORE_CLOSE);
    } else {
      /* Crosses midnight: tonight from opening, last of the night by 23:30. */
      if (row.day === weekday) add(opens, Math.min(1440 - SLOT_MINUTES, closes + 1440 - LAST_SLOT_BEFORE_CLOSE));
      /* …and the small hours of yesterday's late slot. */
      if (row.day === yesterday) add(0, closes - LAST_SLOT_BEFORE_CLOSE);
    }
  }
  return [...times].sort();
};

/** Is this hold still holding a table at `now`? */
const holdIsLive = (hold, now = new Date()) => !hold.expiresAt || new Date(hold.expiresAt) > now;

const overlaps = (hold, startMin, endMin) => hold.startMin < endMin && hold.endMin > startMin;

/**
 * Every live hold, each naming a table on this floor.
 *
 * A hold that names a table still on the floor keeps it. One that does not —
 * made before tables were numbered, or naming a table since renamed — is
 * given the first table of its size that is free across its sitting, so it
 * still holds a real table and nothing can be booked on top of it.
 */
const resolveHolds = (tables, holds = [], now = new Date()) => {
  const byKey = new Map(tables.map((t) => [t.number.toLowerCase(), t]));
  const live = holds.filter((h) => holdIsLive(h, now));
  const placed = [];
  const orphans = [];
  live.forEach((h) => {
    const table = h.table && byKey.get(String(h.table).toLowerCase());
    if (table) placed.push({ ...h, table: table.number });
    else orphans.push(h);
  });
  orphans.forEach((h) => {
    const table = tables.find((t) => t.seats === h.seats
      && !placed.some((p) => p.table === t.number && overlaps(p, h.startMin, h.endMin)));
    if (table) placed.push({ ...h, table: table.number });
  });
  return placed;
};

/** Is this table free for a whole sitting from `startMin`? */
const isFree = (table, resolved, startMin) => {
  const endMin = startMin + HOLD_MINUTES;
  return !resolved.some((h) => h.table === table.number && overlaps(h, startMin, endMin));
};

/** May a party of `partySize` ask for this table? */
const fitsParty = (table, partySize) => table.seats >= partySize && table.seats - partySize <= MAX_SPARE_SEATS;

/**
 * The table a party gets at a start time — `{ number, seats }` — or null when
 * none is free.
 *
 * With `table` asked for, that table or nothing: it must exist, seat the party
 * with at most MAX_SPARE_SEATS to spare, and be free for the whole sitting;
 * `problem` says which of those failed. With none asked for, the SMALLEST free
 * table that seats the party — a couple is never given the only six-seater
 * while a two-seater stands empty.
 */
const tableFor = ({ tableTypes = [], holds = [], startMin, partySize, now = new Date(), table = null }) => {
  const tables = tablesOf(tableTypes);
  const resolved = resolveHolds(tables, holds, now);
  if (table) {
    const asked = tables.find((t) => t.number.toLowerCase() === tidyNumber(table).toLowerCase());
    if (!asked) return { table: null, problem: 'NO_SUCH_TABLE' };
    if (asked.seats < partySize) return { table: null, problem: 'TABLE_TOO_SMALL' };
    if (!fitsParty(asked, partySize)) return { table: null, problem: 'TABLE_TOO_BIG' };
    if (!isFree(asked, resolved, startMin)) return { table: null, problem: 'TABLE_TAKEN' };
    return { table: asked, problem: null };
  }
  const fits = tables
    .map((t, order) => ({ ...t, order }))
    .filter((t) => t.seats >= partySize)
    .sort((a, b) => a.seats - b.seats || a.order - b.order);
  const free = fits.find((t) => isFree(t, resolved, startMin));
  return free ? { table: { number: free.number, seats: free.seats }, problem: null } : { table: null, problem: 'FULL' };
};

/**
 * The tables a party may pick from at one time — those that seat it with at
 * most MAX_SPARE_SEATS to spare — each with whether it is free.
 */
const tablesAt = ({ tableTypes = [], holds = [], startMin, partySize, now = new Date() }) => {
  const tables = tablesOf(tableTypes);
  const resolved = resolveHolds(tables, holds, now);
  return tables
    .map((t, order) => ({ ...t, order }))
    .filter((t) => fitsParty(t, partySize))
    .sort((a, b) => a.seats - b.seats || a.order - b.order)
    .map((t) => ({ number: t.number, seats: t.seats, available: isFree(t, resolved, startMin) }));
};

/** The largest party any table here can seat. *//** The largest party any table here can seat. */
const largestTable = (tableTypes = []) => tableTypes.reduce((max, t) => Math.max(max, t.seats), 0);

/** Can diners book here at all right now? */
const isBookable = (restaurant) => {
  const d = restaurant && restaurant.dineIn;
  return Boolean(d && d.enabled && !d.paused && Array.isArray(d.tableTypes) && d.tableTypes.length);
};

const isBlocked = (dineIn = {}, date, time) => (dineIn.blockedDates || []).includes(date)
  || (dineIn.blockedSlots || []).some((s) => s.date === date && (!time || s.time === time));

/**
 * The slot grid for one date and party.
 *
 * `[{ time, available, seats }]` — `seats` is the table the party would get.
 * Slots inside the lead time are left out rather than shown unavailable: a
 * time that has passed is not a full table.
 */
const slotGrid = ({ restaurant, date, partySize, holds = [], now = new Date() }) => {
  const dineIn = restaurant.dineIn || {};
  const today = istDate(now);
  const earliest = date === today ? istMinutes(now) + LEAD_MINUTES : -1;
  const dayBlocked = (dineIn.blockedDates || []).includes(date);

  return slotTimesFor(restaurant.openingHours, date)
    .filter((time) => toMinutes(time) >= earliest)
    .map((time) => {
      const blocked = dayBlocked || isBlocked({ blockedSlots: dineIn.blockedSlots }, date, time);
      const { table } = blocked ? { table: null } : tableFor({
        tableTypes: dineIn.tableTypes, holds, startMin: toMinutes(time), partySize, now,
      });
      return { time, available: table !== null, seats: table ? table.seats : null };
    });
};

/* ── Words ───────────────────────────────────────────────────────────────── */

/** "8:00 pm". */
const clockLabel = (hhmm) => {
  const m = toMinutes(hhmm);
  if (m === null) return hhmm;
  const h = Math.floor(m / 60);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${suffix}`;
};

/** "Today", "Tomorrow" or "Sat 11 Oct". */
const dayLabel = (date, now = new Date()) => {
  const today = istDate(now);
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
};

module.exports = {
  SLOT_MINUTES,
  HOLD_MINUTES,
  DAYS_AHEAD,
  LEAD_MINUTES,
  LAST_SLOT_BEFORE_CLOSE,
  MAX_PARTY,
  MAX_SPARE_SEATS,
  RESPOND_MINUTES,
  GRACE_MINUTES,
  CUSTOMER_CANCEL_BEFORE,
  REMINDER_BEFORE,
  AC_SEATING,
  SMOKING,
  istDate,
  istMinutes,
  toMinutes,
  toHHMM,
  instantOf,
  addDays,
  weekdayOf,
  isDate,
  bookableDates,
  buildSettings,
  normaliseTypes,
  tablesOf,
  prefixFor,
  totalsOf,
  slotTimesFor,
  holdIsLive,
  resolveHolds,
  tableFor,
  tablesAt,
  largestTable,
  isBookable,
  isBlocked,
  slotGrid,
  clockLabel,
  dayLabel,
};
