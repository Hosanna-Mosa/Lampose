/* ══════════════════════════════════════════════════════════════════════════
   Stay intent — what a customer is actually asking for, and what it costs.

   ONE implementation, deliberately. Two callers need the same answers and
   must not be allowed to disagree:

     utils/listingFormatter.js     offers the choices to the browser
     controllers/visitRequestController.js
                                   re-derives them to check what came back

   If the offer and the check used separate maths, a posted body could name a
   price the page never showed. Everything here is derived from fields the
   `properties` collection already has — no schema change, and nothing is
   invented when a field is missing.
   ══════════════════════════════════════════════════════════════════════════ */

const DAY_MS = 24 * 60 * 60 * 1000;

/* Booking windows. The floor is notice for the owner; the ceiling stops a
   request being made about a room nobody can speak for that far out. */
const JOIN_MIN_DAYS = 2;
const JOIN_MAX_MONTHS = 2;

const SHORT_MAX_DAYS = 7;

/* A hotel is asked for dates, not a duration, so its ceiling is a number of
   nights rather than a rung on the short/long ladder. Thirty is a month —
   past that somebody is renting, not staying, and should be looking at a PG. */
const HOTEL_MAX_NIGHTS = 30;

/* The three ways a hotel bed is sold. Order is the order the page offers
   them, and the first one an owner priced becomes the default. */
const RATE_STRUCTURES = ['nightly', 'monthly', 'flexible'];
const RATE_LABEL = { nightly: 'by the night', monthly: 'by the month', flexible: 'by the hour' };
const RATE_UNIT = { nightly: 'day', monthly: 'month', flexible: 'day' };

/*
 * How much of it, and what a sane amount is.
 *
 * Each structure is bought in its own unit, and only the nightly one can be
 * read off a pair of dates. A guest paying by the hour picks hours and leaves
 * the same day; a guest paying by the month picks months and the check-out
 * follows from the check-in. Asking all three for a check-out produced an
 * hourly booking that had to last at least one night.
 */
const RATE_QUANTITY = {
  nightly: { unit: 'nights', min: 1, max: HOTEL_MAX_NIGHTS, fromDates: true },
  monthly: { unit: 'months', min: 1, max: 12, fromDates: false },
  flexible: { unit: 'hours', min: 1, max: 24, fromDates: false },
};

/** check-in + n months, as a date-only string. */
const addMonths = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};
const LONG_LADDER = [1, 3, 6, 12];

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* ── Dates ───────────────────────────────────────────────────────────────
   Date-only, compared as YYYY-MM-DD strings in UTC. A Date object would drag
   the server's timezone into a decision the customer made in theirs, and
   "today + 2" would land differently either side of midnight. */

const toISODate = (date) => date.toISOString().slice(0, 10);

const todayISO = () => toISODate(new Date());

const addDaysISO = (iso, days) => toISODate(new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS));

const addMonthsISO = (iso, months) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // 31 Jan + 1 month is 28/29 Feb, not 2/3 March.
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return toISODate(d);
};

const isISODate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** The window a joining date must fall inside, inclusive at both ends. */
const joinWindow = () => {
  const today = todayISO();
  return { min: addDaysISO(today, JOIN_MIN_DAYS), max: addMonthsISO(today, JOIN_MAX_MONTHS) };
};

/* ── Rates ───────────────────────────────────────────────────────────────── */

/**
 * Which stay lengths this property actually quotes a price for.
 *
 * `stayType` on the document says what the owner intended to offer, but a
 * price is what makes it bookable — an owner who picked "Both" and filled in
 * only a monthly figure cannot sell a night. Availability follows the money.
 */
const stayRatesFor = (doc) => {
  const daily = num(doc && doc.dailyPrice);
  const monthly = num(doc && doc.monthlyPrice) || num(doc && doc.rent);
  const declared = String((doc && doc.stayType) || '').toLowerCase();

  const shortAllowed = declared.includes('short') || declared.includes('both') || !declared;
  const longAllowed = declared.includes('long') || declared.includes('both') || !declared;

  return {
    short: {
      available: Boolean(daily) && shortAllowed,
      dailyPrice: daily,
      maxDays: SHORT_MAX_DAYS,
      label: doc && doc.shortStayDuration ? String(doc.shortStayDuration) : null,
    },
    long: {
      available: Boolean(monthly) && longAllowed,
      monthlyPrice: monthly,
      monthOptions: longMonthOptions(doc),
      label: doc && doc.longStayDuration ? String(doc.longStayDuration) : null,
    },
  };
};

