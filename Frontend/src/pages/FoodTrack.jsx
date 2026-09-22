import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Aside, Box, Heading, Inline, PlainButton, Region, Text,
} from '../components/common/atoms';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { DietMark } from '../components/food/atoms/DietMark';
import { PhotoTile } from '../components/food/atoms/PhotoTile';
import { TrackRail } from '../components/food/molecules/TrackRail';
import { ActiveOrder } from '../components/food/organisms/ActiveOrder';
import { useFoodCatalogue } from '../food/FoodCatalogue';
import { useAuth } from '../auth/AuthProvider';
import { confirmDelivered, fetchOrder } from '../api/foodApi';
import { payForOrder } from '../food/payOnline';
import { useReveals } from '../hooks/useSite';
import { rupees } from '../data/food';

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
  const [params] = useSearchParams();
  const { kitchenById } = useFoodCatalogue();
  const { isSignedIn, openSignIn } = useAuth();

  /*
   * The code from the "your order is placed" WhatsApp.
   *
   * It opens THIS order and nothing else, read only, for a day. The page is
   * otherwise behind a sign-in, and that is the wall this is for: the link is
   * tapped inside WhatsApp, which opens a browser holding no session, so a
   * diner who has just paid was being asked for a password to watch their food
   * move. Signing in still works and shows everything; this shows one order.
   */
  const token = params.get('token') || '';

  /*
   * Every order opened here is a real one, read from the server.
   *
   * The orders LIST only carries the summary; the tracks, the rider and the
   * live position come from the single-order read, so it is fetched here. There
   * used to be a second kind - an order built in this tab by a `placeOrder` that
   * sent nothing - and the branches that told the two apart are gone with it: a
   * reference either exists on the server or the page says it does not.
   */
  const [remote, setRemote] = useState(null);
  /* loading | ok | missing | error. `remote` is kept across a failed refresh:
     a tracking page that blanked itself on one dropped request would be worse
     than a slightly stale one. */
  const [remoteState, setRemoteState] = useState('loading');

  /* The "Delivered" button: idle, then asking ("are you sure?"), then sending. A
     second step, not a confirm() box, because this one word pays a restaurant and
     closes the order - a stray tap while the food is still in a bag on the stairs
     must not do it. */
  const [deliveredStep, setDeliveredStep] = useState('idle');
  const [deliveredError, setDeliveredError] = useState('');

  /* Paying for an order that was placed online and not paid for — they closed
     Razorpay, or the window never opened. The order is REAL and the kitchen has
     not been told, so this is the one thing on this page worth doing. */
  const [payStage, setPayStage] = useState('');
  const [payError, setPayError] = useState('');

  useEffect(() => {
    /* A code is its own permission — the server checks it. Without one this
       needs the session it always needed. */
    if (!isSignedIn && !token) { setRemote(null); setRemoteState('missing'); return undefined; }

    let live = true;
    let timer = null;

    const load = async () => {
      try {
        const next = await fetchOrder(reference, { token });
        if (!live) return;
        setRemote(next);
        setRemoteState('ok');
        /* Refreshed while the order is still moving — that is what "live"
           on this page promises. Fifteen seconds is a rider's position at
           its own cadence, without hammering the server for a page somebody
           has left open on a second monitor. */
        if (next.live) timer = setTimeout(load, 15000);
      } catch (error) {
        if (!live) return;
        if (error.status === 404 || error.status === 401) {
          setRemote(null);
          setRemoteState('missing');
          return;
        }
        setRemoteState(current => (current === 'ok' ? 'ok' : 'error'));
        timer = setTimeout(load, 30000);
      }
    };

    /* A new reference starts from nothing: keeping the previous order in state
       would draw it under the new URL until the fetch answered. */
    setRemote(null);
    setRemoteState('loading');
    load();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [reference, isSignedIn, token]);

  const payNow = async () => {
    setPayError('');
    try {
      const outcome = await payForOrder(reference, setPayStage);
      setPayStage('');
      if (outcome.paid) {
        /* Read back rather than assumed: the kitchen's own track moves on the
           same read, and it is the server that decides an order is paid. */
        setRemote(await fetchOrder(reference, { token }));
        return;
      }
      if (outcome.dismissed) return;
      setPayError('We are still checking that payment. Give it a moment and refresh.');
    } catch (error) {
      setPayStage('');
      setPayError(error?.message || 'The payment window would not open. Please try again.');
    }
  };

  const order = remote;
  useReveals([reference, order?.status]);

  if (!order) {
    const loading = remoteState === 'loading' && (isSignedIn || Boolean(token));
    return (
      <Region id="food">
        <Box className="sec-inner">
          <Box className="fd-empty fd-empty--page">
            {loading ? (
              <Heading level={1} className="fd-empty__title">Finding your order…</Heading>
            ) : !isSignedIn ? (
              <>
                <Heading level={1} className="fd-empty__title">Sign in to track this order</Heading>
                <Text className="fd-empty__body">Orders are private to the person who placed them.</Text>
                <PlainButton type="button" className="fd-btn fd-btn--dark" onClick={openSignIn}>Sign in</PlainButton>
              </>
            ) : remoteState === 'error' ? (
              <>
                <Heading level={1} className="fd-empty__title">We could not load this order</Heading>
                <Text className="fd-empty__body">Something went wrong reaching Lampose. Try again in a moment.</Text>
                <Link to="/food/orders" className="fd-btn fd-btn--dark">See my orders</Link>
              </>
            ) : (
              <>
                <Heading level={1} className="fd-empty__title">No order with that reference</Heading>
                <Text className="fd-empty__body">
                  {reference} is not one of your orders. Every order carries its reference at
                  the top of its own page.
                </Text>
                <Link to="/food/orders" className="fd-btn fd-btn--dark">See my orders</Link>
              </>
            )}
          </Box>
        </Box>
      </Region>
    );
  }

  const kitchen = kitchenById(order.kitchenId);
  const live = order.live && !['cancelled', 'rejected', 'delivered', 'pickedUp'].includes(order.status);
  const rider = order.rider;
  const searching = order.dispatch?.state === 'searching';
  /* The restaurant arranged who brings it (its own person, or a driver the
     delivery desk sent) rather than the app finding a rider. Those have no
     name or plate, only "a driver has been assigned" — and the server sends the
     card only once that is true. `arrangingDriver` is the gap before it: a
     driver has been asked for and the request has not gone through yet. */
  const arranged = Boolean(rider && rider.kind);
  const arrangingDriver = order.delivery?.by === 'driver' && !order.delivery?.assigned;

  /* "Yes, I have my order" - the second step of the Delivered button. The server
     accepts it only once the order is on its way and only from the diner it belongs
     to; pressed twice, it is the same answer. The page then READS the order again,
     so what it shows is what the server now says rather than a guess that the press
     worked. */
  const sayDelivered = async () => {
    setDeliveredStep('sending');
    setDeliveredError('');
    try {
      await confirmDelivered(reference);
      const next = await fetchOrder(reference);
      setRemote(next);
      setRemoteState('ok');
      setDeliveredStep('idle');
    } catch (error) {
      setDeliveredStep('idle');
      setDeliveredError(error.message || 'We could not save that. Please try again.');
    }
  };

  /* What the big line says. The rider's name when there is one, the kitchen's
     own step when there is not — never "your order is being processed". */
  const headline = (() => {
    if (order.status === 'cancelled') return 'This order was cancelled';
    if (order.status === 'rejected') return `${order.kitchenName} could not take this order`;
    if (order.status === 'delivered') return 'Delivered';
    if (order.status === 'pickedUp') return 'Collected at the counter';
    if (arranged) return order.status === 'onTheWay' ? 'Your order is on its way' : 'A driver has been assigned';
    if (rider) return `${rider.name.split(' ')[0]} is bringing your order`;
    if (arrangingDriver) return 'Arranging a driver';
    if (searching) return 'Looking for a rider nearby';
    return `${order.kitchenName} has your order`;
  })();

  const subline = (() => {
    if (order.status === 'cancelled') return order.cancelNote;
    /* Only when the kitchen actually gave one - otherwise this printed
       "Reason given: “”". */
    if (order.status === 'rejected') return order.rejectionReason ? `Reason given: “${order.rejectionReason}”` : '';
    if (arranged) {
      /* Nothing to say about a distance: neither the restaurant's own person
         nor the desk's driver reports a position to us. */
      const who = rider.kind === 'restaurant' ? 'The restaurant\'s own delivery person' : 'A Lampose delivery partner';
      /* No code to have ready: nobody is asked for one. It ends when YOU say it
         has arrived - the "Delivered" button below. */
      return order.status === 'onTheWay'
        ? `The delivery boy has picked up your order from ${order.kitchenName} and is on the way to you.`
        : `${who} will bring your order from ${order.kitchenName}.`;
    }
    if (rider) {
      /* Distance only when the rider's position is known and fresh — the
         server sends nothing for a finished order or a stale fix, and a
         missing figure must not print as "undefined to go". */
      const from = order.pickedUpLabel
        ? `Picked up at ${order.pickedUpLabel} from ${order.kitchenName}`
        : `${rider.name.split(' ')[0]} is on the way from ${order.kitchenName}`;
      return order.distanceLabel ? `${from} · ${order.distanceLabel} to go` : from;
    }
    if (order.fulfilment === 'pickup') return `Ready for collection at ${kitchen?.landmark}`;
    if (arrangingDriver) return 'The kitchen is cooking; we are arranging a driver to bring it.';
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

          {/*
            The kitchen's own estimate, which until now only a pickup order was
            shown. `promisedMinutes` is typed by the restaurant when it accepts
            — the one time in this flow a person makes a promise — and a
            delivery diner was reading "Arriving by —" while it sat on the
            order. A delivery adds the ride to it, from the same flat figure
            the feed quotes, so the two screens cannot disagree.

            Still a dash before the kitchen accepts: nobody has estimated
            anything yet, and a time invented here is worse than no time.
          */}
          <Box className="fd-hero__eta">
            <Text className="fd-hero__etaLbl">
              {order.fulfilment === 'pickup' ? 'Ready by' : 'Arriving by'}
            </Text>
            <Text className="fd-hero__etaVal">{order.etaLabel || '—'}</Text>
            <Text className="fd-hero__etaRef">
              {order.fulfilment !== 'pickup' && order.readyByLabel
                ? `Kitchen says ready by ${order.readyByLabel} · order ${order.reference}`
                : `Order ${order.reference} · placed ${order.placedLabel}`}
            </Text>
          </Box>
        </Box>

        <Box className="fd-two">
          <Box className="fd-two__main">

            {/* ── an online order nobody has paid for ────────────────────────
                `paymentStatus: 'paid'` has one cause — a verified signature —
                so until then this order is invisible to the kitchen and no
                rider is looked for. It is not an error state and not a lost
                order: the row exists, and this is the button that finishes it.

                Signed in only. The link from the "order placed" message opens
                this page for anyone holding it, and paying needs the diner's
                own session anyway. */}
            {order.paymentMode === 'online' && order.paymentStatus !== 'paid'
              && order.live && isSignedIn && (
              <Box className="fd-panel fd-panel--lift reveal">
                <Heading level={2} className="fd-panel__title">This order is not paid for yet</Heading>
                <Text className="fd-note">
                  {order.kitchenName} has not been sent it. Pay now and the kitchen gets it straight away — nothing
                  was charged when the window closed.
                </Text>
                <Box className="fd-actions">
                  <PlainButton
                    type="button"
                    className="fd-btn fd-btn--dark"
                    disabled={Boolean(payStage)}
                    onClick={payNow}
                  >
                    {payStage === 'verifying' ? 'Checking the payment…'
                      : payStage === 'opening' ? 'Opening Razorpay…'
                        : `Pay ${rupees(order.grandTotal)}`}
                  </PlainButton>
                </Box>
                {payError && <Text className="fd-note fd-note--warn" role="alert">{payError}</Text>}
              </Box>
            )}

            {/* ── "Delivered" - the diner's word, once the delivery boy has it ──
                Only on an order the RESTAURANT arranged (`delivery.by`), and only
                while it is on the way. The restaurant says the delivery boy has
                taken it; the person who can see whether the food arrived says so
                here, and that is what completes the order. */}
            {order.delivery?.by && order.status === 'onTheWay' && isSignedIn && (
              <Box className="fd-panel fd-panel--lift reveal">
                <Heading level={2} className="fd-panel__title">Has your order reached you?</Heading>
                <Text className="fd-note">
                  The delivery boy has picked it up. Press Delivered once you have your food — that tells
                  {' '}{order.kitchenName} it arrived.
                </Text>
                {deliveredStep === 'asking' ? (
                  <Box className="fd-actions">
                    <PlainButton type="button" className="fd-btn fd-btn--dark" onClick={sayDelivered}>
                      Yes, I have my order
                    </PlainButton>
                    <PlainButton type="button" className="fd-btn fd-btn--outline" onClick={() => setDeliveredStep('idle')}>
                      Not yet
                    </PlainButton>
                  </Box>
                ) : (
                  <Box className="fd-actions">
                    <PlainButton
                      type="button"
                      className="fd-btn fd-btn--dark"
                      disabled={deliveredStep === 'sending'}
                      onClick={() => { setDeliveredError(''); setDeliveredStep('asking'); }}
                    >
                      {deliveredStep === 'sending' ? 'Saving…' : 'Delivered'}
                    </PlainButton>
                  </Box>
                )}
                {deliveredError && <Text className="fd-note">{deliveredError}</Text>}
              </Box>
            )}

            {/* ── the rider ─────────────────────────────────────────────── */}
            {/* Not for an order the restaurant arranged: it has no rider to name and
                no code to read out - the delivery boy is the restaurant's, or the
                delivery desk's, and the diner confirms the delivery themselves. A
                REAL rider (the app's own search) keeps this card, with the code. */}
            {rider && !arranged && (
              <Box className="fd-panel fd-panel--lift reveal">
                <Box className="fd-rider">
                  <Inline className="fd-rider__avatar">{rider.initial}</Inline>
                  <Box className="fd-rider__text">
                    <Inline className="fd-rider__name">{rider.name}</Inline>
                    <Inline className="fd-rider__meta">
                      {[rider.detail, rider.vehicle, rider.rating ? `${rider.rating} ★ rider rating` : ''].filter(Boolean).join(' · ')}
                    </Inline>
                  </Box>

                  {order.deliveryOtp ? (
                    <Box className="fd-code">
                      <Inline className="fd-lbl">Say at the door</Inline>
                      <Inline className="fd-code__digits">{order.deliveryOtp}</Inline>
                    </Box>
                  ) : order.viaLink ? (
                    /* Opened from the WhatsApp rather than signed in. The code
                       is withheld on purpose — a message can be forwarded, and
                       whoever reads these digits first can take the food from
                       the rider — so it is one sign-in away. Saying that is
                       better than a gap that looks like a fault. */
                    <PlainButton type="button" className="fd-code fd-code--locked" onClick={openSignIn}>
                      <Inline className="fd-lbl">Say at the door</Inline>
                      <Inline className="fd-code__digits">Sign in</Inline>
                    </PlainButton>
                  ) : null}

                  {/* There is deliberately NO call button here. It used to be a
                      `tel:` link to a hard-coded number that belonged to nobody
                      in this order — on a real delivery it would have rung a
                      stranger. A rider's own number is not sent to a diner's
                      browser (the server keeps it), and the app calls through
                      the server; the website has no equivalent yet. */}
                </Box>

                {/* Each cell only when it has a value. Distance and last-update come
                    from the rider's live position, which the server withholds
                    for a stale fix — so any of them can be absent, and an empty
                    cell under a label reads as a broken page. */}
                <Box className="fd-facts">
                  {order.distanceLabel && (
                    <Box className="fd-facts__cell">
                      <Inline className="fd-lbl">Left to travel</Inline>
                      <Inline className="fd-facts__val">{order.distanceLabel}</Inline>
                    </Box>
                  )}
                  {order.lastFixLabel && (
                    <Box className="fd-facts__cell">
                      <Inline className="fd-lbl">Last update</Inline>
                      <Inline className="fd-facts__val">{order.lastFixLabel}</Inline>
                    </Box>
                  )}
                  {order.pickedUpLabel && (
                    <Box className="fd-facts__cell">
                      <Inline className="fd-lbl">Picked up</Inline>
                      <Inline className="fd-facts__val">{order.pickedUpLabel}</Inline>
                    </Box>
                  )}
                  {order.readyByLabel && (
                    <Box className="fd-facts__cell">
                      <Inline className="fd-lbl">
                        {order.promisedMinutes
                          ? `Kitchen quoted ${order.promisedMinutes} min`
                          : 'Food ready by'}
                      </Inline>
                      <Inline className="fd-facts__val">{order.readyByLabel}</Inline>
                    </Box>
                  )}
                  {order.etaLabel && (
                    <Box className="fd-facts__cell">
                      <Inline className="fd-lbl">
                        {order.fulfilment === 'pickup' ? 'Ready by' : 'Arriving by'}
                      </Inline>
                      <Inline className="fd-facts__val fd-facts__val--good">{order.etaLabel}</Inline>
                    </Box>
                  )}
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
                      {order.dispatch.candidateCount} riders near {kitchen?.name} have been asked at once — the first to accept takes it.
                    </Inline>
                  </Box>

                  {/* The code belongs to the ORDER, not to the rider: it exists
                      from the moment the order does, and a diner who reads it
                      now is a diner who is not hunting for it at the door. */}
                  {order.deliveryOtp ? (
                    <Box className="fd-code">
                      <Inline className="fd-lbl">Say at the door</Inline>
                      <Inline className="fd-code__digits">{order.deliveryOtp}</Inline>
                    </Box>
                  ) : order.viaLink ? (
                    /* Opened from the WhatsApp rather than signed in. The code
                       is withheld on purpose — a message can be forwarded, and
                       whoever reads these digits first can take the food from
                       the rider — so it is one sign-in away. Saying that is
                       better than a gap that looks like a fault. */
                    <PlainButton type="button" className="fd-code fd-code--locked" onClick={openSignIn}>
                      <Inline className="fd-lbl">Say at the door</Inline>
                      <Inline className="fd-code__digits">Sign in</Inline>
                    </PlainButton>
                  ) : null}
                </Box>
                <Text className="fd-note">
                  This runs beside the cooking, not after it — nobody is waiting on the other. If nobody nearby
                  accepts, it is tried again when the food is ready.
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
                  {/* `.length`, not truthiness: a refused, cancelled or pickup order has an
                      EMPTY rider track, and [] is truthy - so it drew a "Rider" heading
                      over nothing. */}
                  {order.riderTrack?.length > 0 && <TrackRail title="Rider" steps={order.riderTrack} />}
                </Box>
              </Box>
            )}
          </Box>

          {/* ── the order itself ────────────────────────────────────────── */}
          <Aside className="fd-two__side" aria-label="Order details">
            <Box className="fd-panel">
              <Box className="fd-cart__head fd-cart__head--tight">
                <PhotoTile tone={kitchen?.tone || 'stone'} src={kitchen?.logoUrl || kitchen?.coverUrl} alt={order.kitchenName} width={160} className="fd-cart__thumb" />
                <Box className="fd-cart__headText">
                  <Inline className="fd-cart__name">{order.kitchenName}</Inline>
                  <Inline className="fd-cart__meta">{kitchen?.landmark}</Inline>
                </Box>
                {/* No "Call the kitchen" button either: it was a hard-coded
                    landline that is not any kitchen's. A restaurant's own
                    number is not exposed on the public routes, so there is
                    nothing real to dial from here. */}
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
              {/* Only on an order that was charged one, before GST and the
                  platform fee replaced it. */}
              {order.packagingCharge > 0 && (
                <Box className="fd-bill__row"><Inline>Packing</Inline><Inline className="fd-bill__val">{rupees(order.packagingCharge)}</Inline></Box>
              )}
              {order.gst > 0 && (
                <Box className="fd-bill__row">
                  <Inline>GST{order.gstRate ? ` (${order.gstRate}%)` : ''}</Inline>
                  <Inline className="fd-bill__val">{rupees(order.gst)}</Inline>
                </Box>
              )}
              {order.platformFee > 0 && (
                <Box className="fd-bill__row"><Inline>Platform fee</Inline><Inline className="fd-bill__val">{rupees(order.platformFee)}</Inline></Box>
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
                {/* "Due on delivery" only while there is a delivery still to come.
                    A delivered order the database still holds as unpaid cash
                    is a TOTAL, not a debt the page should announce. */}
                <Inline>{order.paid ? 'Paid' : (order.dueOnDelivery && live) ? 'Due on delivery' : 'Total'}</Inline>
                <Inline className="fd-bill__big">
                  {rupees(order.grandTotal ?? (order.paid || order.dueOnDelivery || 0))}
                </Inline>
              </Box>

              <Inline className={`fd-chip ${order.paymentStatus === 'paid' ? 'fd-chip--good' : 'fd-chip--neutral'} fd-chip--start`}>
                {order.paymentLabel}
              </Inline>

              {/* "Download receipt" stood here and downloaded nothing — it was
                  a link to `#top`, so it scrolled the page and produced no
                  file. This block IS the receipt: every line the order was
                  charged, what was paid and how. A control that promises a
                  document nobody generates is worse than no control. */}
            </Box>

            <Box className="fd-panel">
              <Heading level={2} className="fd-panel__title">Something wrong?</Heading>
              <Text className="fd-note">
                {order.status === 'placed'
                  ? 'Cancelling is free until the kitchen accepts, which is usually a minute or two.'
                  : 'Cancelling is free until the kitchen accepts. This one has been accepted, so cancelling now needs our help.'}
              </Text>

              {/* There is no cancel button on the website yet: cancelling is a
                  write with a refund behind it, and it lives in the app. The note
                  says where to go instead of leaving a button that does nothing. */}
              {order.status === 'placed' && order.live && (
                <Text className="fd-note">
                  Cancelling from the website is not switched on yet. Use the Lampose app, or contact support
                  below and we will do it for you.
                </Text>
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
