import React, { useCallback, useMemo, useState } from 'react';

import visitRequestsApi from '../api/visitRequestsApi';
import { loadCheckout, rupees } from '../lib/razorpayCheckout';

/* ═══════════════════════════════════════════════════════════════════════════
   The choice a confirmed customer is offered, as two tabs.

     Assisted Visit    ₹199   what it includes, then a date and time; a
                              Lampose representative meets them there
     Direct Access     ₹99    the owner's number and a map pin, and they
                              go on their own

   ## Why tabs and not two stacked cards

   They are alternatives, not steps. Stacked, the second reads as what happens
   after the first, and somebody who has already booked an agent would still
   see a payment sitting underneath it looking outstanding. A tab strip says
   "one or the other" without a sentence explaining it.

   ## Why the assisted tab leads with a list

   It is the more expensive of the two and the one whose value is not obvious
   from its name — "an agent comes with you" could mean anything. So the tab
   opens with what ₹199 actually buys and asks for a date only underneath it.
   Direct Access needs no such list: "the owner's number and a map pin" is
   the whole product.

   ## Neither purchase includes the other

   Paying for an assisted visit does NOT unlock the owner's number — the
   agent deals with the owner, so the customer never needs it — and Direct
   Access books nobody's time. The copy must never imply otherwise; a customer
   who wants both buys both. The visit token above is a third, separate thing
   again.

   ## What this component can and cannot do

   It can open Razorpay's checkout and hand back the values it returns. It
   cannot decide that a payment happened: neither the contact details nor a
   booking are in this file's reach until the server has checked an HMAC over
   `order_id|payment_id` against a secret no browser holds. Rewriting this
   file to claim success would produce a panel with nothing to show.
   ═══════════════════════════════════════════════════════════════════════════ */

/*
 * What ₹199 buys, in the customer's terms.
 *
 * Deliberately does NOT open with "everything in Direct Access": it does not
 * include Direct Access. The two are separate purchases, and a bullet saying
 * otherwise would be selling something this payment does not deliver. What is
 * true is that the agent makes the address and the owner's number unnecessary
 * rather than granting them, which is what the last line says instead.
 */
const ASSISTED_INCLUDES = [
  'Select your visit date & time',
  'A Lampose representative meets you there',
  'Property visit coordination with the owner',
  'Basic on-site property check',
  'Lampose support throughout the visit',
];

/* Must match VISIT_HOURS in the backend's contactUnlock.controller.js — the
   server rejects anything outside it, so offering a wider list here would be
   offering slots that bounce. */
const HOURS = { from: 8, to: 20 };
const MAX_DAYS_AHEAD = 30;

/** "08:00", "08:30", … "20:00" — every slot an agent can be sent to. */
const SLOTS = (() => {
  const out = [];
  for (let h = HOURS.from; h <= HOURS.to; h += 1) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    if (h < HOURS.to) out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
})();

/* Local date, not `toISOString()`. That converts to UTC first, so anywhere
   east of Greenwich it hands back yesterday for most of the evening — and the
   date input would refuse today as being in the past. */
const isoDay = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "4:00 pm" — a 24-hour slot value as the clock a person reads. */
const readTime = (time) => {
  const [h, m] = String(time || '').split(':');
  const when = new Date();
  when.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
  return when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};

/** "Tue, 26 Aug at 4:00 pm" — the slot read back in words. */
const readSlot = (date, time) => {
  if (!date) return '';
  const when = new Date(`${date}T${time || '00:00'}:00`);
  if (Number.isNaN(when.getTime())) return `${date} at ${time || ''}`.trim();
  return when.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });
};

