/* ══════════════════════════════════════════════════════════════════════════
   Paying for a food order on the website.

   The order is written FIRST and paid second. That is not an accident of the
   API: `paymentStatus: 'paid'` has exactly one cause in this product — a
   Razorpay signature the server verified against its own secret — so there has
   to be an order for the signature to be about. Until it verifies, the order
   sits unpaid, the kitchen has not been told, and no rider is looked for.

   Which means every failure here leaves the same state: a real order nobody is
   cooking. So this resolves with what happened rather than throwing it away —
   `paid`, `dismissed` (they closed the window), or an error — and the caller
   sends the diner somewhere they can try again, instead of leaving them on a
   page that has forgotten their order exists.

   The amount is never passed in. It is read from the order on the server, and
   the window is opened with what that call answered.
   ══════════════════════════════════════════════════════════════════════════ */
import { startFoodPayment, verifyFoodPayment } from '../api/foodApi';
import { loadCheckout } from '../lib/razorpayCheckout';

/** The brand green the visit checkout already uses, so one company opens one window. */
const THEME = '#45855a';

/**
 * Open Razorpay for an order and settle it.
 *
 * @param {string} reference  the order number
 * @param {(stage: 'opening'|'verifying') => void} [onStage]  for the button's label
 * @returns {Promise<{paid: boolean, already?: boolean, dismissed?: boolean, error?: Error}>}
 */
export const payForOrder = async (reference, onStage) => {
  if (onStage) onStage('opening');

  const started = await startFoodPayment(reference);

  /* A second tap, or the webhook got there first. Nothing is charged twice —
     the server answers `alreadyPaid` rather than minting another order. */
  if (started.alreadyPaid) return { paid: true, already: true };

  const Razorpay = await loadCheckout();

  return new Promise((resolve) => {
    const checkout = new Razorpay({
      key: started.keyId,
      order_id: started.razorpayOrderId,
      amount: started.amountPaise,
      currency: started.currency || 'INR',
      name: started.name || 'Lampose',
      description: started.description || `Order ${reference}`,
      prefill: started.prefill || {},
      theme: { color: THEME },

      handler: async (response) => {
        if (onStage) onStage('verifying');
        try {
          /* Three strings, handed over for the server to check. This is not
             "it worked" — the server decides that, and only it can. */
          await verifyFoodPayment(reference, {
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          resolve({ paid: true });
        } catch (error) {
          /* Money may well have left their account — the webhook settles that
             within a minute. So this says "we are checking", never "it failed". */
          resolve({ paid: false, error });
        }
      },

      modal: {
        /* Closing the window is not an error and not a lost order: the order
           stays open and the page it lands on offers to pay again. */
        ondismiss: () => resolve({ paid: false, dismissed: true }),
      },
    });

    checkout.open();
  });
};

export default payForOrder;
