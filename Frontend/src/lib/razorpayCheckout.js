/* ══════════════════════════════════════════════════════════════════════════
   Razorpay's checkout script, loaded once.

   Two panels now open a checkout — the visit token and the ₹99 contact
   unlock — and they must share this rather than each carrying a copy. Two
   copies means two `<script>` tags racing for the same global, and the loser
   resolves with a `window.Razorpay` the other is still overwriting.

   Loaded lazily on purpose: it is a third-party script on a marketing site,
   and nobody browsing listings should pay for it. It is fetched the first
   time somebody actually presses Pay.

   This module can open a payment window. It cannot decide that a payment
   happened — the server recomputes an HMAC over `order_id|payment_id` with a
   secret no browser holds, and only that marks anything paid.
   ══════════════════════════════════════════════════════════════════════════ */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/* The in-flight promise, so two buttons pressed in quick succession wait on
   one load rather than starting a second. */
let pending = null;

/** Resolve with `window.Razorpay`, loading the script if it is not there. */
export const loadCheckout = () => {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const done = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error('Could not load the payment window.'));
    };
    const failed = () => {
      /* Cleared so a later attempt can retry — a dropped connection now must
         not make the button permanently dead. */
      pending = null;
      reject(new Error('Could not load the payment window.'));
    };

    const existing = document.querySelector(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', done);
      existing.addEventListener('error', failed);
      return;
    }

    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = done;
    script.onerror = failed;
    document.body.appendChild(script);
  });

  return pending;
};

/** Paise to "₹1,234" — the only unit Razorpay accepts, formatted at the edge. */
export const rupees = paise => `₹${((paise || 0) / 100).toLocaleString('en-IN')}`;

export default loadCheckout;
