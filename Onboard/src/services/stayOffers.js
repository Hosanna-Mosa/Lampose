/* ══════════════════════════════════════════════════════════════════════════
   What stay lengths a property is offering — the one answer, for every screen.

   It used to be a pair of buttons behaving like a radio: Short OR Long. A PG
   that lets a room by the night AND by the month had to pick the one it would
   rather advertise, and the other half of its trade was invisible. The
   property record has always been able to say both — `property.model.js`
   carries `enum: ['Short Stay', 'Long Stay', 'Both Short & Long Stay']` — and
   the listing side has always read it that way: `stayIntent.util.js` tests
   `includes('both')` and then gates each length on whether a PRICE exists for
   it ("availability follows the money"). Only the onboarding form could not
   say it.

   ## Some categories are not asked

   Their answer is what they are, and a stale value carried over from the
   previous category must not be able to change it:

     HOTEL                 nightly, always. Nobody takes a hotel by the month
                           here, and its rates are per bed per night.
     COMMERCIAL            monthly, always. Nobody takes a godown for a
                           fortnight.
     BACHELOR / COLIVE     monthly, always — a whole-property let.

   Everything else — a PG or hostel, above all — is asked, and may now answer
   both.

   ## One definition, two readers

   The step draws the controls from this and `validation.js` decides what to
   demand from it. They used to compute the same thing separately, each with
   its own copy of the hotel and commercial exceptions, which is how a form
   comes to hide a field that the check then refuses to submit without.
   ══════════════════════════════════════════════════════════════════════════ */

/** Exactly the three strings `property.model.js` will store. */
export const STAY_TYPE = {
  short: 'Short Stay',
  long: 'Long Stay',
  both: 'Both Short & Long Stay',
};

const NIGHTLY_ONLY = ['HOTEL'];
const MONTHLY_ONLY = ['COMMERCIAL', 'BACHELOR', 'COLIVE'];

/** Is this category asked the question at all, or is the answer fixed? */
export const staySelectable = (category) => !NIGHTLY_ONLY.includes(category)
  && !MONTHLY_ONLY.includes(category);

/**
 * What this property offers, as two booleans.
 *
 * Read from the stored string rather than from a pair of flags so there is
 * nothing to keep in step: `'Both Short & Long Stay'` contains both words, and
 * that is the whole of the parsing — the same trick the server uses.
 *
 * Never returns neither. A property that offers no stay length at all is not a
 * listing, and a form that let somebody switch both off would produce one.
 */
export const stayOffersFor = (formData = {}) => {
  const category = formData.category;

  if (NIGHTLY_ONLY.includes(category)) return { short: true, long: false };
  if (MONTHLY_ONLY.includes(category)) return { short: false, long: true };

  const declared = String(formData.stayType || '');
  const short = declared.includes('Short');
  const long = declared.includes('Long');

  /* An empty or unrecognised value — a category switch clears it — is a long
     stay, which is what the record defaults to. */
  return short || long ? { short, long } : { short: false, long: true };
};

/**
 * The two booleans back as the string the record stores.
 *
 * `null` for a pair that says nothing: the caller is asking to turn off the
 * last one, and the control refuses rather than writing a value the model
 * would reject.
 */
export const stayTypeFrom = ({ short, long }) => {
  if (short && long) return STAY_TYPE.both;
  if (short) return STAY_TYPE.short;
  if (long) return STAY_TYPE.long;
  return null;
};
