import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Article, Aside, Box, Form, Heading, Inline, Input, Label, PlainButton, Region, Text,
} from '../components/common/atoms';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { DietMark } from '../components/food/atoms/DietMark';
import { PhotoTile } from '../components/food/atoms/PhotoTile';
import { BillLines } from '../components/food/molecules/BillLines';
import { ActiveOrder } from '../components/food/organisms/ActiveOrder';
import { useAddDish } from '../food/useAddDish';
import { useCart } from '../food/CartProvider';
import { ENFORCE_MINIMUM, offersFor } from '../food/cart';
import { useReveals } from '../hooks/useSite';
import { dishesOf, rupees } from '../data/food';

/* ══ Cart ═════════════════════════════════════════════════════════════════
   What was chosen, what it costs, and the one way onward.

   ## The bill is arithmetic, not a promise

   Every figure here is recomputed from the lines by `food/cart.js`, which is
   also what the kitchen panel and the checkout read. The page says out loud
   that prices are re-checked at payment, because a cart left open for an
   hour is quoting a menu that may have changed underneath it.

   ## An offer that cannot run yet is still shown

   With the reason as its chip — "add ₹119 more" is an offer, and a coupon
   hidden until it qualifies is nothing. The one exception is a coupon for a
   different kitchen, which is not an offer on this cart at all.
   ════════════════════════════════════════════════════════════════════════ */