/**
 * Month choices for a long stay.
 *
 * `longStayDuration` is free text from the panel — "1 Month+", "6 months min".
 * A leading number is read as the owner's minimum and the standard ladder is
 * filtered to it, so a six-month-minimum property never offers one month.
 * Unparseable text falls back to the whole ladder rather than blocking.
 */
const longMonthOptions = (doc) => {
  const text = String((doc && doc.longStayDuration) || '');
  const matched = text.match(/\d+/);
  const min = matched ? Number(matched[0]) : 1;
  const floor = Number.isFinite(min) && min > 0 && min <= 24 ? min : 1;

  const options = LONG_LADDER.filter((m) => m > floor);
  return [floor, ...options].filter((m, i, all) => all.indexOf(m) === i).sort((a, b) => a - b);
};

/** Day choices for a short stay: 1..7, or fewer if the panel says so. */
const shortDayOptions = (doc) => {
  const text = String((doc && doc.shortStayDuration) || '');
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  const max = range ? Number(range[2]) : SHORT_MAX_DAYS;
  const cap = Number.isFinite(max) && max > 0 && max <= SHORT_MAX_DAYS ? max : SHORT_MAX_DAYS;
  return Array.from({ length: cap }, (unused, i) => i + 1);
};

/* ── Pricing ─────────────────────────────────────────────────────────────── */

/**
 * The rate a given sharing option costs at a given stay type.
 *
 * `sharingPrices` in the panel are monthly figures. A property quoting both
 * lengths therefore has a per-option monthly price but only a headline daily
 * one, so a short stay is priced from `dailyPrice` — the honest answer, since
 * no per-option nightly rate exists to read.
 */
const rateFor = ({ doc, stayType, sharingOption }) => {
  const rates = stayRatesFor(doc);
  if (stayType === 'short') {
    return rates.short.available
      ? { amount: rates.short.dailyPrice, unit: 'day', perUnitLabel: '/day' }
      : null;
  }
  if (stayType === 'long') {
    const perOption = sharingOption && num(sharingOption.price);
    const amount = perOption || rates.long.monthlyPrice;
    return amount ? { amount, unit: 'month', perUnitLabel: '/mo' } : null;
  }
  return null;
};

/**
 * The first month, pro-rated from the joining date.
 *
 * Charged for the nights actually occupied in the joining month: the monthly
 * rate divided by that month's own length, times the days remaining including
 * the joining day. February is 28 or 29 here, not an averaged 30, because the
 * customer can count the days on a calendar and will.
 *
 * Returns null for anything but a long stay, or when a date has not been
 * chosen yet — there is nothing to pro-rate.
 */
