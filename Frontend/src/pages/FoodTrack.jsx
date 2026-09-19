import { Link, useParams } from 'react-router-dom';
import {
  Anchor, Aside, Box, Heading, Inline, PlainButton, Region, Text,
} from '../components/common/atoms';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { DietMark } from '../components/food/atoms/DietMark';
import { PhotoTile } from '../components/food/atoms/PhotoTile';
import { TrackRail } from '../components/food/molecules/TrackRail';
import { ActiveOrder } from '../components/food/organisms/ActiveOrder';
import { useCart } from '../food/CartProvider';
import { useReveals } from '../hooks/useSite';
import { kitchenById, rupees } from '../data/food';

/* ══ Tracking ═════════════════════════════════════════════════════════════
   One order, while it is happening.

   ## Two tracks, side by side

   The kitchen's (placed → accepted → cooking → ready) and the rider's
   (searching → accepted → picked up → handed over). They are not one list:
   an order is cooked and looked for at the SAME time, and a single timeline
   would have to invent an order between two things that overlap. They meet
   at "picked up", which only the rider can set.

   ## No map

   The rider's position is given as distance, direction of travel and the age
   of the last fix, in words. A map was drawn for this page and taken out: a
   moving dot answers "where exactly" — a question the diner cannot act on —
   while "1.4 km away, updated 12 seconds ago" answers "should I go down", 
   which is the one they actually have.

   ## The code is compared, not checked

   The four digits are not a credential and nothing is unlocked by them. They
   are a value the diner and the rider say out loud to each other, which is
   what a hand-over is, so they have to be on screen to work at all.
   ════════════════════════════════════════════════════════════════════════ */

