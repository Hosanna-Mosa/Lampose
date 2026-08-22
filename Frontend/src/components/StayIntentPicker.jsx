import { useEffect } from 'react';

import { rupees } from './ListingCard';

/* ══════════════════════════════════════════════════════════════════════════
   What the visitor is asking for: stay type, how long, which room, when they
   would move in, and whether that date can move.

   Every option here comes from the listing payload — `stayRates`,
   `durationOptions`, `sharingOptions`, `joinWindow` — which the API derives
   from the property and re-derives when the request comes back. Nothing is
   offered that the server would refuse, and no price is invented: a track
   with no rate recorded is simply not shown.

   Bachelor Room takes the simple path: it prices by the bed, so the panel
   records no daily rate and no month ladder, and the page asks for sharing
   alone rather than inventing a stay length to ask about.
   ══════════════════════════════════════════════════════════════════════════ */

const TRACKS = [
  { id: 'short', label: 'Short stay', hint: 'Nightly' },
  { id: 'long', label: 'Long stay', hint: 'Monthly' },
];

/* The joining date uses a native date input rather than a hand-built
   calendar: it gets the platform's own picker, keyboard handling and locale
   for free, and `min`/`max` disable everything outside the window without a
   line of date logic here. The server checks the same window regardless. */
const DateField = ({ value, window: win, onChange, label = 'Joining date', hint = true }) => (
  <label className="si-field">
    <span className="exp-lbl">{label}</span>
    <input
      type="date"
      className="si-date"
      value={value || ''}
      min={win?.min}
      max={win?.max}
      onChange={e => onChange(e.target.value || null)}
    />
    {win && hint && (
      <small className="si-hint">
        Anytime from {new Date(`${win.min}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        {' '}to {new Date(`${win.max}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
      </small>
    )}
  </label>
);

/*
 * What the picker asks depends on what is being asked for.
 *
 * A PG is a stay of some length starting on a date, so it asks for a track, a
 * duration and a joining date. A whole flat is let by the month and priced by
 * the bed, so it asks for the layout and when they would move in. A hotel is
 * booked between two dates for some number of people, and asking it "how many
 * days" and "joining date" separately made a guest do the arithmetic the
 * calendar should have done.
 *
 * The three read differently on purpose. The words for a bed in a shared room
 * and a whole 2 BHK should not be the same words.
 */
const COPY = {
  PG_HOSTEL: {
    options: 'Which room are you after?', option: 'Room type',
    priceUnit: '/mo', dateLabel: 'When would you join?',
  },
  BACHELOR: {
    options: 'Which layout do you want?', option: 'Layout',
    priceUnit: '/mo', dateLabel: 'When would you move in?',
  },
  COLIVE: {
    options: 'Which room do you want?', option: 'Room',
    priceUnit: '/mo', dateLabel: 'When would you move in?',
  },
  HOTEL: {
    options: 'Which bed do you want?', option: 'Bed type',
    priceUnit: '/night', dateLabel: 'When are you staying?',
  },
};

export default function StayIntentPicker({ listing, value, onChange }) {
  const rates = listing.stayRates || {};
  const durations = listing.durationOptions || {};
  const sharingOptions = listing.sharingOptions || [];
  const simple = listing.simpleSharingPath === true;
  /* A hotel is asked for two dates instead of a track and a duration. */
  const nightly = listing.category === 'HOTEL';
  /* Whether a confirmed visit here is paid for — and therefore whether the
     joining date is asked now or after the token. */
  const tokenRequired = listing.visitToken?.required === true;
  const copy = COPY[listing.category] || COPY.PG_HOSTEL;

  /* The night after check-in is the earliest sensible check-out, and moving
     check-in past an already-chosen check-out has to clear it rather than
     leave an impossible pair on screen. */
  /* Only the structures this owner priced for the chosen bed. */
  const RATE_META = [
    { id: 'nightly', label: 'Per night', unit: '/night' },
    { id: 'monthly', label: 'Per month', unit: '/mo' },
    { id: 'flexible', label: 'Hourly', unit: '/hr' },
  ];
  const rateChoices = nightly
    ? RATE_META
      .map(r => ({ ...r, price: value.sharing?.rates?.[r.id] }))
      .filter(r => Number(r.price) > 0)
    : [];
  const activeRate = rateChoices.find(r => r.id === (value.rateStructure || rateChoices[0]?.id))
    || rateChoices[0]
    || null;

  /* Each structure is bought in its own unit. Nights come off the dates; the
     other two are asked for. Kept in step with RATE_QUANTITY in
     Backend/src/modules/listings/stayIntent.util.js. */
  const QTY = {
    nightly: { unit: 'nights', min: 1, max: 30 },
    monthly: { unit: 'months', min: 1, max: 12 },
    flexible: { unit: 'hours', min: 1, max: 24 },
  };
  const structure = activeRate?.id || 'nightly';
  const byNight = structure === 'nightly';
  const qtySpec = QTY[structure];

  const nights = value.checkIn && value.checkOut
    ? Math.round((Date.parse(`${value.checkOut}T00:00:00Z`) - Date.parse(`${value.checkIn}T00:00:00Z`)) / 86400000)
    : 0;
  const quantity = byNight ? nights : Number(value.rateQuantity) || 0;
  const total = activeRate && quantity > 0 ? activeRate.price * quantity : 0;

  const dayAfter = (iso) => {
    if (!iso) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  const set = patch => onChange({ ...value, ...patch });

  /* Changing the track invalidates a duration measured in the other unit —
     "3" means months on one and days on the other. */
  const pickTrack = id => onChange({
    ...value,
    stayType: id,
    duration: null,
    durationUnit: id === 'short' ? 'days' : 'months',
  });

  const tracks = TRACKS.filter(t => rates[t.id]?.available);
  const units = value.stayType === 'short' ? durations.shortDays : durations.longMonths;

  /*
   * ── One option is not a choice, so it is the answer ─────────────────────
   *
   * A listing that offers a single room type, a single stay track or a single
   * duration was rendering that option unselected and keeping the button
   * disabled — with a hint telling the visitor to pick the only thing on
   * screen. There was nothing else to pick instead.
   *
   * Runs for each control independently, because choosing a track reveals the
   * durations for it: a property with one track and one duration answers both
   * in two passes rather than needing a special case for the pair.
   *
   * This is not the same as pre-selecting a default among alternatives, which
   * would be deciding a price on somebody's behalf. Where alternatives exist,
   * nothing is touched.
   */
  useEffect(() => {
    const patch = {};

    if (sharingOptions.length === 1 && !value.sharing) {
      patch.sharing = sharingOptions[0];
    }
    if (!nightly && !simple && tracks.length === 1 && !value.stayType) {
      patch.stayType = tracks[0].id;
      patch.durationUnit = tracks[0].id === 'short' ? 'days' : 'months';
    }
    /* Only once the track is settled — `units` is read from it. */
    if (!nightly && !simple && value.stayType && Array.isArray(units)
      && units.length === 1 && !value.duration) {
      patch.duration = units[0];
    }

    if (Object.keys(patch).length) onChange({ ...value, ...patch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharingOptions, tracks.length, units, value.stayType, value.sharing, value.duration]);
  const unitWord = value.stayType === 'short' ? 'day' : 'month';

  return (
    <section className="si">
      {/* ── Sharing — on both paths ─────────────────────────────────── */}
      {sharingOptions.length > 0 && (
        <div className="si-group">
          <span className="exp-lbl">
            {sharingOptions.length === 1 ? copy.option : copy.options}
          </span>
          <div className="si-opts" role="radiogroup" aria-label={copy.option}>
            {sharingOptions.map(opt => {
              const on = value.sharing?.label === opt.label;
              return (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`lst-share${on ? ' is-on' : ''}`}
                  onClick={() => set({ sharing: opt })}
                >
                  <span className="lst-share__label">{opt.label}</span>
                  {opt.price
                    ? <span className="lst-share__price">{rupees(opt.price)}<em>{copy.priceUnit}</em></span>
                    : <span className="lst-share__price lst-share__price--none">Ask owner</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/*
        * ── Whole-property lets: the layout, and nothing else yet ──────
        *
        * No joining date here. On a paid category the VISIT date is picked
        * after the owner confirms and the ₹199 assisted visit is paid — at
        * which point it is a commitment rather than a guess about a viewing
        * nobody has agreed to. Asking twice, once on each side of the
        * payment, would be asking the same question and then ignoring the
        * first answer.
        */}
      {simple && tokenRequired && (
        <div className="si-group">
          <p className="si-note">
            Ask first, schedule after. The owner confirms, you book a{' '}
            {rupees(listing.visitToken.amountPaise / 100)} assisted visit, and then you pick a
            date and time — a Lampose representative accompanies you, and the full address
            comes with your slot.
          </p>
        </div>
      )}

      {/* A whole-property let that takes no token still needs a date here —
          there is no later step to ask it in. */}
      {simple && !tokenRequired && (
        <div className="si-group">
          <span className="exp-lbl">{copy.dateLabel}</span>
          <DateField
            value={value.joiningDate}
            window={listing.joinWindow}
            onChange={joiningDate => set({ joiningDate })}
          />
        </div>
      )}

      {/* ── Hotels: how they are charged, then the two dates ─────────── */}
      {nightly && (
        <>
          {/*
            * Which structure, offered only where this owner priced one.
            *
            * A hostel sells the same bed by the night, by the month and by
            * the hour, at rates that are not multiples of each other — so it
            * is a choice the guest makes, not something to infer from how
            * long they are staying. A single-structure bed shows nothing:
            * there is no decision to present.
            */}
          {rateChoices.length > 1 && (
            <div className="si-group">
              <span className="exp-lbl">How do you want to be charged?</span>
              <div className="si-opts" role="radiogroup" aria-label="Pricing structure">
                {rateChoices.map(r => {
                  const on = (value.rateStructure || rateChoices[0].id) === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`lst-share${on ? ' is-on' : ''}`}
                      onClick={() => onChange({
                        ...value,
                        rateStructure: r.id,
                        /* "3" means nights on one and hours on another. */
                        rateQuantity: null,
                        checkOut: r.id === 'nightly' ? value.checkOut : null,
                      })}
                    >
                      <span className="lst-share__label">{r.label}</span>
                      <span className="lst-share__price">{rupees(r.price)}<em>{r.unit}</em></span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/*
            * What the dates section asks depends on the structure.
            *
            * Nights are the only quantity a pair of dates already answers, so
            * that one asks for check-out and reads the nights off it. Hours
            * and months are the guest's own number, and the check-out follows
            * — asking all three for a check-out forced an hourly booking to
            * last at least one night.
            */}
          <div className="si-group">
            <span className="exp-lbl">{copy.dateLabel}</span>

            {byNight ? (
              <>
                <div className="si-datepair">
                  <DateField
                    label="Check-in"
                    hint={false}
                    value={value.checkIn}
                    window={listing.joinWindow}
                    onChange={checkIn => onChange({
                      ...value,
                      checkIn,
                      /* A check-out that is no longer after check-in is not a
                         date the guest still means. */
                      checkOut: value.checkOut && checkIn && value.checkOut <= checkIn ? null : value.checkOut,
                    })}
                  />
                  <DateField
                    label="Check-out"
                    hint={false}
                    value={value.checkOut}
                    window={{
                      min: dayAfter(value.checkIn) || listing.joinWindow?.min,
                      max: listing.joinWindow?.max,
                    }}
                    onChange={checkOut => set({ checkOut })}
                  />
                </div>
                {listing.joinWindow && (
                  <small className="si-hint">
                    Anytime from {new Date(`${listing.joinWindow.min}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    {' '}to {new Date(`${listing.joinWindow.max}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </small>
                )}
              </>
            ) : (
              <div className="si-datepair">
                <DateField
                  label="Check-in"
                  value={value.checkIn}
                  window={listing.joinWindow}
                  onChange={checkIn => set({ checkIn })}
                />
                <label className="si-field">
                  <span className="exp-lbl">How many {qtySpec.unit}?</span>
                  <input
                    className="si-date"
                    type="number"
                    min={qtySpec.min}
                    max={qtySpec.max}
                    inputMode="numeric"
                    placeholder={String(qtySpec.min)}
                    value={value.rateQuantity ?? ''}
                    onChange={e => set({ rateQuantity: Number(e.target.value) || null })}
                  />
                  <small className="si-hint">{qtySpec.min}–{qtySpec.max} {qtySpec.unit}</small>
                </label>
              </div>
            )}

            {total > 0 && (
              <p className="si-note">
                {quantity} {quantity === 1 ? qtySpec.unit.replace(/s$/, '') : qtySpec.unit}
                {' · '}{rupees(activeRate.price)}{activeRate.unit}
                {' · '}<strong>{rupees(total)}</strong> in total
              </p>
            )}
          </div>
        </>
      )}

      {/* Everything below is the stay-length path. A whole-property let and a
          hotel both stop above it — one has no ladder, the other has dates. */}
      {!simple && !nightly && (
        <>
          {tracks.length > 0 && (
            <div className="si-group">
              <span className="exp-lbl">How long are you staying?</span>
              <div className="si-opts" role="radiogroup" aria-label="Stay type">
                {tracks.map(t => {
                  const on = value.stayType === t.id;
                  const rate = rates[t.id];
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`lst-share${on ? ' is-on' : ''}`}
                      onClick={() => pickTrack(t.id)}
                    >
                      <span className="lst-share__label">{t.label}</span>
                      <span className="lst-share__price">
                        {t.id === 'short'
                          ? <>{rupees(rate.dailyPrice)}<em>/night</em></>
                          : <>{rupees(rate.monthlyPrice)}<em>/mo</em></>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {value.stayType && units?.length > 0 && (
            <div className="si-group">
              <label className="exp-lbl" htmlFor="si-duration">
                {value.stayType === 'short' ? 'How many nights?' : 'How many months?'}
              </label>
              <select
                id="si-duration"
                className="xp-select si-select"
                value={value.duration ?? ''}
                onChange={e => set({ duration: Number(e.target.value) || null })}
              >
                <option value="">Choose…</option>
                {units.map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? unitWord : `${unitWord}s`}</option>
                ))}
              </select>
            </div>
          )}

          {value.stayType && (
            <div className="si-group si-group--date">
              <DateField
                value={value.joiningDate}
                window={listing.joinWindow}
                onChange={joiningDate => set({ joiningDate })}
              />

              {/* A three-state control, not a checkbox: "not answered" has to
                  be distinguishable from "no", because the button waits on a
                  decision rather than on a tick. */}
              <fieldset className="si-flex">
                <legend className="exp-lbl">Are your dates flexible?</legend>
                <div className="si-seg" role="radiogroup" aria-label="Flexible dates">
                  <button
                    type="button" role="radio" aria-checked={value.flexibleJoin === true}
                    className={`si-seg__btn${value.flexibleJoin === true ? ' is-on' : ''}`}
                    onClick={() => set({ flexibleJoin: true })}
                  >
                    Flexible by a day or two
                  </button>
                  <button
                    type="button" role="radio" aria-checked={value.flexibleJoin === false}
                    className={`si-seg__btn${value.flexibleJoin === false ? ' is-on' : ''}`}
                    onClick={() => set({ flexibleJoin: false })}
                  >
                    That exact date
                  </button>
                </div>
              </fieldset>
            </div>
          )}
        </>
      )}
    </section>
  );
}