const proratedFirstMonth = ({ monthlyAmount, joiningDate }) => {
  const monthly = num(monthlyAmount);
  if (!monthly || !isISODate(joiningDate)) return null;

  const d = new Date(`${joiningDate}T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const daysCharged = daysInMonth - d.getUTCDate() + 1;

  // Joining on the 1st is a whole month; no discount, no rounding artefact.
  if (daysCharged >= daysInMonth) {
    return { amount: Math.round(monthly), daysCharged: daysInMonth, daysInMonth, full: true };
  }

  return {
    amount: Math.round((monthly / daysInMonth) * daysCharged),
    daysCharged,
    daysInMonth,
    full: false,
  };
};

/* ── Validation ──────────────────────────────────────────────────────────── */

/**
 * Checks a posted intent against what the property actually offers, and
 * returns the intent rebuilt from the property's own numbers.
 *
 * Nothing priced is taken from the caller. The sharing label is the only
 * thing believed, and only long enough to look it up.
 *
 * @returns {{ ok: true, intent: object } | { ok: false, code: string, message: string }}
 */
const validateIntent = ({ doc, intent, sharingOption, simplePath, datesPath }) => {
  const given = intent || {};
  const rates = stayRatesFor(doc);

  /* No intent at all is a client written before this existed — the mobile
     app, or a browser holding an older bundle. Those requests were valid
     yesterday and stay valid: they carry sharing and contact details, the
     owner still gets a useful message, and nothing about them was ever
     priced by the caller. A PARTIAL intent is a different matter and is
     checked in full below; only its complete absence is waved through. */
  const suppliedIntent = intent !== null && intent !== undefined
    && typeof intent === 'object'
    && Object.values(intent).some((v) => v !== null && v !== undefined && v !== '');

  /* BACHELOR and COLIVE price by the bed, not by stay length. The panel
     records no daily rate and no month ladder for them, so the page asks for
     sharing alone and there is no stay type to check. */
  if (simplePath || !suppliedIntent) {
    return {
      ok: true,
      legacy: !suppliedIntent && !simplePath,
      intent: {
        stayType: null,
        duration: null,
        durationUnit: null,
        joiningDate: isISODate(given.joiningDate) ? given.joiningDate : null,
        flexibleJoin: given.flexibleJoin === true,
        proratedFirstMonth: null,
      },
    };
  }

  /*
   * A hotel is booked by dates, and everything downstream still speaks
   * durations.
   *
   * So the two dates are validated here and then RESOLVED into the same
   * intent shape a short stay produces — `stayType: 'short'`, a duration in
   * nights, and the check-in as the joining date. The owner's WhatsApp
   * message, the pricing and the stored request all keep working without
   * learning a second vocabulary, and the one thing they gain is `checkOut`.
   *
   * Doing it the other way round — a parallel hotel branch through pricing
   * and messaging — is how the offer and the check drift apart, which is the
   * failure this whole file exists to prevent.
   */
  if (datesPath) {
    const { checkIn } = given;

    if (!isISODate(checkIn)) {
      return { ok: false, code: 'BAD_CHECK_IN', message: 'Please choose a check-in date.' };
    }

    const window = joinWindow();
    if (checkIn < window.min || checkIn > window.max) {
      return {
        ok: false,
        code: 'CHECK_IN_OUT_OF_RANGE',
        window,
        message: `Check-in must be between ${window.min} and ${window.max}.`,
      };
    }

    /*
     * Which structure, offered only where this owner priced one.
     *
     * A hostel sells the same bed by the night, by the month and by the hour,
     * often at rates that are not multiples of each other — so it is a choice
     * the guest makes, not something to infer from how long they stay.
     */
    const priced = (sharingOption && sharingOption.rates) || {};
    const available = RATE_STRUCTURES.filter((id) => num(priced[id]));

    if (!available.length) {
      return { ok: false, code: 'NO_RATE', message: 'This property has no price for that bed.' };
    }

    const structure = String(given.rateStructure || '').toLowerCase() || available[0];
    if (!RATE_STRUCTURES.includes(structure)) {
      return { ok: false, code: 'BAD_RATE_STRUCTURE', message: 'Choose how you want to be charged.' };
    }
    if (!available.includes(structure)) {
      return {
        ok: false,
        code: 'RATE_STRUCTURE_UNAVAILABLE',
        options: available,
        message: `That bed is not sold ${RATE_LABEL[structure]}.`,
      };
    }

    const spec = RATE_QUANTITY[structure];
    let quantity;
    let checkOut;

    if (spec.fromDates) {
      /* Nights are the one quantity a pair of dates already answers, so it is
         read rather than asked twice. */
      if (!isISODate(given.checkOut)) {
        return { ok: false, code: 'BAD_CHECK_OUT', message: 'Please choose a check-out date.' };
      }
      checkOut = given.checkOut;
      quantity = Math.round(
        (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / DAY_MS,
      );
      if (quantity < 1) {
        return {
          ok: false,
          code: 'BAD_STAY_LENGTH',
          message: 'Check-out has to be at least the day after check-in.',
        };
      }
    } else {
      quantity = Number(given.rateQuantity);
      /* Hours and months are the guest's answer, and the check-out follows
         from it — a booking cannot end on a date nobody derived. */
      checkOut = structure === 'monthly' ? addMonths(checkIn, quantity) : checkIn;
    }

    if (!Number.isInteger(quantity) || quantity < spec.min || quantity > spec.max) {
      return {
        ok: false,
        code: 'BAD_RATE_QUANTITY',
        unit: spec.unit,
        message: `How many ${spec.unit}? Enter a number from ${spec.min} to ${spec.max}.`,
      };
    }

    const amount = num(priced[structure]);

    return {
      ok: true,
      intent: {
        stayType: 'short',
        /* `duration` stays in nights for the readers that predate this. An
           hourly booking is same-day, which is zero nights. */
        duration: structure === 'nightly' ? quantity : null,
        durationUnit: structure === 'nightly' ? 'days' : null,
        joiningDate: checkIn,
        checkIn,
        checkOut,
        rateStructure: structure,
        rateQuantity: quantity,
        rateQuantityUnit: spec.unit,
        flexibleJoin: given.flexibleJoin === true,
        rateAmount: amount,
        rateUnit: RATE_UNIT[structure],
        /* Every structure now knows how much of it was bought, so all three
           can be totalled honestly. */
        totalAmount: amount * quantity,
        proratedFirstMonth: null,
      },
    };
  }

  const stayType = String(given.stayType || '').toLowerCase();
  if (stayType !== 'short' && stayType !== 'long') {
    return { ok: false, code: 'BAD_STAY_TYPE', message: 'Please choose a short or long stay.' };
  }
  if (!rates[stayType].available) {
    return {
      ok: false,
      code: 'STAY_TYPE_UNAVAILABLE',
      message: stayType === 'short'
        ? 'This property is not offered for short stays.'
        : 'This property is not offered for long stays.',
    };
  }

  const duration = Number(given.duration);
  if (!Number.isInteger(duration) || duration < 1) {
    return { ok: false, code: 'BAD_DURATION', message: 'Please choose how long you want to stay.' };
  }

  const allowed = stayType === 'short' ? shortDayOptions(doc) : longMonthOptions(doc);
  if (!allowed.includes(duration)) {
    return {
      ok: false,
      code: 'BAD_DURATION',
      options: allowed,
      message: stayType === 'short'
        ? `Short stays here are ${allowed[0]}–${allowed[allowed.length - 1]} days.`
        : `Long stays here start at ${allowed[0]} month${allowed[0] === 1 ? '' : 's'}.`,
    };
  }

  const unit = stayType === 'short' ? 'days' : 'months';
  const givenUnit = String(given.durationUnit || unit).toLowerCase();
  if (givenUnit !== unit) {
    return { ok: false, code: 'BAD_DURATION_UNIT', message: `That duration should be in ${unit}.` };
  }

  if (!isISODate(given.joiningDate)) {
    return { ok: false, code: 'BAD_JOIN_DATE', message: 'Please choose a joining date.' };
  }
  const window = joinWindow();
  if (given.joiningDate < window.min || given.joiningDate > window.max) {
    return {
      ok: false,
      code: 'JOIN_DATE_OUT_OF_RANGE',
      window,
      message: `Joining date must be between ${window.min} and ${window.max}.`,
    };
  }

  if (given.flexibleJoin !== true && given.flexibleJoin !== false) {
    return { ok: false, code: 'BAD_FLEXIBLE', message: 'Please say whether your dates are flexible.' };
  }

  const rate = rateFor({ doc, stayType, sharingOption });
  if (!rate) {
    return { ok: false, code: 'NO_RATE', message: 'This property has no price for that stay.' };
  }

  return {
    ok: true,
    intent: {
      stayType,
      duration,
      durationUnit: unit,
      joiningDate: given.joiningDate,
      flexibleJoin: given.flexibleJoin === true,
      rateAmount: rate.amount,
      rateUnit: rate.unit,
      totalAmount: stayType === 'short' ? rate.amount * duration : null,
      proratedFirstMonth: stayType === 'long'
        ? proratedFirstMonth({ monthlyAmount: rate.amount, joiningDate: given.joiningDate })
        : null,
    },
  };
};

/* ── Presentation ────────────────────────────────────────────────────────── */

/** "3 months from 1 Sep 2026, flexible by a day or two" — omits what is absent. */
const describeIntent = (intent) => {
  if (!intent) return '';

  /* A hotel stay reads as the two dates, because that is what was asked for
     and what the owner needs to check against a calendar. "3 days from 14 Sep"
     makes them work out the 17th themselves. */
  if (intent.checkIn && intent.checkOut) {
    const day = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', timeZone: 'UTC',
    });
    const qty = intent.rateQuantity || intent.duration || 1;
    const unit = (intent.rateQuantityUnit || 'nights').replace(/s$/, '');
    const amount = `${qty} ${unit}${qty === 1 ? '' : 's'}`;

    /* Nights read as a range because that is how a calendar is checked; hours
       read as a single day, because that is what they are. */
    if (intent.rateStructure === 'flexible') return `${amount} on ${day(intent.checkIn)}`;
    if (intent.rateStructure === 'monthly') return `${amount} from ${day(intent.checkIn)}`;
    return `${amount}, ${day(intent.checkIn)} to ${day(intent.checkOut)}`;
  }

  const parts = [];

  if (intent.duration && intent.durationUnit) {
    const unit = intent.duration === 1 ? intent.durationUnit.replace(/s$/, '') : intent.durationUnit;
    parts.push(`${intent.duration} ${unit}`);
  }

  if (intent.joiningDate) {
    const d = new Date(`${intent.joiningDate}T00:00:00Z`);
    const when = d.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
    parts.push(parts.length ? `from ${when}` : `joining ${when}`);
  }

  let text = parts.join(' ');
  if (intent.flexibleJoin) text += text ? ', flexible by a day or two' : 'flexible dates';
  return text;
};

module.exports = {
  JOIN_MIN_DAYS,
  JOIN_MAX_MONTHS,
  SHORT_MAX_DAYS,
  HOTEL_MAX_NIGHTS,
  RATE_STRUCTURES,
  RATE_LABEL,
  RATE_QUANTITY,
  todayISO,
  isISODate,
  joinWindow,
  stayRatesFor,
  longMonthOptions,
  shortDayOptions,
  rateFor,
  proratedFirstMonth,
  validateIntent,
  describeIntent,
};
