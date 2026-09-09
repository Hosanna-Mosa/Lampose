/* ══════════════════════════════════════════════════════════════════════════
   Where a booking IS today, as opposed to what somebody last set it to.

   ## The bug this exists to fix

   `partner_bookings.status` allows six values, and two of them — `arriving`
   and `departing` — were never written by anything. Not by check-in, not by
   check-out, not by the Add Customer form, not by a worker. They sat in the
   enum, the dashboard counted them, and so "Arrivals today" and "Departures
   today" were structurally incapable of showing anything but zero.

   The Stay Partner app then made the same information disappear a second
   time: its status mapper folded `arriving` into `confirmed` and `departing`
   into `in_house`, so even a row that somehow had one would have rendered as
   something else.

   ## Why this is derived and not stored

   Because it changes at midnight, on its own, for every booking at once.

   A stored `arriving` would need a job to write it and a second job to clear
   it, and any hour that job did not run would leave an owner looking at
   yesterday's arrivals. The dates already say everything: a stay whose
   check-in is today IS an arrival, and no write can make that more true.
   `status` keeps its job — what a PERSON did (checked in, cancelled,
   completed) — and this answers what the CALENDAR says.

   ## Overdue is not the same as due today, and used to be reported as one

   A check-in date that has already passed on a booking nobody has checked in
   used to read `arriving` — the same word as a guest actually due today —
   which is how "Arrivals today" on the dashboard came to count a guest who
   was due in July. It is still on the owner's list, because the guest was
   expected and has not been marked in, but it is a DIFFERENT fact: today's
   arrivals are who to expect at the door today, and an overdue one is a
   booking that needs a decision — chase them, or the room was never really
   taken. Collapsing the two under one label is what made the Bookings screen
   read as wrong: a stay from two months ago still saying "Arriving today"
   looks exactly like a bug, because showing it as today is one. `overdue_arrival`
   and `overdue_departure` are their own stages for exactly that reason — kept
   in the same list an owner is already checking rather than hidden, but never
   counted as "today" anywhere that word is used.
   ══════════════════════════════════════════════════════════════════════════ */

/** The eight a booking can be in. `status` plus the four the calendar decides. */
const STAGES = [
  'upcoming', 'arriving', 'overdue_arrival', 'in_house', 'departing', 'overdue_departure',
  'completed', 'cancelled',
];

/**
 * Today in India, as `YYYY-MM-DD`.
 *
 * The dates on a booking are plain date strings with no zone — a check-in on
 * the 3rd is the 3rd in Hyderabad — so "today" has to be India's today and not
 * the server's. A box running UTC is four and a half hours behind, which for
 * five and a half hours every night would put every one of the next morning's
 * arrivals back into `upcoming`.
 *
 * `en-CA` because it formats as `YYYY-MM-DD`, which is exactly the shape the
 * dates are stored in and so compares correctly as a string.
 */
const todayInIndia = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);

/**
 * What stage a booking is at.
 *
 * @param {{status?: string, checkInDate?: string, checkOutDate?: string}} booking
 * @param {Date} [now]
 * @returns {'upcoming'|'arriving'|'overdue_arrival'|'in_house'|'departing'|'overdue_departure'|'completed'|'cancelled'}
 */
const stageFor = (booking, now = new Date()) => {
  const status = String(booking?.status || '').trim();

  /* Terminal. A finished or cancelled stay has no calendar left. */
  if (status === 'completed' || status === 'cancelled') return status;

  const today = todayInIndia(now);
  const checkIn = String(booking?.checkInDate || '');
  const checkOut = String(booking?.checkOutDate || '');

  /* The guest is in the building — the only question left is whether today is
     the day they leave, or already was. A stay with no agreed end date never
     becomes `departing`, which is correct: a PG resident on an open-ended
     stay is not departing until somebody says so. */
  if (status === 'in_house' || status === 'departing') {
    if (!checkOut) return 'in_house';
    if (checkOut < today) return 'overdue_departure';
    return checkOut === today ? 'departing' : 'in_house';
  }

  /* Not arrived yet. `===` today, not `<=` — a guest expected weeks ago and
     never checked in is not "today"'s arrival, it is overdue. */
  if (!checkIn) return 'upcoming';
  if (checkIn < today) return 'overdue_arrival';
  return checkIn === today ? 'arriving' : 'upcoming';
};

/** `{ ...booking, id, stage }` — what every partner-facing response sends. */
const withStage = (booking, now = new Date()) => ({
  ...booking,
  id: String(booking._id ?? booking.id ?? ''),
  stage: stageFor(booking, now),
});

module.exports = { STAGES, stageFor, withStage, todayInIndia };
