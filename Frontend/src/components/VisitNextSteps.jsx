import React, { useState } from 'react';

import visitRequestsApi from '../api/visitRequestsApi';
import { loadCheckout, rupees } from '../lib/razorpayCheckout';

/* ═══════════════════════════════════════════════════════════════════════════
   The one payment a confirmed customer makes, and what happens after it.

   The owner has replied AVAILABLE. From here the flow is a single product:
   a ₹199 assisted visit — ₹100 for the Lampose representative who
   accompanies them, ₹99 Lampose fee — paid in one shot. (The tabs this
   panel used to hold — a ₹99 contact unlock and a split-payment assisted
   visit — are retired, along with the ₹20 token that sat above them.)

   ## The slot is picked on WhatsApp, never here

   Deliberately. The payment can arrive from the WhatsApp link as easily as
   from this page, and a link-payer has no page open — so the ONE next step
   that works for everybody is the WhatsApp conversation: a "Pick my slot"
   button, a day list, a time list. This panel's job after payment is to say
   exactly that, and then to show the confirmed slot and the address once
   the status poll brings them back.

   ## What this component can and cannot do

   It can open Razorpay's checkout and hand back the values it returns. It
   cannot decide that a payment happened: the server checks an HMAC over
   `order_id|payment_id` against a secret no browser holds, and the address
   only ever arrives from the status endpoint after the server has released
   it. Rewriting this file to claim success would produce a panel with
   nothing to show.
   ═══════════════════════════════════════════════════════════════════════════ */

/** "Sat, 23 Aug at 4:00 pm" — the fixed slot read back in words. */
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
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  /* Paid categories only, and only once the owner has actually said yes.
     `payment.required` is the category's answer, decided when the request was
     made and frozen there. */
  if (request?.status !== 'confirmed') return null;
  if (!request?.payment?.required) return null;

  const payment = request.payment;
  const paid = payment.status === 'paid';

  /*
   * A lapsed confirmation buys nothing, and has to say so.
   *
   * Two reads, because the server moves `status` to `expired` lazily — only
   * when a payment is attempted. `dueBy` is the fact; checking it here means
   * the card appears the moment the window closes rather than after a
   * doomed tap on Pay.
   */
  const lapsed = !paid && (
    payment.status === 'expired'
    || (payment.dueBy && Date.parse(payment.dueBy) < Date.now())
  );

  if (lapsed) {
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

  const amount = payment.amountPaise || 19900;
  const representative = payment.representativePaise || 10000;
  const fee = payment.feePaise ?? Math.max(0, amount - representative);

  const visit = request.lamposeVisit || {};
  const scheduled = visit.status === 'scheduled';
  const manual = visit.status === 'manual';

  /* Attached by the status endpoint once the slot is fixed — never invented
     here. Absent until then, and the panel says why. */
  const address = request.address || '';
  const mapsUrl = address
    ? `https://maps.google.com/?q=${encodeURIComponent(address)}`
    : '';

  const pay = async () => {
    setError('');
    setBusy('Opening the payment window...');
    try {
      const started = await visitRequestsApi.startVisitPayment(request.id);
      if (!started.ok) {
        setError(started.message || 'Could not start the payment.');
        setBusy('');
        return;
      }
      /* Already paid — a second tap, or the WhatsApp link got there first.
         The refresh brings down the paid state; nothing is charged twice. */
      if (started.data?.alreadyPaid) {
        setBusy('');
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
          setBusy('Checking the payment...');
          const confirmed = await visitRequestsApi.confirmVisitPayment(request.id, {
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          setBusy('');
          if (!confirmed.ok) {
            setError(confirmed.message || 'That payment could not be verified.');
            return;
          }
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
  };

  /* ── Scheduled: the slot and the address, which is what ₹199 bought ──── */
  if (paid && scheduled) {
    return (
      <div className="vn">
        <div className="vn__panel">
          <h4 className="vn__title">Your visit is confirmed</h4>
          <div className="vn__slot">
            <span className="vn__slot-k">Assisted visit</span>
            <span className="vn__slot-v">{readSlot(visit.date, visit.time)}</span>
          </div>
          <p className="vn__lead">
            A Lampose representative will meet you at the property — everything is
            arranged with the owner.
          </p>
          {address ? (
            <>
              <p className="vn__meta">📍 {address}</p>
              {mapsUrl ? (
                <a className="vn__cta" href={mapsUrl} target="_blank" rel="noreferrer noopener">
                  Open in Maps
                </a>
              ) : null}
            </>
          ) : null}
          <p className="vn__meta">
            Need a different time? Reply to our WhatsApp message and the team will move it.
          </p>
        </div>
      </div>
    );
  }

  /* ── Manual: they asked for a day or time the lists don't hold ───────── */
  if (paid && manual) {
    return (
      <div className="vn">
        <div className="vn__panel">
          <h4 className="vn__title">Our team is arranging your visit</h4>
          <p className="vn__lead">
            Your payment is confirmed. You asked for a time outside the usual slots, so a
            Lampose team member will call you shortly to fix the day and time — the full
            address comes with it.
          </p>
        </div>
      </div>
    );
  }

  /* ── Paid, no slot yet: the next step lives on WhatsApp ──────────────── */
  if (paid) {
    return (
      <div className="vn">
        <div className="vn__panel">
          <h4 className="vn__title">Payment received — pick your slot on WhatsApp</h4>
          <p className="vn__lead">
            Your ₹199 assisted visit is booked. We have sent you a WhatsApp message —
            tap <strong>Pick my slot</strong> there and choose a day and time. The full
            address arrives the moment your slot is fixed, and this page updates on its
            own.
          </p>
          <p className="vn__meta">
            Can&apos;t find the message? It is from the Lampose WhatsApp number that
            confirmed your request.
          </p>
        </div>
      </div>
    );
  }

  /* ── Unpaid: the breakdown and the one button ────────────────────────── */
  return (
    <div className="vn">
      <div className="vn__panel">
        <h4 className="vn__title">Lampose Assisted Visit</h4>
        <p className="vn__price">
          <b>{rupees(amount)}</b>
          <span>total</span>
        </p>

        {/* The same two lines the WhatsApp message shows, so the price is
            explained identically on both surfaces. */}
        <div className="vn__split">
          <span className="vn__split-row">
            <span>A Lampose representative accompanies you on the visit</span>
            <b>{rupees(representative)}</b>
          </span>
          <span className="vn__split-row">
            <span>Lampose fee</span>
            <b>{rupees(fee)}</b>
          </span>
          <span className="vn__split-row is-now">
            <span>Total</span>
            <b>{rupees(amount)}</b>
          </span>
        </div>

        <ul className="vn__list">
          <li>A Lampose representative meets you at the property</li>
          <li>Visit coordination with the owner — you never need their number</li>
          <li>Pick your date and time on WhatsApp right after paying</li>
          <li>The full address comes with your confirmed slot</li>
        </ul>

        {error ? <p className="vn__err">{error}</p> : null}

        <button type="button" className="vn__cta" onClick={pay} disabled={Boolean(busy)}>
          {busy || `Pay ${rupees(amount)}`}
        </button>

        <p className="vn__meta">
          Prefer WhatsApp? The same payment link is in the message we sent you — paying
          there works exactly the same.
        </p>
      </div>
    </div>
  );
}
