import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Aside, Box, FieldSet, Heading, Inline, Input, Label, Legend, PlainButton, Region, Text,
} from '../components/common/atoms';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { BillLines } from '../components/food/molecules/BillLines';
import { PhotoTile } from '../components/food/atoms/PhotoTile';
import { ActiveOrder } from '../components/food/organisms/ActiveOrder';
import { useCart } from '../food/CartProvider';
import { useReveals } from '../hooks/useSite';
import { payForOrder } from '../food/payOnline';
import { rupees } from '../data/food';
import { fetchPaymentMethods } from '../api/foodApi';
import { useAuth } from '../auth/AuthProvider';

/* ══ Checkout ═════════════════════════════════════════════════════════════
   Where it goes and how it is paid for, on one screen.

   ## An address that cannot be delivered to says so, here

   Not after payment. The unserviceable address stays in the list, disabled,
   with the reason in a sentence and a way out — another address, or a kitchen
   that does reach this one. A hidden address reads as a deleted address.

   ## This places a REAL order

   `placeOrder()` posts to the same endpoint the Lampose app uses. The server
   prices the order, writes it, and tells the kitchen - it is in the restaurant
   admin's queue by the time this page navigates to its tracking screen.

   ## Two ways to pay, and the online one opens Razorpay HERE

   Cash on delivery places the order and goes straight to tracking. UPI writes
   the order UNPAID and opens Razorpay's own window over this page: the kitchen
   is not told and no rider is looked for until the signature verifies, because
   `paymentStatus: 'paid'` has exactly one cause in this product.

   There is no separate "Card" row any more. It opened the same window as UPI,
   so it was not a choice; what a diner pays with is picked inside Razorpay.

   Closing that window is not a lost order — the order is real and unpaid, so
   this page hands over to tracking, which offers to pay again. Anything else
   would leave a diner on a checkout that has forgotten their order exists.

   ## A refusal is the ordinary case, and it keeps the cart

   A kitchen closes at 11, a dish sells out while the page is open, the total
   comes in under the minimum. The server refuses each in a sentence, that
   sentence is printed under the button, and the cart is left exactly as it
   was so it can be fixed and tried again.
   ════════════════════════════════════════════════════════════════════════ */

