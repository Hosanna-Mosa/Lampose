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
const DateField = ({ value, window: win, onChange }) => (
  <label className="si-field">
    <span className="exp-lbl">Joining date</span>
    <input
      type="date"
      className="si-date"
      value={value || ''}
      min={win?.min}
      max={win?.max}
      onChange={e => onChange(e.target.value || null)}
    />
    {win && (
      <small className="si-hint">
        Anytime from {new Date(`${win.min}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        {' '}to {new Date(`${win.max}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
      </small>
    )}
  </label>
);

export default function StayIntentPicker({ listing, value, onChange }) {
  const rates = listing.stayRates || {};
  const durations = listing.durationOptions || {};
  const sharingOptions = listing.sharingOptions || [];
  const simple = listing.simpleSharingPath === true;

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
  const unitWord = value.stayType === 'short' ? 'day' : 'month';

  return (
    <section className="si">
      {/* ── Sharing — on both paths ─────────────────────────────────── */}
      {sharingOptions.length > 0 && (
        <div className="si-group">
          <span className="exp-lbl">
            {sharingOptions.length === 1 ? 'Room type' : 'Which room are you after?'}
          </span>
          <div className="si-opts" role="radiogroup" aria-label="Room type">
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
                    ? <span className="lst-share__price">{rupees(opt.price)}<em>/mo</em></span>
                    : <span className="lst-share__price lst-share__price--none">Ask owner</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Everything below is the stay-length path. Bachelor Room stops here. */}
      {!simple && (
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
