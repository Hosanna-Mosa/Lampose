import React, { useState } from 'react';

import visitRequestsApi from '../../../../api/visitRequestsApi';
import { loadCheckout, rupees } from '../../../../lib/razorpayCheckout';
import { Anchor, Bold, Box, Heading, Inline, List, ListItem, PlainButton, Strong, Text } from '../../atoms';

/* ═══════════════════════════════════════════════════════════════════════════
   The one payment a confirmed customer makes, and what happens after it.

   The owner has replied AVAILABLE. From here the flow is a single product:
   an assisted visit, paid in one shot, priced by the layout asked about
   (₹199 for a 1 RK up to ₹2,499 for a 5 BHK; ₹1,999 for Commercial). The
   amount is the one frozen on the request — never re-derived here — and it
   is shown as ONE total; the old "₹100 representative + ₹99 fee" split is
   retired, as are the ₹99 contact unlock and the ₹20 token before it.

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

export function VisitNextSteps({ request, onUpdated }) {
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
      <Box className="vn">
        <Box className="vn__panel">
          <Heading level={4} className="vn__title">This confirmation has lapsed</Heading>
          <Text className="vn__lead">
            The owner held the place for a while and nothing was arranged. Ask again and
            they can confirm a fresh visit.
          </Text>
        </Box>
      </Box>
    );
  }

  const amount = payment.amountPaise || 19900;

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

  /* ── Scheduled: the slot and the address, which is what the fee bought ─ */
  if (paid && scheduled) {
    return (
      <Box className="vn">
        <Box className="vn__panel">
          <Heading level={4} className="vn__title">Your visit is confirmed</Heading>
          <Box className="vn__slot">
            <Inline className="vn__slot-k">Assisted visit</Inline>
            <Inline className="vn__slot-v">{readSlot(visit.date, visit.time)}</Inline>
          </Box>
          <Text className="vn__lead">
            A Lampose representative will meet you at the property — everything is
            arranged with the owner.
          </Text>
          {address ? (
            <>
              <Text className="vn__meta">📍 {address}</Text>
              {mapsUrl ? (
                <Anchor className="vn__cta" href={mapsUrl} target="_blank" rel="noreferrer noopener">
                  Open in Maps
                </Anchor>
              ) : null}
            </>
          ) : null}
          <Text className="vn__meta">
            Any further details come to you on WhatsApp. Need a different time? Reply to
            our WhatsApp message and the team will move it.
          </Text>
        </Box>
      </Box>
    );
  }

  /* ── Manual: they asked for a day or time the lists don't hold ───────── */
  if (paid && manual) {
    return (
      <Box className="vn">
        <Box className="vn__panel">
          <Heading level={4} className="vn__title">Our team is arranging your visit</Heading>
          <Text className="vn__lead">
            Your payment is confirmed. You asked for a time outside the usual slots, so a
            Lampose team member will call you shortly to fix the day and time — the full
            address comes with it.
          </Text>
          <Text className="vn__meta">
            Further details about your visit will come to you on WhatsApp.
          </Text>
        </Box>
      </Box>
    );
  }

  /* ── Paid, no slot yet: the next step lives on WhatsApp ──────────────── */
  if (paid) {
    return (
      <Box className="vn">
        <Box className="vn__panel">
          <Heading level={4} className="vn__title">Payment received — pick your slot on WhatsApp</Heading>
          <Text className="vn__lead">
            Your {rupees(amount)} assisted visit is booked. <Strong>Further details come to
            you on WhatsApp</Strong> — we have sent you a message there: tap{' '}
            <Strong>Pick my slot</Strong> and choose a day and time. The full address
            arrives the moment your slot is fixed, and this page updates on its own.
          </Text>
          <Text className="vn__meta">
            Can&apos;t find the message? It is from the Lampose WhatsApp number that
            confirmed your request.
          </Text>
        </Box>
      </Box>
    );
  }

  /* ── Unpaid: the breakdown and the one button ────────────────────────── */
  return (
    <Box className="vn">
      <Box className="vn__panel">
        <Heading level={4} className="vn__title">Lampose Assisted Visit</Heading>
        <Text className="vn__price">
          <Bold>{rupees(amount)}</Bold>
          <Inline>total</Inline>
        </Text>

        <List className="vn__list">
          <ListItem>A Lampose representative meets you at the property</ListItem>
          <ListItem>Visit coordination with the owner — you never need their number</ListItem>
          <ListItem>Pick your date and time on WhatsApp right after paying</ListItem>
          <ListItem>Further details about your visit come to you on WhatsApp</ListItem>
          <ListItem>The full address comes with your confirmed slot</ListItem>
        </List>

        {error ? <Text className="vn__err">{error}</Text> : null}

        <PlainButton type="button" className="vn__cta" onClick={pay} disabled={Boolean(busy)}>
          {busy || `Pay ${rupees(amount)}`}
        </PlainButton>

        <Text className="vn__meta">
          Prefer WhatsApp? The same payment link is in the message we sent you — paying
          there works exactly the same.
        </Text>
      </Box>
    </Box>
  );
}