export default function VisitNextSteps({ request, onUpdated }) {
  /* Null until somebody picks one, so the default below can follow the state
     of the request. A plain `useState('lampose')` cannot: it is evaluated
     once, at mount, which happens while the owner is still being waited on
     and every field it would read is empty. */
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  /* Never defaulted to true. The customer is agreeing to owe money, and a
     box that starts ticked is not an agreement anybody made. */
  const [acceptsBalance, setAcceptsBalance] = useState(false);
  /* Set to true by the "change the time" button, so a booked slot can be
     re-picked without losing what it currently says. */
  const [editing, setEditing] = useState(false);

  /* What the ₹99 bought, when this tab is the one that bought it. The polled
     request carries it too — see `shownContact`. */
  const [contact, setContact] = useState(null);
  /* And the slot this tab just booked. Both exist for the same reason: the
     refresh that would bring the value back down is a separate request, and
     one that fails must not make a thing that definitely happened look like
     it did not. */
  const [justBooked, setJustBooked] = useState(null);

  const booking = justBooked || request?.lamposeVisit;
  const unlock = request?.contactUnlock;

  const min = useMemo(() => isoDay(0), []);
  const max = useMemo(() => isoDay(MAX_DAYS_AHEAD), []);

  /* Today's slots that have already gone. Picking 9am at 3pm is a booking
     nobody can keep, and the server would take it — it only checks the
     opening hours, not the clock. */
  const slots = useMemo(() => {
    if (date !== min) return SLOTS;
    const now = new Date();
    const cutoff = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return SLOTS.filter(s => s > cutoff);
  }, [date, min]);

  /*
   * Book the assisted visit: hold the slot, then pay for it.
   *
   * The slot goes to the server BEFORE the checkout opens, which is what lets
   * the webhook finish the booking on its own if this tab never sees the
   * callback — the date and time are already recorded against the request.
   */
  const payAssisted = useCallback(async (event) => {
    event.preventDefault();
    setError('');
    setBusy('Opening the payment window...');
    try {
      const started = await visitRequestsApi.startAssistedVisit(request.id, {
        date, time, note, balanceConsent: acceptsBalance,
      });
      if (!started.ok) {
        setError(started.message || 'Could not start the payment.');
        setBusy('');
        return;
      }
      /* Already booked and paid for — the server refuses a second charge and
         answers with the booking instead. */
      if (started.data?.alreadyBooked) {
        setBusy('');
        setJustBooked(started.data.lamposeVisit || null);
        setEditing(false);
        if (onUpdated) onUpdated();
        return;
      }

      const Razorpay = await loadCheckout();
      const order = started.data;

      const checkout = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency || 'INR',
        name: 'Lampose',
        description: `Assisted visit · ${order.propertyName || ''}`.trim(),
        prefill: { name: order.customerName || '', contact: order.customerPhone || '' },
        theme: { color: '#45855a' },
        handler: async (response) => {
          setBusy('Confirming your visit...');
          const confirmed = await visitRequestsApi.confirmAssistedVisit(request.id, {
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          setBusy('');
          if (!confirmed.ok) {
            setError(confirmed.message || 'That payment could not be verified.');
            return;
          }
          setJustBooked(confirmed.data || null);
          setEditing(false);
          if (onUpdated) onUpdated();
        },
        modal: {
          /* Closing the window is not a failure — the slot is still held and
             the button says Schedule again. */
          ondismiss: () => setBusy(''),
        },
      });
      checkout.open();
    } catch (err) {
      setError(err?.message || 'Something went wrong opening the payment window.');
      setBusy('');
    }
  }, [request?.id, date, time, note, acceptsBalance, onUpdated]);

  const payUnlock = useCallback(async () => {
    setError('');
    setBusy('Opening the payment window...');
    try {
      const started = await visitRequestsApi.startContactUnlock(request.id);
      if (!started.ok) {
        setError(started.message || 'Could not start the payment.');
        setBusy('');
        return;
      }
      /* Already paid — the server answers with the contact rather than a
         second order, so somebody who taps twice gets the number. */
      if (started.data?.alreadyPaid) {
        setBusy('');
        if (started.data.contact) setContact(started.data.contact);
        if (onUpdated) onUpdated();
        return;
      }

      const Razorpay = await loadCheckout();
      const order = started.data;

      const checkout = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency || 'INR',
        name: 'Lampose',
        description: `Owner contact · ${order.propertyName || ''}`.trim(),
        prefill: { name: order.customerName || '', contact: order.customerPhone || '' },
        theme: { color: '#45855a' },
        handler: async (response) => {
          setBusy('Checking the payment...');
          const confirmed = await visitRequestsApi.confirmContactUnlock(request.id, {
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          setBusy('');
          if (!confirmed.ok) {
            setError(confirmed.message || 'That payment could not be verified.');
            return;
          }
          if (confirmed.data?.contact) setContact(confirmed.data.contact);
          if (onUpdated) onUpdated();
        },
        modal: {
          /* Closing the window is not a failure — the order stays open and
             the button says Pay again. */
          ondismiss: () => setBusy(''),
        },
      });
      checkout.open();
    } catch (err) {
      setError(err?.message || 'Something went wrong opening the payment window.');
      setBusy('');
    }
  }, [request?.id, onUpdated]);

  /* Settle the outstanding half. Same shape as every other checkout here:
     the server makes the order, Razorpay takes the money, and only an HMAC
     the server checks marks it paid. */
  const payBalance = useCallback(async () => {
    setError('');
    setBusy('Opening the payment window...');
    try {
      const started = await visitRequestsApi.startAssistedBalance(request.id);
      if (!started.ok) {
        setError(started.message || 'Could not start the payment.');
        setBusy('');
        return;
      }
      if (started.data?.alreadyPaid) {
        setBusy('');
        setJustBooked(started.data.lamposeVisit || null);
        if (onUpdated) onUpdated();
        return;
      }

      const Razorpay = await loadCheckout();
      const order = started.data;

      const checkout = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency || 'INR',
        name: 'Lampose',
        description: `Assisted visit balance \u00b7 ${order.propertyName || ''}`.trim(),
        prefill: { name: order.customerName || '', contact: order.customerPhone || '' },
        theme: { color: '#45855a' },
        handler: async (response) => {
          setBusy('Checking the payment...');
          const confirmed = await visitRequestsApi.confirmAssistedBalance(request.id, {
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          setBusy('');
          if (!confirmed.ok) {
            setError(confirmed.message || 'That payment could not be verified.');
            return;
          }
          setJustBooked(confirmed.data || null);
          if (onUpdated) onUpdated();
        },
        modal: { ondismiss: () => setBusy('') },
      });
      checkout.open();
    } catch (err) {
      setError(err?.message || 'Something went wrong opening the payment window.');
      setBusy('');
    }
  }, [request?.id, onUpdated]);

  /* Bachelor and co-live only, and only once the owner has actually said yes.
     `payment.required` is the category's answer, decided when the request was
     made — the same field the token panel reads, so the two can never
     disagree about whether this listing is on the paid path. */
  if (request?.status !== 'confirmed') return null;
  if (!request?.payment?.required) return null;

  /*
   * A lapsed confirmation buys nothing, and has to say so.
   *
   * The owner held a layout for a window and it closed; the server refuses
   * both options past it with 410 CONFIRMATION_LAPSED. This used to return
   * null, which was fine while the token panel sat above saying "this
   * confirmation has lapsed" — with that panel hidden, returning null would
   * make the whole card vanish with no explanation at all.
   */
  if (request?.payment?.status === 'expired') {
    return (
      <div className="vn">
        <div className="vn__panel">
          <h4 className="vn__title">This confirmation has lapsed</h4>
          <p className="vn__lead">
            The owner held the place for a while and nothing was arranged. Ask again and
            they can confirm a fresh visit.
          </p>
        </div>
      </div>
    );
  }

  const booked = booking?.status === 'requested' && !editing;
  /* Whichever source has it: this tab's own payment, or a payment made
     elsewhere and picked up by the status poll. The server decides whether to
     send it at all, so reading either is not a way round the gate. */
  const shownContact = contact || request?.contact || null;
  const paid = unlock?.status === 'paid';
  /* The server sends its configured figures whether or not an order exists,
     so these fallbacks are only for a response that predates the fields —
     never the numbers a working deployment prints. */
  const amount = unlock?.amountPaise || 9900;
  const assistedAmount = booking?.amountPaise || 19900;
  const advanceAmount = booking?.advancePaise || 10000;
  const balanceAmount = booking?.balancePaise ?? Math.max(0, assistedAmount - advanceAmount);
  const balanceStatus = booking?.balance?.status || 'not_due';
  /*
   * Nothing left to pay on this visit.
   *
   * Two ways to get here, and both have to count: the balance was settled, or
   * there was never one to settle because the deployment takes the whole fee
   * up front. The second case used to fall through every branch below and
   * render neither "balance due" nor "paid in full" — a fully paid visit that
   * said nothing about its money at all.
   */
  const settled = balanceStatus === 'paid' || balanceAmount <= 0;

  /*
   * Which tab opens first.
   *
   * Whatever they have already bought, because that is what they came back
   * to look at — a booked visit outranks an unlocked number only because a
   * date is the thing with a deadline. Failing both, the assisted tab, which
   * is the one that needs explaining. `chosen` beats all of it the moment
   * somebody presses a tab.
   */
  const tab = chosen
    || (booked ? 'lampose' : null)
    || (paid ? 'contact' : null)
    || 'lampose';
  const setTab = setChosen;

  return (
    <div className="vn">
      <div className="vn__tabs" role="tablist" aria-label="How would you like to see this room?">
        <button
          type="button"
          role="tab"
          id="vn-tab-lampose"
          aria-selected={tab === 'lampose'}
          aria-controls="vn-panel-lampose"
          className={`vn__tab ${tab === 'lampose' ? 'is-on' : ''}`}
          onClick={() => { setTab('lampose'); setError(''); }}
        >
          Assisted Visit
          <span className="vn__tag">{booked ? 'Booked' : rupees(assistedAmount)}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="vn-tab-contact"
          aria-selected={tab === 'contact'}
          aria-controls="vn-panel-contact"
          className={`vn__tab ${tab === 'contact' ? 'is-on' : ''}`}
          onClick={() => { setTab('contact'); setError(''); }}
        >
          Direct Access
          <span className="vn__tag">{paid ? 'Unlocked' : rupees(amount)}</span>
        </button>
      </div>

      {/* ── Assisted visit ────────────────────────────────────────────── */}
      {tab === 'lampose' && (
        <div className="vn__panel" role="tabpanel" id="vn-panel-lampose" aria-labelledby="vn-tab-lampose">
          {booked ? (
            <>
              <h4 className="vn__title">Your visit is booked</h4>
              <div className="vn__slot">
                <span className="vn__slot-k">Assisted visit</span>
                <span className="vn__slot-v">{readSlot(booking.date, booking.time)}</span>
              </div>
              <p className="vn__lead">
                {booking.teamNotified
                  ? 'A Lampose representative will call you to confirm before then, '
                    + 'and will meet you at the property.'
                  : 'Your payment went through. We could not reach the team just now, '
                    + 'so we will call you to confirm the time.'}
              </p>
              {booking.note ? <p className="vn__meta">Your note: {booking.note}</p> : null}

              {/* What is still owed, or that nothing is. Amber while it
                  stands, because a green panel would read as settled. */}
              {balanceStatus === 'due' ? (
                <>
                  <div className="vn__due">
                    <span className="vn__due-k">Balance due</span>
                    <span className="vn__due-v">{rupees(balanceAmount)}</span>
                    <p className="vn__due-n">
                      Payable when you confirm the room. You agreed to this when you paid
                      the {rupees(advanceAmount)} advance.
                    </p>
                  </div>
                  {error ? <p className="vn__err">{error}</p> : null}
                  <button
                    type="button"
                    className="vn__cta"
                    onClick={payBalance}
                    disabled={Boolean(busy)}
                  >
                    {busy || `Pay ${rupees(balanceAmount)} balance`}
                  </button>
                </>
              ) : null}

              {settled ? (
                <>
                  <p className="vn__settled">
                    <span aria-hidden="true">&#10003;</span>
                    Paid in full &middot; {rupees(assistedAmount)}
                  </p>
                  {/* The reschedule button is gone below, so this is the one
                      place that says how to move a paid visit. A finished
                      state with no next step just leaves somebody holding
                      it. */}
                  <p className="vn__meta">
                    Need a different time? Tell the representative when they call to
                    confirm, and they will move it.
                  </p>
                </>
              ) : null}

              {/*
                * Rescheduling, while there is still money outstanding.
                *
                * Hidden once the visit is paid in full: at that point the slot
                * is a commitment on both sides and a representative's day is
                * already set aside for it, so moving it is a conversation with
                * the person who will be standing there — not a form. Offering
                * a button that quietly re-opens the picker would imply we can
                * still shuffle a visit nobody has any hold over any more.
                */}
              {!settled ? (
                <button
                  type="button"
                  className="vn__ghost"
                  onClick={() => {
                    setDate(booking.date || '');
                    setTime(booking.time || '');
                    setNote(booking.note || '');
                    setEditing(true);
                  }}
                >
                  Change the time
                </button>
              ) : null}
            </>
          ) : (
            <form onSubmit={payAssisted}>
              <h4 className="vn__title">Lampose Assisted Visit</h4>
              <p className="vn__price">
                <b>{rupees(assistedAmount)}</b>
                <span>total</span>
              </p>

              {/* The split, before the button and not after it. A button that
                  charges the advance under a heading saying the total is the
                  kind of surprise that becomes a chargeback. */}
              {balanceAmount > 0 ? (
                <div className="vn__split">
                  <span className="vn__split-row is-now">
                    <span>Pay now to book your slot</span>
                    <b>{rupees(advanceAmount)}</b>
                  </span>
                  <span className="vn__split-row">
                    <span>Due when you confirm the room</span>
                    <b>{rupees(balanceAmount)}</b>
                  </span>
                </div>
              ) : null}

              {/* What it buys, before it asks for anything. */}
              <ul className="vn__list">
                {ASSISTED_INCLUDES.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <p className="vn__meta">
                The representative arranges everything with the owner, so you do not need
                the address or their number to go.
              </p>

              <hr className="vn__rule" />

              <p className="vn__step">Choose when you would like to visit</p>

              {/* `display: contents` by default, so date and time are plain
                  stacked fields; it becomes a two-column grid only once the
                  CARD is wide enough for them to sit side by side. */}
              <div className="vn__row">
                <label className="vn__field">
                  <span className="exp-lbl">Date</span>
                  <input
                    type="date"
                    className="si-date"
                    required
                    min={min}
                    max={max}
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setTime(''); }}
                  />
                </label>
                <label className="vn__field">
                  <span className="exp-lbl">Time</span>
                  <select
                    className="si-date"
                    required
                    value={time}
                    disabled={!date}
                    onChange={e => setTime(e.target.value)}
                  >
                    <option value="">{date ? 'Pick a slot' : 'Pick a date first'}</option>
                    {slots.map(s => <option key={s} value={s}>{readTime(s)}</option>)}
                  </select>
                </label>
              </div>

              {date === min && !slots.length ? (
                <p className="vn__meta">
                  No slots left today — pick tomorrow or later.
                </p>
              ) : null}

              <label className="vn__field">
                <span className="exp-lbl">Anything we should know? (optional)</span>
                <input
                  type="text"
                  className="si-date"
                  maxLength={300}
                  placeholder="I can only do weekends"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </label>

              {/* Required, and unticked by default. The server refuses the
                  order without it and records the agreement with a timestamp,
                  so this is the visible half of something that is also
                  evidence. */}
              {balanceAmount > 0 ? (
                <label className="vn__consent">
                  <input
                    type="checkbox"
                    checked={acceptsBalance}
                    onChange={e => setAcceptsBalance(e.target.checked)}
                  />
                  <span>
                    I agree to pay the remaining <strong>{rupees(balanceAmount)}</strong> when
                    I confirm this room.
                  </span>
                </label>
              ) : null}

              {error ? <p className="vn__err">{error}</p> : null}

              <button
                type="submit"
                className="vn__cta"
                disabled={
                  !date || !time || Boolean(busy) || (balanceAmount > 0 && !acceptsBalance)
                }
              >
                {busy || `Pay ${rupees(advanceAmount)} advance`}
              </button>
              {editing ? (
                <button type="button" className="vn__ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              ) : null}
            </form>
          )}
        </div>
      )}

      {/* ── Direct Access ─────────────────────────────────────────────── */}
      {tab === 'contact' && (
        <div className="vn__panel" role="tabpanel" id="vn-panel-contact" aria-labelledby="vn-tab-contact">
          {paid && shownContact ? (
            <>
              <h4 className="vn__title">Owner contact</h4>
              <p className="vn__lead">
                Call ahead before you set off — owners are not always on site.
              </p>

              {/* Each label+value pair is wrapped in a div — valid inside a
                  <dl>, and what keeps the list's gap between PAIRS rather
                  than between every label and the value it names. */}
              <dl className="vn__contact">
                {shownContact.ownerName ? (
                  <div>
                    <dt>Owner</dt>
                    <dd>{shownContact.ownerName}</dd>
                  </div>
                ) : null}
                {shownContact.ownerPhone ? (
                  <div>
                    <dt>Phone</dt>
                    <dd><a href={`tel:${shownContact.ownerPhone}`}>{shownContact.ownerPhone}</a></dd>
                  </div>
                ) : null}
                {shownContact.ownerAltPhone ? (
                  <div>
                    <dt>Alternate</dt>
                    <dd><a href={`tel:${shownContact.ownerAltPhone}`}>{shownContact.ownerAltPhone}</a></dd>
                  </div>
                ) : null}
                {shownContact.address ? (
                  <div>
                    <dt>Address</dt>
                    <dd>{shownContact.address}</dd>
                  </div>
                ) : null}
              </dl>

              {shownContact.mapUrl ? (
                <a
                  className="vn__cta"
                  href={shownContact.mapUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open in Maps
                </a>
              ) : null}
            </>
          ) : paid ? (
            /* Paid, but the details have not come back yet — a reload
               between verifying and the next poll. Never an error: the money
               is recorded and the next read has it. */
            <>
              <h4 className="vn__title">Unlocked</h4>
              <p className="vn__lead">Fetching the owner&apos;s details…</p>
            </>
          ) : (
            <>
              <h4 className="vn__title">Go on your own</h4>
              <p className="vn__price">
                <b>{rupees(amount)}</b>
                <span>one time</span>
              </p>
              <p className="vn__lead">
                Unlocks the owner&apos;s phone number and a map pin for the building, so you
                can arrange a look directly with them.
              </p>
              {error ? <p className="vn__err">{error}</p> : null}
              <button
                type="button"
                className="vn__cta"
                onClick={payUnlock}
                disabled={Boolean(busy)}
              >
                {busy || `Pay ${rupees(amount)}`}
              </button>
              <p className="vn__meta">
                Would rather not go alone? <strong>Assisted Visit</strong> sends a Lampose
                representative with you instead.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