export function FoodCheckout() {
  const {
    lines, kitchen, bill, coupon, fulfilment, addresses, addressId, setAddressId, payment, setPayment,
    placeOrder,
  } = useCart();
  const { user, status, isSignedIn, openSignIn } = useAuth();
  const navigate = useNavigate();

  /* Both fields start from what is REAL: the chosen address's own directions,
     and the number this diner verified when they signed in. They used to be
     pre-filled with "Gate closes at 10 pm, call from outside" and a made-up
     +91 98490 12345 — text somebody typed once into a fixture, sitting in a
     live form where a real order would have carried it to a rider. */
  const chosenAddress = addresses.find(a => a.id === addressId) || null;
  const [instructions, setInstructions] = useState('');
  const [phone, setPhone] = useState('');
  useEffect(() => { setInstructions(chosenAddress?.instructions || ''); }, [chosenAddress?.id]);
  useEffect(() => { setPhone(user?.phone || ''); }, [user?.phone]);

  /* The order being placed, and why the last attempt failed. `placing` is what
     greys the button: the cart also refuses a second order while one is in
     flight, so this is the visible half of a rule that does not depend on it. */
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState(null);

  /* What this kitchen accepts — its own two switches, not a fixed list. */
  const [methods, setMethods] = useState([]);
  const [methodsLoaded, setMethodsLoaded] = useState(false);
  const [payable, setPayable] = useState(true);
  useEffect(() => {
    if (!kitchen?.id) return undefined;
    let live = true;
    setMethodsLoaded(false);
    fetchPaymentMethods(kitchen.id)
      .then(res => {
        if (!live) return;
        setMethods(res.methods || []);
        setPayable(res.payable !== false);
        setMethodsLoaded(true);
      })
      /* If the list cannot be fetched the page offers no method rather than a
         guess — choosing one the kitchen does not take is worse than a retry. */
      .catch(() => { if (live) { setMethods([]); setPayable(false); setMethodsLoaded(true); } });
    return () => { live = false; };
  }, [kitchen?.id]);

  /* Every method this kitchen offers can be used here now — the online one
     opens Razorpay over this page. What is listed is what is usable. */
  const usable = methods;

  /* A method held from an earlier session that this kitchen no longer takes
     (it switched cash or online off) is replaced by the first one it does. */
  useEffect(() => {
    if (methods.length && !methods.some(m => m.id === payment)) setPayment(methods[0].id);
  }, [methods, payment, setPayment]);

  /* Cash goes straight to tracking; anything else is paid before it is cooked. */
  const payingOnline = usable.some(m => m.id === payment && m.online);

  /* The order that exists but is not paid for: they closed Razorpay, or the
     verification is still being answered. Kept so the button pays for THAT
     order instead of placing a second one. */
  const [unpaidRef, setUnpaidRef] = useState(null);
  const [payStage, setPayStage] = useState('');

  useReveals([lines.length, payment, addressId]);

  /*
   * A guest never reaches the payment form.
   *
   * Checked BEFORE the empty-cart message, because a guest's cart is always
   * empty (the cart refuses to fill for one) - so "there is nothing to pay
   * for" would be true and useless: it hides the reason and the way in. The
   * URL can be typed by anybody, which is why this is a page-level guard and
   * not just a hidden button. `status`, not `isSignedIn`: while the stored
   * session is still being read the answer is not "no", it is "not yet".
   */
  if (status === 'guest') {
    return (
      <Region id="food">
        <Box className="sec-inner">
          <Box className="fd-empty fd-empty--page">
            <Heading level={1} className="fd-empty__title">Sign in to place an order</Heading>
            <Text className="fd-empty__body">
              You need an account to add food to a cart and pay for it. Browsing kitchens and menus stays open to everyone.
            </Text>
            <PlainButton type="button" className="fd-btn fd-btn--dark" onClick={openSignIn}>Sign in</PlainButton>
            <Link to="/food" className="fd-btn fd-btn--ghost">Browse kitchens</Link>
          </Box>
        </Box>
      </Region>
    );
  }

  if (!lines.length || !kitchen) {
    return (
      <Region id="food">
        <Box className="sec-inner">
          <Box className="fd-empty fd-empty--page">
            <Heading level={1} className="fd-empty__title">There is nothing to pay for</Heading>
            <Text className="fd-empty__body">Your cart is empty, so there is no order to place.</Text>
            <Link to="/food" className="fd-btn fd-btn--dark">Browse kitchens</Link>
          </Box>
        </Box>
      </Region>
    );
  }

  const chosen = chosenAddress;

  /* Two things stop an order being placed, and both are checked HERE as well
     as in the cart: this page has its own URL, and a rule enforced only by
     the button on the previous screen is not enforced at all. */
  const unreachable = fulfilment === 'delivery' && !chosen?.serviceable;
  /* An address we cannot reach is a hard stop — there is nowhere to send the
     rider. A kitchen minimum was the other one and is gone: there is no
     minimum order any more, here or on the server. */
  const blocked = placing || unreachable || !payable || !usable.length;

  /**
   * What the diner is told when the order did not go through.
   *
   * The server's own 4xx messages are written for exactly this - "Paradise
   * Biryani House is closed right now.", "Filter Coffee has just sold out." -
   * so they are shown as they are. The two that are NOT the server speaking get
   * words of their own: no reply at all (nothing was ordered, and it is safe to
   * try again) and a fault on the server's side.
   */
  const sayWhy = error => {
    if (!error.status && !error.code) {
      return 'We could not reach Lampose, so nothing was ordered. Check your connection and try again.';
    }
    if (error.status >= 500) {
      return 'Something went wrong on our side. Your cart is safe - please try again in a moment.';
    }
    return error.message || 'That order could not be placed.';
  };

  const place = async () => {
    setPlaceError(null);
    setPlacing(true);

    /* An order that is already written and unpaid is PAID, never placed again.
       The commonest way to reach this button twice is closing Razorpay and
       changing your mind, and a second order is not what that means. */
    let reference = unpaidRef;

    if (!reference) {
      const result = await placeOrder({ instructions });

      /* The session ended while this page was open: sign in rather than a
         tracking page for an order that does not exist. */
      if (result.authRequired) { setPlacing(false); openSignIn(); return; }
      if (result.error) { setPlacing(false); setPlaceError(result.error); return; }

      reference = result.order.orderNumber;

      if (!payingOnline) {
        setPlacing(false);
        navigate(`/food/orders/${reference}`);
        return;
      }
      setUnpaidRef(reference);
    }

    try {
      const outcome = await payForOrder(reference, setPayStage);
      setPayStage('');
      setPlacing(false);

      /* Paid, or paid a moment ago — either way the kitchen has it now. */
      if (outcome.paid) { navigate(`/food/orders/${reference}`); return; }

      /* Not paid, and the order is real. Tracking is where it can be paid for
         again, and where a refresh would have landed them anyway. */
      navigate(`/food/orders/${reference}`);
    } catch (error) {
      /* The gateway would not even open. The order stands, unpaid, and the
         button now says "Pay" for it rather than placing another. */
      setPayStage('');
      setPlacing(false);
      setPlaceError(error);
    }
  };

  return (
    <Region id="food">
      <Box className="sec-inner">

        <ActiveOrder />

        <Box className="fd-steps" aria-label="Order steps">
          <Inline className="fd-step2 is-done"><Inline className="fd-step2__n">✓</Inline>Cart</Inline>
          <Inline className="fd-step2__line" aria-hidden="true" />
          <Inline className="fd-step2 is-now"><Inline className="fd-step2__n">2</Inline>Address &amp; payment</Inline>
          <Inline className="fd-step2__line" aria-hidden="true" />
          <Inline className="fd-step2"><Inline className="fd-step2__n">3</Inline>Track</Inline>
        </Box>

        <Box className="fd-pageHead">
          <Heading level={1} className="fd-h1">Checkout</Heading>
          <Text className="fd-pageHead__note">
            <Icon name="verified" className="fd-ico" /> Pay in cash when it arrives.
          </Text>
        </Box>

        <Box className="fd-two">
          <Box className="fd-two__main">

            {/* ── address ───────────────────────────────────────────────── */}
            {/* Every order is delivered — collection is no longer offered, and
                the "Collecting it yourself" panel that stood beside this one
                went with it. */}
            {fulfilment === 'delivery' && (
              <Box className="fd-panel fd-panel--lift reveal">
                <Box className="fd-panel__head">
                  <Heading level={2} className="fd-panel__title">Where should the rider come?</Heading>
                  {/* The book is edited on its own page — this panel chooses
                      between what is in it. The button here used to do
                      nothing at all. */}
                  <Link to="/food/address?next=/food/checkout" className="fd-btn fd-btn--ghost fd-btn--sm">
                    <Icon name="pin" className="fd-ico" />
                    Manage addresses
                  </Link>
                </Box>

                {/* Two states a fixture never had: nobody signed in, and a diner
                    with no saved address. Each says what to do next, because a
                    blank list under "Where should the rider come?" reads as
                    broken. */}
                {!isSignedIn && (
                  <Box className="fd-callout">
                    <Icon name="info" className="fd-ico" />
                    <Text>
                      Sign in to choose where the rider should come.{' '}
                      <PlainButton type="button" className="fd-link" onClick={openSignIn}>Sign in</PlainButton>
                    </Text>
                  </Box>
                )}
                {isSignedIn && addresses.length === 0 && (
                  <Box className="fd-callout">
                    <Icon name="info" className="fd-ico" />
                    <Text>
                      You have no saved addresses yet.{' '}
                      <Link to="/food/address?next=/food/checkout&new=1" className="fd-link">Add one</Link>
                      {' '}An order needs somewhere to go.
                    </Text>
                  </Box>
                )}

                <FieldSet className="fd-field">
                  <Legend className="fd-sr">Saved addresses</Legend>
                  {addresses.map(addr => (
                    <Label
                      key={addr.id}
                      className={`fd-choice fd-choice--block${addressId === addr.id ? ' is-on' : ''}${addr.serviceable ? '' : ' is-off'}`}
                    >
                      <Input
                        type="radio"
                        name="address"
                        checked={addressId === addr.id}
                        disabled={!addr.serviceable}
                        onChange={() => setAddressId(addr.id)}
                      />
                      <Box className="fd-choice__text">
                        <Inline className="fd-choice__title">
                          {addr.title}
                          {addr.isDefault && <Inline className="fd-tag">DEFAULT</Inline>}
                          {addr.fromBooking && <Inline className="fd-tag fd-tag--plain">FROM YOUR STAY</Inline>}
                        </Inline>
                        <Inline className="fd-choice__detail">
                          {addr.serviceable ? addr.detail : addr.unserviceableNote}
                        </Inline>
                        {addr.serviceable && addr.hasPin && (
                          <Inline className="fd-choice__hint">Pin dropped · a rider can be searched for around this door</Inline>
                        )}
                      </Box>
                      {addr.serviceable
                        ? (
                          <Link to={`/food/address?next=/food/checkout&edit=${addr.id}`} className="fd-link">
                            Edit
                          </Link>
                        )
                        : <Link to="/food" className="fd-link">See kitchens</Link>}
                    </Label>
                  ))}
                </FieldSet>

                <Link to="/food/address?next=/food/checkout&new=1" className="fd-btn fd-btn--dashed fd-btn--full">
                  + Add a new address
                </Link>

                <Box className="fd-fieldRow">
                  <Box className="fd-field">
                    <Label htmlFor="fd-inst">Directions for the rider</Label>
                    <Input
                      id="fd-inst"
                      type="text"
                      value={instructions}
                      onChange={e => setInstructions(e.target.value)}
                    />
                  </Box>
                  <Box className="fd-field fd-field--narrow">
                    {/* Read-only: the order carries the number this account signed
                        in with, and the server takes it from the session - a box
                        that accepted edits would let somebody type a number that
                        was then quietly ignored. */}
                    <Label htmlFor="fd-phone">Phone for the hand-over</Label>
                    <Input id="fd-phone" type="tel" value={phone} readOnly />
                  </Box>
                </Box>
              </Box>
            )}

            {/* ── payment ───────────────────────────────────────────────── */}
            <Box className="fd-panel fd-panel--lift reveal">
              <Heading level={2} className="fd-panel__title">How would you like to pay?</Heading>

              <FieldSet className="fd-field">
                <Legend className="fd-sr">Payment method</Legend>
                {methods.map(method => (
                  <Label
                    key={method.id}
                    className={`fd-choice fd-choice--block${payment === method.id ? ' is-on' : ''}`}
                  >
                    <Input
                      type="radio"
                      name="payment"
                      checked={payment === method.id}
                      onChange={() => setPayment(method.id)}
                    />
                    <Inline className="fd-choice__badge"><Icon name={method.icon} className="fd-ico" /></Inline>
                    <Box className="fd-choice__text">
                      <Inline className="fd-choice__title">{method.label}</Inline>
                      <Inline className="fd-choice__detail">{method.note}</Inline>
                    </Box>
                    {method.tag && <Inline className="fd-choice__tag">{method.tag}</Inline>}
                  </Label>
                ))}
              </FieldSet>

              {methodsLoaded && !payable && (
                <Text className="fd-note fd-note--warn" role="alert">
                  {kitchen.name} is not taking any payment method right now, so an order cannot be placed with it.
                </Text>
              )}

              <Box className="fd-callout">
                <Icon name="info" className="fd-ico" />
                <Text>
                  The kitchen is told the moment you place the order, and you can follow it on the next screen.
                </Text>
              </Box>
            </Box>
          </Box>

          {/* ── summary ─────────────────────────────────────────────────── */}
          <Aside className="fd-two__side" aria-label="Order summary">
            <Box className="fd-panel fd-panel--lift fd-sticky">
              <Box className="fd-cart__head fd-cart__head--tight">
                <PhotoTile tone={kitchen.tone} src={kitchen.logoUrl || kitchen.coverUrl} alt={kitchen.name} width={160} className="fd-cart__thumb" />
                <Box className="fd-cart__headText">
                  <Inline className="fd-cart__name">{kitchen.name}</Inline>
                  <Inline className="fd-cart__meta">
                    {bill.count} item{bill.count === 1 ? '' : 's'} ·{' '}
                    {chosen ? `delivery to ${chosen.title}` : 'delivery'}
                  </Inline>
                </Box>
                <Link to="/food/cart" className="fd-link">Edit</Link>
              </Box>

              <Box className="fd-rule" />

              {lines.map(line => (
                <Box className="fd-bill__row" key={line.uid}>
                  <Inline>{line.name} ×{line.qty}</Inline>
                  <Inline className="fd-bill__val">{rupees(line.unitPrice * line.qty)}</Inline>
                </Box>
              ))}

              <Box className="fd-rule" />

              <BillLines
                bill={bill}
                fulfilment={fulfilment}
                couponCode={coupon?.code}
                payLabel={payingOnline ? 'To pay now' : 'Pay on delivery'}
              />

              <PlainButton
                type="button"
                className="fd-btn fd-btn--dark fd-btn--full fd-btn--lg"
                disabled={blocked}
                onClick={place}
              >
                {placing
                  ? (payStage === 'verifying' ? 'Checking the payment…'
                    : payStage === 'opening' ? 'Opening Razorpay…'
                      : 'Placing your order…')
                  : payingOnline
                    ? `${unpaidRef ? 'Pay again' : 'Pay'} · ${rupees(bill.toPay)}`
                    : `Place order · ${rupees(bill.toPay)} on delivery`}
              </PlainButton>

              {/* Why the last attempt did not go through - the server's own sentence
                  where it wrote one. The cart is untouched, so the way forward is
                  to fix the thing and press the button again. */}
              {placeError && (
                <Box className="fd-note fd-note--warn" role="alert">
                  <Text>{sayWhy(placeError)}</Text>
                  {['DISH_UNAVAILABLE', 'DISH_SOLD_OUT', 'VARIANT_UNAVAILABLE'].includes(placeError.code) && (
                    <Link to="/food/cart" className="fd-link">Review your cart</Link>
                  )}
                </Box>
              )}


              {unreachable && (
                <Text className="fd-note fd-note--warn" role="alert">
                  Pick an address we can deliver to before placing this order.
                </Text>
              )}

              <Text className="fd-note fd-note--center">
                By placing this order you accept the <Link to="/terms" className="fd-link">order terms</Link>.
                Cancellation is free until the kitchen accepts.
              </Text>
            </Box>

            {/* Only for a delivery: a pickup has no rider and no code to read out
                (the server never sends a diner a pickup code). */}
            {fulfilment === 'delivery' && (
              <Box className="fd-panel">
                <Text className="fd-lbl">At the door</Text>
                <Box className="fd-otp">
                  <Box className="fd-otp__boxes" aria-hidden="true">
                    <Inline>•</Inline><Inline>•</Inline><Inline>•</Inline><Inline>•</Inline>
                  </Box>
                  <Text className="fd-note">
                    A four-digit code appears on the next screen once the order is placed. Read it out to the rider — it
                    is how the hand-over is confirmed.
                  </Text>
                </Box>
              </Box>
            )}
          </Aside>
        </Box>
      </Box>
    </Region>
  );
}