export function FoodTrack() {
  const { reference } = useParams();
  const { orders, cancel } = useCart();

  const order = orders.find(o => o.reference === reference);
  useReveals([reference, order?.status]);

  if (!order) {
    return (
      <Region id="food">
        <Box className="sec-inner">
          <Box className="fd-empty fd-empty--page">
            <Heading level={1} className="fd-empty__title">No order with that reference</Heading>
            <Text className="fd-empty__body">
              {reference} is not one of your orders. References look like LMP-4821 and are on every receipt.
            </Text>
            <Link to="/food/orders" className="fd-btn fd-btn--dark">See my orders</Link>
          </Box>
        </Box>
      </Region>
    );
  }

  const kitchen = kitchenById(order.kitchenId);
  const live = order.live && !['cancelled', 'rejected', 'delivered', 'pickedUp'].includes(order.status);
  const rider = order.rider;
  const searching = order.dispatch?.state === 'searching';

  /* What the big line says. The rider's name when there is one, the kitchen's
     own step when there is not — never "your order is being processed". */
  const headline = (() => {
    if (order.status === 'cancelled') return 'This order was cancelled';
    if (order.status === 'rejected') return `${order.kitchenName} could not take this order`;
    if (order.status === 'delivered') return 'Delivered';
    if (order.status === 'pickedUp') return 'Collected at the counter';
    if (rider) return `${rider.name.split(' ')[0]} is bringing your order`;
    if (searching) return 'Looking for a rider nearby';
    return `${order.kitchenName} has your order`;
  })();

  const subline = (() => {
    if (order.status === 'cancelled') return order.cancelNote;
    if (order.status === 'rejected') return `Reason given: “${order.rejectionReason}”`;
    if (rider) return `Picked up at ${order.pickedUpLabel} from ${order.kitchenName} · ${order.distanceLabel} to go`;
    if (order.fulfilment === 'pickup') return `Ready for collection at ${kitchen?.landmark}`;
    return 'The kitchen is cooking; a rider is being looked for at the same time.';
  })();

  return (
    <Region id="food">
      <Box className="sec-inner">

        <ActiveOrder exclude={reference} />

        {/* ── the headline ──────────────────────────────────────────────── */}
        <Box className={`fd-hero${live ? '' : ' is-closed'}`}>
          <Box className="fd-hero__text">
            {live && (
              <Inline className="fd-hero__live">
                <Inline className="fd-hero__dot" aria-hidden="true" />
                Live
              </Inline>
            )}
            <Heading level={1} className="fd-hero__title">{headline}</Heading>
            <Text className="fd-hero__sub">{subline}</Text>
          </Box>

          <Box className="fd-hero__eta">
            <Text className="fd-hero__etaLbl">
              {order.fulfilment === 'pickup' ? 'Ready by' : 'Arriving by'}
            </Text>
            <Text className="fd-hero__etaVal">{order.etaLabel || '—'}</Text>
            <Text className="fd-hero__etaRef">Order {order.reference} · placed {order.placedLabel}</Text>
          </Box>
        </Box>

        <Box className="fd-two">
          <Box className="fd-two__main">

            {/* ── the rider ─────────────────────────────────────────────── */}
            {rider && (
              <Box className="fd-panel fd-panel--lift reveal">
                <Box className="fd-rider">
                  <Inline className="fd-rider__avatar">{rider.initial}</Inline>
                  <Box className="fd-rider__text">
                    <Inline className="fd-rider__name">{rider.name}</Inline>
                    <Inline className="fd-rider__meta">{rider.vehicle} · {rider.rating} ★ rider rating</Inline>
                  </Box>

                  {order.deliveryOtp && (
                    <Box className="fd-code">
                      <Inline className="fd-lbl">Say at the door</Inline>
                      <Inline className="fd-code__digits">{order.deliveryOtp}</Inline>
                    </Box>
                  )}

                  <Anchor href="tel:+919849012345" className="fd-btn fd-btn--ghost">
                    <Icon name="phone" className="fd-ico" />
                    Call {rider.name.split(' ')[0]}
                  </Anchor>
                </Box>

                <Box className="fd-facts">
                  <Box className="fd-facts__cell">
                    <Inline className="fd-lbl">Left to travel</Inline>
                    <Inline className="fd-facts__val">{order.distanceLabel}</Inline>
                  </Box>
                  <Box className="fd-facts__cell">
                    <Inline className="fd-lbl">Last update</Inline>
                    <Inline className="fd-facts__val">{order.lastFixLabel}</Inline>
                  </Box>
                  <Box className="fd-facts__cell">
                    <Inline className="fd-lbl">Picked up</Inline>
                    <Inline className="fd-facts__val">{order.pickedUpLabel}</Inline>
                  </Box>
                  <Box className="fd-facts__cell">
                    <Inline className="fd-lbl">Arriving by</Inline>
                    <Inline className="fd-facts__val fd-facts__val--good">{order.etaLabel}</Inline>
                  </Box>
                </Box>
              </Box>
            )}

            {!rider && searching && (
              <Box className="fd-panel fd-panel--lift reveal">
                <Box className="fd-rider">
                  <Inline className="fd-rider__avatar fd-rider__avatar--wait">
                    <Icon name="delivery" className="fd-ico" />
                  </Inline>
                  <Box className="fd-rider__text">
                    <Inline className="fd-rider__name">Looking for a rider</Inline>
                    <Inline className="fd-rider__meta">
                      {order.dispatch.candidateCount} riders near {kitchen?.name} are being asked, one at a time.
                    </Inline>
                  </Box>

                  {/* The code belongs to the ORDER, not to the rider: it exists
                      from the moment the order does, and a diner who reads it
                      now is a diner who is not hunting for it at the door. */}
                  {order.deliveryOtp && (
                    <Box className="fd-code">
                      <Inline className="fd-lbl">Say at the door</Inline>
                      <Inline className="fd-code__digits">{order.deliveryOtp}</Inline>
                    </Box>
                  )}
                </Box>
                <Text className="fd-note">
                  This runs beside the cooking, not after it — nobody is waiting on the other. If everybody nearby
                  says no, the search starts again when the food is ready.
                </Text>
              </Box>
            )}

            {order.fulfilment === 'pickup' && order.pickupCode && (
              <Box className="fd-panel fd-panel--lift reveal">
                <Box className="fd-rider">
                  <Box className="fd-rider__text">
                    <Inline className="fd-rider__name">Collect at {kitchen?.name}</Inline>
                    <Inline className="fd-rider__meta">{kitchen?.landmark}</Inline>
                  </Box>
                  <Box className="fd-code">
                    <Inline className="fd-lbl">Say at the counter</Inline>
                    <Inline className="fd-code__digits">{order.pickupCode}</Inline>
                  </Box>
                </Box>
              </Box>
            )}

            {/* ── the two tracks ────────────────────────────────────────── */}
            {order.kitchenTrack && (
              <Box className="fd-panel reveal">
                <Box className="fd-panel__head">
                  <Heading level={2} className="fd-panel__title">What has happened so far</Heading>
                  <Inline className="fd-section__sub">The kitchen and the rider run at the same time</Inline>
                </Box>
                <Box className="fd-tracks">
                  <TrackRail title="Kitchen" steps={order.kitchenTrack} />
                  {order.riderTrack && <TrackRail title="Rider" steps={order.riderTrack} />}
                </Box>
              </Box>
            )}
          </Box>

          {/* ── the order itself ────────────────────────────────────────── */}
          <Aside className="fd-two__side" aria-label="Order details">
            <Box className="fd-panel">
              <Box className="fd-cart__head fd-cart__head--tight">
                <PhotoTile tone={kitchen?.tone || 'stone'} className="fd-cart__thumb" />
                <Box className="fd-cart__headText">
                  <Inline className="fd-cart__name">{order.kitchenName}</Inline>
                  <Inline className="fd-cart__meta">{kitchen?.landmark}</Inline>
                </Box>
                <Anchor href="tel:+914023000000" className="fd-iconBtn" aria-label="Call the kitchen">
                  <Icon name="phone" className="fd-ico" />
                </Anchor>
              </Box>

              <Box className="fd-rule" />

              {order.lines.map(line => (
                <Box className="fd-sum" key={line.name}>
                  <DietMark diet={line.diet} size={14} />
                  <Box className="fd-sum__text">
                    <Inline className="fd-sum__name">{line.name} ×{line.qty}</Inline>
                    {line.note && <Inline className="fd-sum__note">{line.note}</Inline>}
                  </Box>
                  <Inline className="fd-sum__price">{rupees(line.price * line.qty)}</Inline>
                </Box>
              ))}

              <Box className="fd-rule" />

              <Box className="fd-bill__row"><Inline>Item total</Inline><Inline className="fd-bill__val">{rupees(order.itemTotal)}</Inline></Box>
              {order.packagingCharge > 0 && (
                <Box className="fd-bill__row"><Inline>Packing</Inline><Inline className="fd-bill__val">{rupees(order.packagingCharge)}</Inline></Box>
              )}
              {order.fulfilment === 'delivery' && (
                <Box className="fd-bill__row">
                  <Inline>Delivery</Inline>
                  <Inline className="fd-bill__val">{order.deliveryFee ? rupees(order.deliveryFee) : 'Free'}</Inline>
                </Box>
              )}
              {order.discount > 0 && (
                <Box className="fd-bill__row fd-bill__row--save">
                  <Inline>{order.couponCode}</Inline>
                  <Inline className="fd-bill__val">− {rupees(order.discount)}</Inline>
                </Box>
              )}

              <Box className="fd-rule" />

              <Box className="fd-bill__total">
                <Inline>{order.paid ? 'Paid' : 'Due on delivery'}</Inline>
                <Inline className="fd-bill__big">{rupees(order.paid || order.dueOnDelivery || 0)}</Inline>
              </Box>

              <Inline className={`fd-chip ${order.paymentStatus === 'paid' ? 'fd-chip--good' : 'fd-chip--neutral'} fd-chip--start`}>
                {order.paymentLabel}
              </Inline>

              <Link to="#top" className="fd-link">Download receipt</Link>
            </Box>

            <Box className="fd-panel">
              <Heading level={2} className="fd-panel__title">Something wrong?</Heading>
              <Text className="fd-note">
                {order.status === 'placed'
                  ? 'Cancelling is free until the kitchen accepts, which is usually a minute or two.'
                  : 'Cancelling is free until the kitchen accepts. This one has been accepted, so cancelling now needs our help.'}
              </Text>

              {order.status === 'placed' && order.live && (
                <PlainButton
                  type="button"
                  className="fd-btn fd-btn--ghost fd-btn--full"
                  onClick={() => cancel(order.reference)}
                >
                  Cancel this order
                </PlainButton>
              )}

              <Link to="/contact" className="fd-btn fd-btn--outline fd-btn--full">Chat with support</Link>
              <Link to="/contact" className="fd-btn fd-btn--ghost fd-btn--full fd-btn--bad">
                Report a problem with this order
              </Link>
              <Text className="fd-note">
                Support reference {order.reference} · a reply reaches this page and your email.
              </Text>
            </Box>
          </Aside>
        </Box>
      </Box>
    </Region>
  );
}
