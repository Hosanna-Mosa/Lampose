import React, { useCallback, useEffect, useState } from 'react';

import visitRequestsApi from '../api/visitRequestsApi';

/* ══════════════════════════════════════════════════════════════════════════
   What happens after a bachelor or co-live owner says yes.

     pay a small token  →  choose a joining date  →  get the address

   ## Why the date is here and not on the listing page

   A joining date asked before anybody has agreed to a viewing is a guess. Asked
   after money has changed hands it is a commitment, which is the whole reason
   the token exists. The address moves with it: an owner's door number is not
   something to hand to everyone who taps a button.

   ## What this component can and cannot do

   It can open Razorpay's checkout and hand back the three values it returns.
   It cannot decide that a payment happened — the server recomputes the HMAC
   over `order_id|payment_id` with a secret no browser holds, and only that
   marks the request paid. If this file were rewritten to claim success, the
   server would still refuse.
   ══════════════════════════════════════════════════════════════════════════ */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/** Load Razorpay's script once, and only when somebody is actually paying. */
const loadCheckout = () => new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve(window.Razorpay);
  const existing = document.querySelector(`script[src="${CHECKOUT_SRC}"]`);
  if (existing) {
    existing.addEventListener('load', () => resolve(window.Razorpay));
    existing.addEventListener('error', () => reject(new Error('Could not load the payment window.')));
    return undefined;
  }
  const script = document.createElement('script');
  script.src = CHECKOUT_SRC;
  script.async = true;
  script.onload = () => resolve(window.Razorpay);
  script.onerror = () => reject(new Error('Could not load the payment window.'));
  document.body.appendChild(script);
  return undefined;
});

const rupees = paise => `₹${((paise || 0) / 100).toLocaleString('en-IN')}`;

const todayPlus = days => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function VisitTokenPanel({ request, onUpdated }) {
  const payment = request?.payment;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [flexible, setFlexible] = useState(true);
  /* Set when THIS page submitted the joining date, which is the only way the
     address used to arrive. It is now also polled — see `shownAddress`. */
  const [address, setAddress] = useState('');

  useEffect(() => { setError(''); }, [payment?.status]);

  const pay = useCallback(async () => {
    setError('');
    setBusy('Opening the payment window...');
    try {
      const started = await visitRequestsApi.startTokenPayment(request.id);
      if (!started.ok) {
        setError(started.message || 'Could not start the payment.');
        setBusy('');
        return;
      }
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
        description: `Visit token · ${order.propertyName || ''}`.trim(),
        prefill: { name: order.customerName || '', contact: order.customerPhone || '' },
        theme: { color: '#45855a' },
        handler: async (response) => {
          setBusy('Checking the payment...');
          const confirmed = await visitRequestsApi.confirmTokenPayment(request.id, {
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
             the button says "Pay" again. */
          ondismiss: () => setBusy(''),
        },
      });
      checkout.open();
    } catch (err) {
      setError(err?.message || 'Something went wrong opening the payment window.');
      setBusy('');
    }
  }, [request?.id, onUpdated]);

  const submitDate = useCallback(async (event) => {
    event.preventDefault();
    setError('');
    setBusy('Saving...');
    const res = await visitRequestsApi.setJoiningDate(request.id, {
      joiningDate,
      flexibleJoin: flexible,
    });
    setBusy('');
    if (!res.ok) {
      setError(res.message || 'Could not save that date.');
      return;
    }
    setAddress(res.data?.address || '');
    if (onUpdated) onUpdated();
  }, [request?.id, joiningDate, flexible, onUpdated]);

  if (!payment?.required) return null;
  if (request.status !== 'confirmed') return null;

  /*
   * The address, from whichever source has it.
   *
   * `address` is what the joining-date call returned to this tab. The status
   * endpoint now also carries it once the token is paid, which is what covers
   * the case this panel could not handle: paying on the Razorpay link sent
   * over WhatsApp. That happens on the phone, or in another tab, so nothing
   * here ever returned an address — and a reload lost the local copy too.
   *
   * The server decides whether to send it at all; it is absent until the
   * payment verifies. So taking whichever is present is not a way around the
   * gate, it is just reading the answer.
   */
  const shownAddress = address || request.address || '';

  /*
   * ── paid, and the date already given ────────────────────────────────
   *
   * The DATE is what finishes this flow, so the date is what this branch
   * tests. It used to test the address as well, which was harmless only
   * because the address arrived as the reply to submitting a date — the two
   * could not be apart. They can now: the address is released by the payment
   * and polled, so an address-or-date test sent every paid request straight
   * here and printed "Moving in on ." with nothing after it.
   */
  const movingIn = request.intent?.joiningDate || '';
  if (payment.status === 'paid' && movingIn) {
    return (
      <div className="vt vt--done">
        <h4 className="vt__title">You're set</h4>
        <p className="vt__lead">
          Moving in on {movingIn}. The owner has your number.
        </p>
        {shownAddress ? (
          <p className="vt__addr"><strong>Address</strong><br />{shownAddress}</p>
        ) : null}
      </div>
    );
  }

  /* ── paid, date outstanding ────────────────────────────────────────── */
  if (payment.status === 'paid') {
    return (
      <form className="vt" onSubmit={submitDate}>
        <h4 className="vt__title">When would you move in?</h4>
        <p className="vt__lead">
          {shownAddress
            ? 'Your token is paid and the address is below. Tell the owner when you plan to move in.'
            : "Your token is paid. Pick a date and we'll share the full address."}
        </p>
        {/* Shown here too. The payment released it, and withholding it until
            a date is typed would be holding back something already paid
            for — the customer has it in their WhatsApp either way. */}
        {shownAddress ? (
          <p className="vt__addr"><strong>Address</strong><br />{shownAddress}</p>
        ) : null}
        <label className="vt__field">
          <span className="exp-lbl">Joining date</span>
          <input
            type="date"
            className="si-date"
            required
            min={todayPlus(2)}
            value={joiningDate}
            onChange={e => setJoiningDate(e.target.value)}
          />
        </label>
        <label className="vt__check">
          <input type="checkbox" checked={flexible} onChange={e => setFlexible(e.target.checked)} />
          <span>My dates can move by a day or two</span>
        </label>
        {error ? <p className="vt__err">{error}</p> : null}
        <button type="submit" className="btn btn--primary" disabled={!joiningDate || Boolean(busy)}>
          {busy || 'Save and get the address'}
        </button>
      </form>
    );
  }

  /* ── the window has closed ─────────────────────────────────────────── */
  if (payment.status === 'expired') {
    return (
      <div className="vt vt--lapsed">
        <h4 className="vt__title">This confirmation has lapsed</h4>
        <p className="vt__lead">
          The owner held the place for a while and nobody paid the token. Ask again and they can
          confirm a fresh visit.
        </p>
      </div>
    );
  }

  /* ── pay ───────────────────────────────────────────────────────────── */
  return (
    <div className="vt">
      <h4 className="vt__title">Pay {rupees(payment.amountPaise)} to lock this visit</h4>
      <p className="vt__lead">
        The owner has confirmed. A {rupees(payment.amountPaise)} token holds it — then you pick a
        joining date and we share the full address.
      </p>
      {payment.dueBy ? (
        <p className="vt__meta">
          Confirm by {new Date(payment.dueBy).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
          })}
        </p>
      ) : null}
      {error ? <p className="vt__err">{error}</p> : null}
      <button type="button" className="btn btn--primary" onClick={pay} disabled={Boolean(busy)}>
        {busy || `Pay ${rupees(payment.amountPaise)}`}
      </button>
    </div>
  );
}