export function FoodCart() {
  const {
    lines, kitchen, bill, coupon, fulfilment, address,
    setQty, remove, applyCoupon, removeCoupon, setFulfilment,
  } = useCart();
  const { openDish, dialogs } = useAddDish();

  const [code, setCode] = useState('');
  const [problem, setProblem] = useState(null);

  useReveals([lines.length]);

  const submitCode = event => {
    event.preventDefault();
    const result = applyCoupon(code);
    if (result.error) { setProblem(result.error); return; }
    setProblem(null);
    setCode('');
  };

  if (!lines.length || !kitchen) {
    return (
      <Region id="food">
        <Box className="sec-inner">
          <Box className="fd-empty fd-empty--page">
            <Inline className="fd-empty__mark"><Icon name="orders" className="fd-ico" /></Inline>
            <Heading level={1} className="fd-empty__title">Nothing in the cart yet</Heading>
            <Text className="fd-empty__body">
              Kitchens near Block C are open now, and four of them serve a full meal under ₹120.
            </Text>
            <Link to="/food" className="fd-btn fd-btn--dark">Browse kitchens</Link>
          </Box>
        </Box>
      </Region>
    );
  }

  const offers = offersFor({ itemTotal: bill.itemTotal, kitchenId: kitchen.id, fulfilment })
    .filter(offer => offer.code !== coupon?.code);

  /* Three cheap things from the same counter. A suggestion from another
     kitchen would be a suggestion to throw this cart away. */
  const alsoFrom = dishesOf(kitchen.id).filter(d => d.goesWellWith && !d.soldOut).slice(0, 3);

  return (
    <Region id="food">
      <Box className="sec-inner">

        <ActiveOrder />

        <Box className="fd-pageHead">
          <Box>
            <Link to={`/food/kitchen/${kitchen.id}`} className="fd-back">
              <Icon name="arrowL" className="fd-ico" />
              Back to {kitchen.name}
            </Link>
            <Heading level={1} className="fd-h1">Your cart</Heading>
          </Box>
          <Text className="fd-pageHead__note">
            Prices are re-checked against the kitchen’s live menu when you pay.
          </Text>
        </Box>

        <Box className="fd-two">
          <Box className="fd-two__main">

            {/* ── the lines ─────────────────────────────────────────────── */}
            <Box className="fd-panel fd-panel--lift fd-panel--flush reveal">
              <Box className="fd-cart__head">
                <PhotoTile tone={kitchen.tone} className="fd-cart__thumb" />
                <Box className="fd-cart__headText">
                  <Inline className="fd-cart__name">{kitchen.name}</Inline>
                  <Inline className="fd-cart__meta">
                    {kitchen.landmark} · counter ready in {kitchen.prepMinutes} min
                  </Inline>
                </Box>
                <Link to={`/food/kitchen/${kitchen.id}`} className="fd-btn fd-btn--ghost fd-btn--sm">
                  Add more items
                </Link>
              </Box>

              <Box className="fd-cart__lines">
                {lines.map(line => (
                  <Article className="fd-line" key={line.uid}>
                    <DietMark diet={line.diet} />
                    <Box className="fd-line__text">
                      <Heading level={3} className="fd-line__name">{line.name}</Heading>
                      <Text className="fd-line__choices">
                        {[
                          line.spice && `${line.spice[0].toUpperCase()}${line.spice.slice(1)} spice`,
                          ...(line.addOns || []).map(a => `${a.label} (+${rupees(a.price)})`),
                        ].filter(Boolean).join(' · ') || 'No add-ons'}
                      </Text>
                      {line.note && <Text className="fd-line__choices">Note: {line.note}</Text>}
                      <Box className="fd-line__actions">
                        <PlainButton
                          type="button"
                          className="fd-link"
                          onClick={() => openDish(dishesOf(kitchen.id).find(d => d.id === line.dishId))}
                        >
                          Edit choices
                        </PlainButton>
                        <PlainButton type="button" className="fd-link fd-link--bad" onClick={() => remove(line.uid)}>
                          Remove
                        </PlainButton>
                      </Box>
                    </Box>

                    <Box className="fd-qty">
                      <PlainButton type="button" onClick={() => setQty(line.uid, line.qty - 1)} aria-label={`One fewer ${line.name}`}>−</PlainButton>
                      <Inline className="fd-qty__n">{line.qty}</Inline>
                      <PlainButton type="button" onClick={() => setQty(line.uid, line.qty + 1)} aria-label={`One more ${line.name}`}>+</PlainButton>
                    </Box>

                    <Inline className="fd-line__price">{rupees(line.unitPrice * line.qty)}</Inline>
                  </Article>
                ))}
              </Box>

              <Box className="fd-cart__foot">
                <Icon name="info" className="fd-ico" />
                <Text>
                  One cart holds one kitchen. Adding a dish from another restaurant will ask before it empties
                  this one.
                </Text>
              </Box>
            </Box>

            {/* ── offers ────────────────────────────────────────────────── */}
            <Box className="fd-panel reveal">
              <Box className="fd-panel__head">
                <Heading level={2} className="fd-panel__title">Offers</Heading>
                <Inline className="fd-section__sub">One coupon per order</Inline>
              </Box>

              {coupon && bill.discount > 0 && (
                <Box className="fd-offer is-applied">
                  <Icon name="check" className="fd-ico" />
                  <Box className="fd-offer__text">
                    <Inline className="fd-offer__code">{coupon.code} applied · you save {rupees(bill.discount)}</Inline>
                    <Inline className="fd-offer__body">{coupon.body}</Inline>
                  </Box>
                  <PlainButton type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={removeCoupon}>
                    Remove
                  </PlainButton>
                </Box>
              )}

              {coupon && bill.couponBlockedReason && (
                <Box className="fd-offer is-blocked">
                  <Box className="fd-offer__text">
                    <Inline className="fd-offer__code">{coupon.code} is held, not applied</Inline>
                    <Inline className="fd-offer__body">{bill.couponBlockedReason}</Inline>
                  </Box>
                  <PlainButton type="button" className="fd-btn fd-btn--ghost fd-btn--sm" onClick={removeCoupon}>
                    Remove
                  </PlainButton>
                </Box>
              )}

              {offers.map(offer => (
                <Box className="fd-offer is-dashed" key={offer.code}>
                  <Box className="fd-offer__text">
                    <Inline className="fd-offer__code">{offer.code} · {offer.headline}</Inline>
                    <Inline className="fd-offer__body">
                      {offer.body}{offer.blockedReason ? ` · ${offer.blockedReason}` : ''}
                    </Inline>
                  </Box>
                  {offer.blockedReason
                    ? <Inline className="fd-chip fd-chip--neutral">Not yet</Inline>
                    : (
                      <PlainButton
                        type="button"
                        className="fd-btn fd-btn--ghost fd-btn--sm"
                        onClick={() => applyCoupon(offer.code)}
                      >
                        Apply
                      </PlainButton>
                    )}
                </Box>
              ))}

              <Form className="fd-codeRow" onSubmit={submitCode}>
                <Label className="fd-sr" htmlFor="fd-code">Coupon code</Label>
                <Input
                  id="fd-code"
                  type="text"
                  placeholder="Enter another code"
                  value={code}
                  onChange={e => { setCode(e.target.value); setProblem(null); }}
                />
                <PlainButton type="submit" className="fd-btn fd-btn--ghost">Apply</PlainButton>
              </Form>
              {problem && <Text className="fd-note fd-note--warn" role="alert">{problem}</Text>}
            </Box>

            {/* ── goes well with ────────────────────────────────────────── */}
            {alsoFrom.length > 0 && (
              <Box className="fd-panel reveal">
                <Heading level={2} className="fd-panel__title">Goes well with</Heading>
                <Box className="fd-addons">
                  {alsoFrom.map(dish => (
                    <Box className="fd-addon" key={dish.id}>
                      <PhotoTile tone={dish.tone} className="fd-addon__thumb" />
                      <Box className="fd-addon__text">
                        <Inline className="fd-addon__name">{dish.name}</Inline>
                        <Inline className="fd-addon__price">{rupees(dish.price)}</Inline>
                      </Box>
                      <PlainButton type="button" className="fd-add" onClick={() => openDish(dish)}>ADD</PlainButton>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>

          {/* ── the bill ────────────────────────────────────────────────── */}
          <Aside className="fd-two__side" aria-label="Bill">
            <Box className="fd-panel fd-panel--lift fd-sticky">
              <Box className="fd-seg fd-seg--full" role="group" aria-label="Delivery or pickup">
                <PlainButton
                  type="button"
                  className={`fd-seg__btn${fulfilment === 'delivery' ? ' is-on' : ''}`}
                  onClick={() => setFulfilment('delivery')}
                >
                  Delivery · {kitchen.deliveryWindow}
                </PlainButton>
                <PlainButton
                  type="button"
                  className={`fd-seg__btn${fulfilment === 'pickup' ? ' is-on' : ''}`}
                  onClick={() => setFulfilment('pickup')}
                >
                  Pickup · {kitchen.prepMinutes} min
                </PlainButton>
              </Box>

              {fulfilment === 'delivery' ? (
                <Box className="fd-addr">
                  <Icon name="pin" className="fd-ico" />
                  <Box className="fd-addr__text">
                    <Inline className="fd-addr__title">{address?.title}</Inline>
                    <Inline className="fd-addr__detail">{address?.detail}</Inline>
                  </Box>
                  <Link to="/food/checkout" className="fd-link">Change</Link>
                </Box>
              ) : (
                <Box className="fd-addr">
                  <Icon name="store" className="fd-ico" />
                  <Box className="fd-addr__text">
                    <Inline className="fd-addr__title">Collect at {kitchen.name}</Inline>
                    <Inline className="fd-addr__detail">{kitchen.landmark} · show your four-digit code</Inline>
                  </Box>
                </Box>
              )}

              <Heading level={2} className="fd-panel__title">Bill details</Heading>
              <BillLines
                bill={bill}
                fulfilment={fulfilment}
                couponCode={coupon?.code}
                distanceLabel={fulfilment === 'delivery' ? '1.4 km' : null}
              />

              {/* A cart under the kitchen's minimum is told so and left alone:
                  see ENFORCE_MINIMUM in food/cart.js. The route to payment is
                  never taken away — it was, as a disabled button, and a
                  disabled primary reads as a broken page. */}
              {bill.shortOfMinimum > 0 && (
                <Text className="fd-note fd-note--warn" role="status">
                  {kitchen.name} usually takes orders from {rupees(kitchen.minOrder)} — this one is
                  {' '}{rupees(bill.shortOfMinimum)} under{ENFORCE_MINIMUM ? ', so payment opens once you add that much.' : '.'}
                </Text>
              )}

              <Link
                to="/food/checkout"
                className={`fd-btn fd-btn--dark fd-btn--full fd-btn--lg${ENFORCE_MINIMUM && bill.shortOfMinimum > 0 ? ' is-off' : ''}`}
                aria-disabled={ENFORCE_MINIMUM && bill.shortOfMinimum > 0 ? 'true' : undefined}
              >
                Choose payment
                <Icon name="arrowR" className="fd-ico" />
              </Link>

              {bill.shortOfMinimum > 0 && (
                <Link to={`/food/kitchen/${kitchen.id}`} className="fd-btn fd-btn--outline fd-btn--full">
                  Add {rupees(bill.shortOfMinimum)} more from the menu
                </Link>
              )}
            </Box>

            <Box className="fd-panel fd-panel--row">
              <Icon name="verified" className="fd-ico" />
              <Text className="fd-note">
                Pay online and the kitchen only sees the order once the payment is confirmed. Cash on delivery is
                confirmed straight away.
              </Text>
            </Box>
          </Aside>
        </Box>
      </Box>

      {dialogs}
    </Region>
  );
}
