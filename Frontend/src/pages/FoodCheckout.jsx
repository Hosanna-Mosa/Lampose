import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Aside, Box, FieldSet, Heading, Inline, Input, Label, Legend, PlainButton, Region, Text,
} from '../components/common/atoms';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { BillLines } from '../components/food/molecules/BillLines';
import { PhotoTile } from '../components/food/atoms/PhotoTile';
import { ActiveOrder } from '../components/food/organisms/ActiveOrder';
import { useCart } from '../food/CartProvider';
import { ENFORCE_MINIMUM } from '../food/cart';
import { useReveals } from '../hooks/useSite';
import { ADDRESSES, PAYMENT_METHODS, rupees } from '../data/food';

/* ══ Checkout ═════════════════════════════════════════════════════════════
   Where it goes and how it is paid for, on one screen.

   ## An address that cannot be delivered to says so, here

   Not after payment. The unserviceable address stays in the list, disabled,
   with the reason in a sentence and a way out — pickup, or a kitchen that
   does reach it. A hidden address reads as a deleted address.

   ## What this mock does NOT do

   No Razorpay, no signature, no order written to a server. `placeOrder()`
   builds the order in memory and this page goes to its tracking screen. In
   the wired-up version the only thing that may write `paid` is a verified
   Razorpay signature, and an unpaid online order is invisible to the
   kitchen — which is why this page says that out loud under the methods.
   ════════════════════════════════════════════════════════════════════════ */

export function FoodCheckout() {
  const {
    lines, kitchen, bill, coupon, fulfilment, addressId, setAddressId, payment, setPayment, placeOrder,
  } = useCart();
  const navigate = useNavigate();

  const [instructions, setInstructions] = useState('Gate closes at 10 pm, call from outside');
  const [phone, setPhone] = useState('+91 98490 12345');

  useReveals([lines.length, payment, addressId]);

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

  const chosen = ADDRESSES.find(a => a.id === addressId);

  /* Two things stop an order being placed, and both are checked HERE as well
     as in the cart: this page has its own URL, and a rule enforced only by
     the button on the previous screen is not enforced at all. */
  const unreachable = fulfilment === 'delivery' && !chosen?.serviceable;
  const underMinimum = bill.shortOfMinimum > 0;
  /* An address we cannot reach is a hard stop — there is nowhere to send the
     rider. The kitchen's minimum only stops the order when the site is set to
     enforce it; see ENFORCE_MINIMUM in food/cart.js. */
  const blocked = unreachable || (ENFORCE_MINIMUM && underMinimum);

  const place = () => {
    const order = placeOrder();
    navigate(`/food/orders/${order.reference}`);
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
            <Icon name="verified" className="fd-ico" /> Payment is taken by Razorpay. Card details never reach Lampose.
          </Text>
        </Box>

        <Box className="fd-two">
          <Box className="fd-two__main">

            {/* ── address ───────────────────────────────────────────────── */}
            {fulfilment === 'delivery' ? (
              <Box className="fd-panel fd-panel--lift reveal">
                <Box className="fd-panel__head">
                  <Heading level={2} className="fd-panel__title">Where should the rider come?</Heading>
                  <PlainButton type="button" className="fd-btn fd-btn--ghost fd-btn--sm">
                    <Icon name="pin" className="fd-ico" />
                    Use my location
                  </PlainButton>
                </Box>

                <FieldSet className="fd-field">
                  <Legend className="fd-sr">Saved addresses</Legend>
                  {ADDRESSES.map(addr => (
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
                        ? <Inline className="fd-link">Edit</Inline>
                        : <Link to="/food" className="fd-link">See kitchens</Link>}
                    </Label>
                  ))}
                </FieldSet>

                <PlainButton type="button" className="fd-btn fd-btn--dashed fd-btn--full">
                  + Add a new address
                </PlainButton>

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
                    <Label htmlFor="fd-phone">Phone for the hand-over</Label>
                    <Input id="fd-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
                  </Box>
                </Box>
              </Box>
            ) : (
              <Box className="fd-panel fd-panel--lift reveal">
                <Heading level={2} className="fd-panel__title">Collecting it yourself</Heading>
                <Box className="fd-addr">
                  <Icon name="store" className="fd-ico" />
                  <Box className="fd-addr__text">
                    <Inline className="fd-addr__title">{kitchen.name}</Inline>
                    <Inline className="fd-addr__detail">
                      {kitchen.landmark} · ready in about {kitchen.prepMinutes} minutes
                    </Inline>
                  </Box>
                  <Link to="/food/cart" className="fd-link">Switch to delivery</Link>
                </Box>
                <Text className="fd-note">
                  You get a four-digit code to read out at the counter. No delivery fee is charged on a pickup.
                </Text>
              </Box>
            )}

            {/* ── payment ───────────────────────────────────────────────── */}
            <Box className="fd-panel fd-panel--lift reveal">
              <Heading level={2} className="fd-panel__title">How would you like to pay?</Heading>

              <FieldSet className="fd-field">
                <Legend className="fd-sr">Payment method</Legend>
                {PAYMENT_METHODS.map(method => (
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
                      <Inline className="fd-choice__detail">
                        {method.id === 'cod'
                          ? `Keep ${rupees(bill.toPay)} ready. The rider carries no change above ₹100.`
                          : method.note}
                      </Inline>
                    </Box>
                    {method.tag && <Inline className="fd-choice__tag">{method.tag}</Inline>}
                  </Label>
                ))}
              </FieldSet>

              <Box className="fd-callout">
                <Icon name="info" className="fd-ico" />
                <Text>
                  If an online payment fails or you close the Razorpay window, the order stays unpaid and is never
                  sent to the kitchen. You can retry from <Link to="/food/orders" className="fd-link">My orders</Link> for
                  15 minutes.
                </Text>
              </Box>
            </Box>
          </Box>

          {/* ── summary ─────────────────────────────────────────────────── */}
          <Aside className="fd-two__side" aria-label="Order summary">
            <Box className="fd-panel fd-panel--lift fd-sticky">
              <Box className="fd-cart__head fd-cart__head--tight">
                <PhotoTile tone={kitchen.tone} className="fd-cart__thumb" />
                <Box className="fd-cart__headText">
                  <Inline className="fd-cart__name">{kitchen.name}</Inline>
                  <Inline className="fd-cart__meta">
                    {bill.count} item{bill.count === 1 ? '' : 's'} ·{' '}
                    {fulfilment === 'delivery' ? `delivery to ${chosen?.title}` : 'pickup'}
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
                payLabel={payment === 'cod' ? 'Pay on delivery' : 'To pay now'}
              />

              <PlainButton
                type="button"
                className="fd-btn fd-btn--dark fd-btn--full fd-btn--lg"
                disabled={blocked}
                onClick={place}
              >
                {payment === 'cod'
                  ? `Place order · ${rupees(bill.toPay)} on delivery`
                  : `Pay ${rupees(bill.toPay)} with ${payment === 'upi' ? 'UPI' : 'card'}`}
              </PlainButton>

              {underMinimum && (
                <Text className="fd-note fd-note--warn" role="status">
                  {kitchen.name} usually takes orders from {rupees(kitchen.minOrder)} — this one is
                  {' '}{rupees(bill.shortOfMinimum)} under{ENFORCE_MINIMUM ? ', so it cannot be placed yet.' : '.'}
                </Text>
              )}

              {unreachable && (
                <Text className="fd-note fd-note--warn" role="alert">
                  Pick a serviceable address, or switch to pickup, before placing this order.
                </Text>
              )}

              <Text className="fd-note fd-note--center">
                By placing this order you accept the <Link to="/terms" className="fd-link">order terms</Link>.
                Cancellation is free until the kitchen accepts.
              </Text>
            </Box>

            <Box className="fd-panel">
              <Text className="fd-lbl">At the door</Text>
              <Box className="fd-otp">
                <Box className="fd-otp__boxes" aria-hidden="true">
                  <Inline>•</Inline><Inline>•</Inline><Inline>•</Inline><Inline>•</Inline>
                </Box>
                <Text className="fd-note">
                  A four-digit code appears here once the order is placed. Read it out to the rider — it is how the
                  hand-over is confirmed.
                </Text>
              </Box>
            </Box>
          </Aside>
        </Box>
      </Box>
    </Region>
  );
}
