import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  BillBreakdown,
  DeliveryMap,
  DietMark,
  FoodEmptyState,
  FoodNotice,
  FoodStatusChip,
  FoodTimeline,
  ReceiptLine,
  timelineIndex,
  type BillLine,
} from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { TIMELINE_STEP, useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';

const CANCEL_REASONS = [
  'Ordered by mistake',
  'Taking too long',
  'Wrong room or address',
  'Eating in the mess instead',
  'Something else',
];

/**
 * The dispatcher's own reason, punctuated but not reworded.
 *
 * `dispatch.failureReason` is written as a clause — "3 rider(s) online, none
 * free and nearby" — because the server writes it for a log line as well as
 * for this screen. Capitalising it and closing it is presentation; changing a
 * word of it would put us back to paraphrasing, which is the whole thing that
 * went wrong here.
 */
function asSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const opened = trimmed[0].toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(opened) ? opened : `${opened}.`;
}

/**
 * One order — tracking, receipt and refund, in that order as it ages.
 *
 * It is one screen rather than three because a student does not think in those
 * categories: they think "my order", and what they want from it changes by the
 * minute. While it is live the pickup code and the hold time are the whole
 * screen; once it is done the bill is; once it is over without arriving —
 * cancelled by the diner, or refused by the kitchen — what happened and what
 * became of the money are, in that order.
 *
 * Cancel is offered only where the server will actually take it — while the
 * order sits at `placed` or `confirmed`, before the kitchen has started
 * cooking. Once that window closes the button itself is gone rather than
 * left on screen disabled; the caption underneath still says why and what to
 * do instead, so the answer to "where did it go" is on the same screen the
 * question is asked from.
 */
export default function OrderScreen() {
  const { findKitchen } = useFoodCatalogue();
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const { orders, cancelOrder, refreshOrder, startPayment, address } = useFood();

  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const order = orders.find((entry) => entry.id === id);

  /* ── Everything below runs whether or not the order is in the list ───────
     Hooks cannot sit behind the early return underneath them, and the
     early return is real: this screen is reachable by deep link from a push
     notification, before the list has been read back. So the derived values
     tolerate a missing order and the guard comes after them. */

  const live = !!order && ['placed', 'confirmed', 'preparing', 'ready', 'onTheWay'].includes(order.status);
  const awaitingPayment = order?.paymentLabel === 'Payment not completed';
  const dispatchState = order?.dispatch?.state ?? 'idle';
  const searching = order?.fulfilment === 'delivery' && dispatchState === 'searching';
  const noRiderYet = order?.fulfilment === 'delivery' && dispatchState === 'unassigned';
  /*
    WHY there is no rider, which is not one answer but two.

    `candidateCount` is how many riders the shortlist held when the search ran,
    and the backend sends it for exactly this reason — its own comment says the
    diner is shown different words for the two cases. This screen used to
    ignore it and print "every rider nearby is busy" either way, which is a
    sentence that is simply false when the count is zero: nobody was busy,
    nobody was there. It reads as a system that is working and slow, when the
    truth is a kitchen with no rider in range of it — and it sent at least one
    person hunting for a broken connection that was fine.
  */
  const nobodyInRange = (order?.dispatch?.candidateCount ?? 0) === 0;
  /*
    And WHETHER we are still looking at all, which is not this screen's to
    guess. `foodDispatch.service` writes a reason the moment a sweep ends with
    nobody — including the one that says the search is over and a person has
    been alerted — and it was carried onto the order object and read by nothing,
    so the diner kept being told "we keep looking" long after we had stopped.
  */
  const dispatchFailure = order?.dispatch?.failureReason?.trim() ?? '';
  const rider = order?.rider ?? null;

  /*
    Resume the payment on an order that was left held.

    The order exists and is priced; only the money is missing. Re-opening mints
    a fresh checkout link against the SAME Razorpay order, so a student who
    backed out of the UPI screen lands where they left rather than placing the
    whole thing again.
  */
  const resumePayment = useCallback(async () => {
    if (!id) return;
    setPaying(true);
    setNotice(null);
    try {
      const intent = await startPayment(id);
      if (intent.alreadyPaid) {
        await refreshOrder(id);
        return;
      }
      if (!intent.checkoutToken) {
        setNotice('Online payment is not available right now. Please contact the restaurant.');
        return;
      }
      router.push({
        pathname: '/pay/checkout',
        params: { foodToken: intent.checkoutToken, orderNumber: id },
      });
    } catch (err) {
      setNotice((err as Error)?.message || 'We could not open the payment.');
    } finally {
      setPaying(false);
    }
  }, [id, router, startPayment, refreshOrder]);

  /*
    Re-read the order on a timer while it is moving.

    This is how the diner learns a rider was found AND where that rider is.
    There is no socket on THIS screen on purpose: the realtime layer exists for
    the RIDER's fifteen-second offer, where a poll would be too slow to be
    usable, and a tracking screen is well served by a request that works on any
    network. (Support is the one exception in this app — `services/
    support.socket.ts` — because the other end of a support thread is a person
    typing, and a poll interval there is the gap in which somebody decides
    nobody is listening. A marker that moves eight seconds late says nothing
    about whether anyone is there.)

    The interval TIGHTENS to five seconds once a rider is carrying it, because
    that is the only phase where something on screen is actually moving. Before
    that the screen changes maybe four times in twenty minutes and eight seconds
    is already generous; a marker that steps every eight seconds reads as
    stuttering, and one that steps every five reads as slow-but-alive. Neither
    is smooth — the map says how old each fix is rather than pretending
    otherwise.

    An order that is NOT in the list yet is also polled — that is the deep-link
    case, and one read is what puts it there. Polling stops the moment the order
    stops moving; a delivered order polled all night is a battery complaint.
  */
  const shouldPoll = !!id && (!order || live || searching);
  const interval = rider ? 5000 : 8000;
  const refresh = useRef(refreshOrder);
  refresh.current = refreshOrder;

  useEffect(() => {
    if (!shouldPoll || !id) return;
    /* One immediately: a student arriving back from the checkout WebView needs
       to know whether the payment landed, and eight seconds of "not paid" is
       long enough to make them try to pay twice. */
    refresh.current(id);
    const timer = setInterval(() => refresh.current(id), interval);
    return () => clearInterval(timer);
  }, [shouldPoll, id, interval]);

  /*
    ── The arrival ──────────────────────────────────────────────────────────

    Shown ONCE, on the TRANSITION, and never on the status alone.

    `wasLive` records that this screen watched the order while it was still in
    flight. Only then does reaching `delivered` mean "it just arrived" — a
    diner opening a week-old order from their history was never watching it,
    so `wasLive` is false and they get the calm delivered summary below instead
    of a celebration for something they finished with days ago.

    `replace`, so Back from the arrival screen does not return to a tracking
    screen for an order that is over.
  */
  const wasLive = useRef(false);
  useEffect(() => {
    if (live || searching) wasLive.current = true;
  }, [live, searching]);

  const finished = order?.status === 'delivered' || order?.status === 'pickedUp';

  /*
    Was this finish FRESH, or is this an old order being looked at?

    Two ways of being fresh, because either alone misses a real case:

      · `wasLive` — this screen watched the order while it was still moving,
        so the transition happened in front of somebody. Covers the diner
        holding the tracking screen when the rider hands the bag over.
      · a `deliveredAt` under ten minutes old. Covers the diner who put their
        phone down during the last leg and opens the app again straight after
        — `wasLive` is false for them, and they have still just been handed
        their dinner.

    Anything older is history. A week-old order opened from the list gets the
    receipt it has always got, with no celebration — being congratulated again
    for a meal you have forgotten is how a finish screen becomes noise.
  */
  /* From the order's own timeline, not the clock: a receipt that says
     "9:47 pm" because that is when it rendered lies to anybody reopening it. */
  const deliveredAtLabel = order?.timeline?.find(
    (step) => step.label === 'Delivered' || step.label === 'Picked up',
  )?.at;

  const justArrived = useMemo(() => {
    if (!finished) return false;
    if (wasLive.current) return true;
    const at = order?.rider?.deliveredAt;
    if (!at) return false;
    const age = Date.now() - new Date(at).getTime();
    return Number.isFinite(age) && age >= 0 && age < 10 * 60 * 1000;
  }, [finished, order?.rider?.deliveredAt]);

  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Order" onBack={() => router.back()} />
        <FoodEmptyState
          title="We cannot find that order"
          body="It may belong to another account. Your orders are all under the Orders tab in Food."
          primaryLabel="Back to food"
          onPrimary={() => router.replace('/home')}
        />
      </View>
    );
  }

  const kitchen = findKitchen(order.kitchenId);

  /*
    Offered only where the SERVER will actually take it.

    This used to include `preparing`, and `cancelMyOrder` allows exactly
    `placed` and `accepted` — `placed` and `confirmed` in the app's own words.
    So the button was live on every order the kitchen had started, and the only
    thing waiting behind it was TOO_LATE_TO_CANCEL. A control that is
    guaranteed to fail is worse than no control: somebody taps it, reads a
    refusal, and stops believing the app knows its own rules.
  */
  const cancellable = ['placed', 'confirmed'].includes(order.status);

  /*
    ── A refusal is not a cancellation ───────────────────────────────────────

    The kitchen saying no and the diner changing their mind are the same status
    to this app, and completely different news to the person reading the
    screen. The context writes the refusal onto the order's own timeline, with
    the kitchen's `rejectionReason` as its note, because that is where the
    server records it and the only place a `FoodOrder` can carry the reason —
    see `TIMELINE_STEP`.
  */
  const refused = order.timeline?.find((step) => step.label === TIMELINE_STEP.refused);

  /*
    The kitchen's OWN quote, written onto the step it belongs to out of
    `promisedMinutes` and the moment the kitchen accepted.

    Undefined whenever no quote was given — and then the head says nothing
    about a time. It used to read `timeline[2].note`, a field nothing has ever
    set, so every live order in the product was headed "Ready by about soon".
  */
  const readyBy = order.timeline?.find((step) => step.label === TIMELINE_STEP.preparing)?.note;

  /*
    What is true about the money, which differs by how it was being paid.

    "You get the full ₹122 back" over a cash order is a refund somebody waits
    for and then writes to support about — nothing was ever taken from them.
    Only a payment that actually landed has anything to send back.
  */
  const paidOnline = order.paymentLabel === 'Paid online' || order.paymentLabel === 'Refund on the way';
  const refundLine = paidOnline
    ? `The ${formatRupees(order.paid)} you paid goes back to the account you paid from.`
    : order.paymentLabel === 'Cash on delivery'
      ? 'You were going to pay cash, so nothing was ever taken and there is nothing to refund.'
      : 'Nothing was charged for this order.';

  /*
    Cancel never disappears — that is this file's rule — so once it stops
    working it has to say why, and the reason is different in each state it can
    be dead in. Everything past `ready` used to fall to "This order has
    finished", which was shown for a kitchen's refusal and for a rider who is
    halfway to the door.
  */
  const cancelHint = cancellable
    ? 'Free until the kitchen starts cooking.'
    : order.status === 'preparing'
      ? 'The kitchen has started cooking, so it cannot be cancelled here. Call the restaurant if something is wrong.'
      : order.status === 'ready'
        ? 'The food is cooked and waiting, so it can no longer be cancelled. Call the kitchen if something is wrong.'
        : order.status === 'onTheWay'
          ? 'A rider is carrying it now. Call them if something is wrong.'
          : refused
            ? 'The kitchen could not take this order.'
            : order.status === 'cancelled'
              ? 'This order was cancelled.'
              : 'This order has finished.';

  const bill: BillLine[] = [
    ...order.lines.map((line) => ({
      id: line.name,
      label: line.qty > 1 ? `${line.name} ×${line.qty}` : line.name,
      amount: line.price,
    })),
    ...order.lines
      .filter((line) => line.note)
      .map((line) => ({ id: `${line.name}-note`, label: line.note as string, amount: 0, amountLabel: 'included', sub: true })),
    order.fulfilment === 'pickup'
      ? { id: 'pickup', label: 'Pickup', amount: 0, amountLabel: 'Free' }
      /* Not the cart's CURRENT address: an old order must keep saying where it
         actually went, and the cart has moved on. `FoodOrder` carries no
         address of its own, so the line is left unqualified rather than
         labelled with somewhere the food never went. */
      : { id: 'delivery', label: 'Delivery', amount: order.deliveryFee },
    /* The kitchen's own packing charge, under its own name. It used to be
       printed as "Taxes and charges", which was two lies in three words: no
       tax is levied on a Lampose order, and the money is the kitchen's rather
       than a government's. It is also the difference between these lines and
       `order.paid` — the server's `grandTotal` is items + packaging +
       delivery — so leaving it out made the receipt fail to add up. */
    ...(order.packagingCharge ? [{ id: 'packaging', label: 'Packaging by the kitchen', amount: order.packagingCharge }] : []),
    ...(order.discount ? [{ id: 'discount', label: order.couponCode ?? 'Discount', amount: order.discount, discount: true }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title={`Order ${order.id}`}
        subtitle={order.kitchenName}
        onBack={() => (placed ? router.replace('/home') : router.back())}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[3] }}
      >
        {placed && !awaitingPayment ? (
          <FoodNotice
            tone="good"
            title={order.paymentLabel === 'Cash on delivery' ? 'Order placed' : 'Payment successful'}
            body={`${formatRupees(order.paid)} · ${order.paymentLabel}. ${order.kitchenName} has your order — we send one notification when it is ready, and nothing else.`}
          />
        ) : null}

        {/*
          The order is written but the money never arrived, so nobody has been
          told about it. Said plainly, with the way out attached — the
          alternative is a student watching a tracking screen where nothing
          ever happens and no reason is given.
        */}
        {awaitingPayment ? (
          <FoodNotice
            tone="deadline"
            title="This order is waiting to be paid for"
            body={`${order.kitchenName} has not been told about it yet, and nothing has been charged. Finish the payment and it goes straight to the kitchen.`}
            actionLabel={paying ? 'Opening…' : 'Pay now'}
            onAction={paying ? undefined : resumePayment}
          />
        ) : null}

        {notice ? <FoodNotice tone="problem" title="We could not do that" body={notice} /> : null}

        {/*
          ── The kitchen said no ────────────────────────────────────────────

          The first thing on the screen, because it is the only thing that
          matters about this order. Three things have to be said and all three
          used to be missing: that the kitchen could not take it, why — in the
          kitchen's own words, never ours — and what has happened to the money.
          Before this the screen showed a refused order as a plain receipt with
          "This order has finished" under a dead Cancel button.
        */}
        {refused ? (
          <FoodNotice
            tone="problem"
            title={`${order.kitchenName} could not take this order`}
            body={`${refused.note ? `They said: “${refused.note}”` : 'They did not give a reason'}. ${refundLine}`}
          />
        ) : null}

        {/*
          ── The rider ──────────────────────────────────────────────────────

          Three states, and they are deliberately worded as three different
          things rather than one spinner:

            searching    every rider who could reach the kitchen before the
                         food is ready has been asked, all at once — not one
                         at a time, since the dispatcher moved to a broadcast
                         (see `foodDispatch.service.js`'s own header).
            unassigned   nobody in range has taken it yet. NOT a failure —
                         the kitchen is still cooking and the server reaches
                         further and tries again as the ready time nears and
                         once the food is actually ready, which is what this
                         says.
            assigned     somebody is carrying it, with a number to call.

          A "delivery partner not found" message on an order that is about to
          be delivered is worse than saying nothing, which is why the middle
          state is worded as a delay.
        */}
        {searching ? (
          <FoodNotice
            tone="info"
            title="Finding you a delivery partner"
            body="We are asking every rider near the kitchen who can make it in time, all at once. This usually takes under a minute."
          />
        ) : null}

        {/*
          The dispatcher's own sentence wins whenever it has written one. It is
          the only thing that knows whether this is a sweep that will run again
          when the food is ready or the end of the road with a person alerted —
          and the promise underneath, "we keep looking", is precisely the part
          that stops being true in the second case. The two hand-written
          sentences below are the fallback for a sweep that has not recorded a
          reason, and they still differ by whether anybody was there to ask.
        */}
        {noRiderYet ? (
          <FoodNotice
            tone="deadline"
            title={dispatchFailure ? 'We have not found a rider yet' : 'Still finding you a rider'}
            body={
              dispatchFailure
                ? asSentence(dispatchFailure)
                : nobodyInRange
                  ? 'No rider is on duty near this kitchen at the moment. Your food is still being prepared and we keep looking — you do not need to do anything.'
                  : 'Every rider nearby is busy right now. Your food is still being prepared and we keep looking — you do not need to do anything.'
            }
          />
        ) : null}

        {/*
          ── The map ────────────────────────────────────────────────────────

          Only once a rider exists. Before that there is nothing to follow, and
          a map of two static pins is decoration that teaches somebody to keep
          checking a screen that will not change.

          It renders even when `rider.location` is null — the server drops a fix
          older than two minutes, and the map says "we cannot see your rider"
          over the two ends of the journey rather than leaving a marker sitting
          still, which reads as a rider who has stopped.
        */}
        {rider && (order.pickupLocation || order.dropLocation) ? (
          <DeliveryMap
            restaurant={order.pickupLocation}
            drop={order.dropLocation}
            rider={rider.location ?? null}
            heading={rider.heading ?? null}
            riderAt={rider.at ?? null}
            pickedUp={!!rider.pickedUpAt}
          />
        ) : null}

        {rider ? (
          <View
            style={[
              styles.rider,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radius.card,
                padding: space[4],
                gap: space[2],
              },
            ]}
          >
            <View style={styles.headRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="eyebrow" color="tertiary">
                  {/* Three states, not two. The old test only asked whether the
                      rider had collected the food, so a DELIVERED order still
                      read "On the way to you" — the card kept describing a
                      journey that had finished, next to a timeline saying it
                      was over. */}
                  {rider.deliveredAt
                    ? 'Delivered by'
                    : rider.pickedUpAt
                      ? 'On the way to you'
                      : 'Heading to the restaurant'}
                </Text>
                <Text variant="title2">{rider.name}</Text>
                {rider.vehicle?.plate ? (
                  <Text variant="numMeta" color="tertiary">
                    {[rider.vehicle.type, rider.vehicle.model, rider.vehicle.plate]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : null}
              </View>
              {rider.phone ? (
                <Button
                  label="Call"
                  variant="secondary"
                  onPress={() => {
                    Linking.openURL(`tel:${rider.phone}`).catch(() =>
                      setNotice('This phone cannot place calls.'),
                    );
                  }}
                />
              ) : null}
            </View>

            {/*
              The PIN. Shown here rather than hidden behind a tap, because the
              moment it is needed is the moment somebody is standing at the door
              holding food — and it opens nothing, so there is nothing to
              protect. It is a value the two of them COMPARE.
            */}
            {/*
              Gone once the food is handed over. The code exists to be compared
              at a door; after that it is a number with no purpose left, and
              leaving it on screen under "read this out to the rider" tells
              somebody there is still a hand-over coming.
            */}
            {order.deliveryOtp && !rider.deliveredAt ? (
              <View
                style={{
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: radius.chip,
                  padding: space[3],
                  marginTop: space[1],
                }}
              >
                <Text variant="caption" color="tertiary">
                  Read this out to the rider at your door
                </Text>
                <Text variant="priceHero" style={{ letterSpacing: 6, marginTop: space[1] }}>
                  {order.deliveryOtp}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/*
          ── The finish ───────────────────────────────────────────────────

          The third state of this head, beside `live` and the plain receipt.
          Before it existed a delivered order simply LOST its live card — `live`
          excludes `delivered`, so the tracking head, the map and the rider all
          vanished at once and the screen fell to a bill with nothing saying the
          food had arrived.

          It sits here rather than on a route of its own because this file's
          contract is one order, one destination, ageing from tracking to
          receipt — and because pushing a screen from a poll tick would yank a
          diner off the page they are reading and leave Back pointing at a
          tracking screen for an order that is over.
        */}
        {finished ? (
          <View
            style={[
              {
                backgroundColor: justArrived ? colors.brandTint : colors.surface,
                borderColor: justArrived ? colors.brand : colors.border,
                borderWidth: justArrived ? 1.5 : StyleSheet.hairlineWidth,
                borderRadius: radius.card,
                padding: space[4],
                gap: space[2],
                alignItems: justArrived ? 'center' : 'flex-start',
              },
            ]}
          >
            {justArrived ? (
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: colors.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="check" size={24} color={colors.brand} />
              </View>
            ) : null}

            <Text
              variant={justArrived ? 'title1' : 'title3'}
              style={justArrived ? { textAlign: 'center' } : undefined}
            >
              {order.fulfilment === 'pickup' ? 'Picked up' : 'Delivered'}
            </Text>

            <Text
              variant="body"
              color="secondary"
              style={justArrived ? { textAlign: 'center' } : undefined}
            >
              {justArrived
                ? `Your order from ${order.kitchenName} is with you. Enjoy it.`
                : `From ${order.kitchenName}${deliveredAtLabel ? ` · ${deliveredAtLabel}` : ''}.`}
            </Text>

            {/* Only when there was one. A pickup has no rider, and a blank
                "delivered by" line reads as missing data rather than as a
                collection. */}
            {justArrived && rider?.name ? (
              <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
                Handed over by {rider.name}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* The live head. Everything a student needs while standing up. */}
        {live ? (
          <View
            style={[
              { backgroundColor: colors.graphite, borderRadius: radius.card, padding: space[4], gap: space[2] },
            ]}
          >
            <View style={styles.headRow}>
              <FoodStatusChip status={order.status} onDark />
              <Text variant="numMeta" style={{ color: colors.onGraphiteMuted }}>
                {order.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}
              </Text>
            </View>

            {/*
              One line, and every branch of it is something that has actually
              happened. `onTheWay` is here because a rider carrying a delivery
              is the middle of the order, not the end of it — the status used to
              be read as "picked up", which finished the order on this screen
              while the food was still moving. The last branch prints the
              kitchen's real quote when there is one and says what is happening
              when there is not; it used to print "Ready by about soon" for
              every order in the product, off a field nothing sets.

              The unpaid case comes first because it outranks the status: an
              order sitting at `placed` with the money still missing has not
              been sent to any kitchen, and the notice above already says so.
            */}
            <Text variant="display2" style={{ color: colors.onGraphite, marginTop: space[1] }}>
              {awaitingPayment
                ? 'Waiting for your payment'
                : order.status === 'ready'
                  ? order.fulfilment === 'pickup'
                    ? 'Waiting at the counter'
                    : 'Leaving the kitchen now'
                  : order.status === 'onTheWay'
                    ? 'On the way to you'
                    : order.status === 'placed'
                      ? 'Sent to the kitchen'
                      : readyBy ?? 'The kitchen is cooking it'}
            </Text>
            <Text variant="caption" style={{ color: colors.onGraphiteMuted }}>
              {order.fulfilment === 'pickup'
                ? `${kitchen?.landmark ?? 'the counter'} · ${kitchen?.walkMinutes ?? 0} min walk`
                : (address?.title ?? 'your address')}
            </Text>

            {order.pickupCode && order.status === 'ready' ? (
              <View
                style={[
                  styles.code,
                  { backgroundColor: colors.onGraphite, borderRadius: radius.card, padding: space[3], marginTop: space[3] },
                ]}
              >
                <Text variant="caption" style={{ color: colors.textTertiary }}>
                  Show this at the counter
                </Text>
                <Text variant="priceHero" style={{ color: colors.graphite, letterSpacing: 4, marginTop: space[1] }}>
                  {order.pickupCode}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Where it is */}
        {order.timeline?.length ? (
          <FoodTimeline steps={order.timeline} currentIndex={timelineIndex(order)} />
        ) : null}

        {/*
          Refund, when there is one. The support-message-that-never-gets-written.

          Nothing sets `order.refund` today and nothing honestly can: the server
          holds one fact about a refunded order — `paymentStatus: 'refunded'`,
          meaning the money is OWED back — and the refund itself is made by hand
          in the gateway dashboard, so there is no reference, no destination and
          no expected date to print. Filling those in from the order total and a
          guessed number of working days would be a receipt for a transaction
          nobody has made. What IS known reaches the diner through the Payment
          line on the receipt below, which says the refund is on the way. See
          the note beside `paymentLabel` in `FoodContext`.
        */}
        {order.refund ? (
          <View
            style={[
              styles.refund,
              { backgroundColor: colors.success.tint, borderColor: colors.success.border, borderRadius: radius.card, padding: space[4], gap: space[2] },
            ]}
          >
            <View style={styles.headRow}>
              <Text variant="title2" style={{ color: colors.success.ink, flex: 1 }}>
                Refund on the way
              </Text>
              <Text variant="priceLg" style={{ color: colors.success.ink }}>
                {formatRupees(order.refund.amount)}
              </Text>
            </View>

            <Text variant="caption" style={{ color: colors.success.ink }}>
              {order.refund.reason} {formatRupees(order.refund.amount)} goes back to {order.refund.destination}, the
              same way you paid. Expected by {order.refund.expectedBy}, often sooner.
            </Text>

            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.chip,
                padding: space[3],
                marginTop: space[1],
              }}
            >
              <ReceiptLine label="Reference" value={order.refund.reference} />
              <ReceiptLine
                label="Status"
                value={
                  order.refund.status === 'credited'
                    ? 'Credited'
                    : order.refund.status === 'sentToBank'
                      ? 'Sent to bank'
                      : 'Initiated'
                }
                last
              />
            </View>

            <Text variant="caption" style={{ color: colors.success.ink }}>
              Nothing for you to do. If it has not landed by {order.refund.expectedBy}, tap Get help and we chase the
              bank with that reference.
            </Text>
          </View>
        ) : null}

        {/* What was ordered */}
        <View
          style={[
            styles.group,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
          ]}
        >
          {order.lines.map((line, index) => (
            <View
              key={line.name}
              style={[
                styles.line,
                {
                  paddingVertical: space[3],
                  gap: space[3],
                  borderBottomWidth: index === order.lines.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: colors.borderSubtle,
                },
              ]}
            >
              <DietMark diet={line.diet} size={13} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="title3" numberOfLines={1}>
                  {line.qty > 1 ? `${line.name} ×${line.qty}` : line.name}
                </Text>
                {line.note ? (
                  <Text variant="caption" color="tertiary" numberOfLines={1}>
                    {line.note}
                  </Text>
                ) : null}
              </View>
              <Text variant="priceSm">{formatRupees(line.price)}</Text>
            </View>
          ))}
        </View>

        <BillBreakdown
          lines={bill}
          total={order.refund ? order.refund.amount : order.paid}
          totalLabel={order.refund ? 'Refunding' : live ? 'Paid' : 'Paid'}
        />

        <View
          style={[
            styles.group,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
          ]}
        >
          <ReceiptLine label="Placed" value={order.placedLabel} />
          <ReceiptLine label="How" value={order.fulfilment === 'pickup' ? 'Pickup at the counter' : 'Room delivery'} />
          <ReceiptLine label="Payment" value={order.paymentLabel} last />
        </View>

        {/*
          Cancel, only while the server will actually take it. Once the
          window closes the button is gone rather than left on screen
          disabled — `cancelHint` still says why, and what to do instead
          (call the kitchen, call the rider), so nothing is lost by dropping
          a control that could now only ever fail.
        */}
        {cancelling ? (
          <View
            style={[
              styles.group,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: space[3], gap: space[2] },
            ]}
          >
            <Text variant="title2">Why are you cancelling?</Text>
            {CANCEL_REASONS.map((entry) => (
              <Button
                key={entry}
                label={entry}
                size="sm"
                variant={reason === entry ? 'primary' : 'secondary'}
                fullWidth
                onPress={() => setReason(entry)}
              />
            ))}

            <View
              style={{
                backgroundColor: colors.success.tint,
                borderColor: colors.success.border,
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: radius.chip,
                padding: space[3],
                marginTop: space[1],
              }}
            >
              {/* The truth about the money, which is not one sentence. A cash
                  order has taken nothing, and promising a refund on it sends
                  somebody to their bank statement looking for money that was
                  never moved. */}
              <Text variant="title3" style={{ color: colors.success.ink }}>
                {paidOnline ? `You get the full ${formatRupees(order.paid)} back` : 'There is nothing to refund'}
              </Text>
              <Text variant="caption" style={{ color: colors.success.ink, marginTop: 2 }}>
                The kitchen has not started, so there is no cancellation fee. {refundLine}
              </Text>
            </View>

            <View style={[styles.actions, { gap: space[2], marginTop: space[1] }]}>
              <Button label="Keep my order" fullWidth onPress={() => setCancelling(false)} />
            </View>
            <Button
              label={paidOnline ? `Cancel and refund ${formatRupees(order.paid)}` : 'Cancel this order'}
              variant="destructive"
              fullWidth
              /* The SERVER decides. It refuses once the kitchen has started
                 cooking, frees whichever rider was already assigned and flags
                 prepaid money as owed back — and its refusal is the sentence
                 shown, because it is the one that says what to do instead. */
              onPress={() => {
                setNotice(null);
                cancelOrder(order.id, reason)
                  .then(() => setCancelling(false))
                  .catch((err: Error) => {
                    setCancelling(false);
                    setNotice(err?.message || 'We could not cancel that order.');
                  });
              }}
            />
          </View>
        ) : cancellable ? (
          <View style={{ gap: space[2] }}>
            <Button label="Cancel order" variant="destructive" fullWidth onPress={() => setCancelling(true)} />
            <Text variant="caption" color="tertiary" style={styles.center}>
              {cancelHint}
            </Text>
          </View>
        ) : (
          <Text variant="caption" color="tertiary" style={styles.center}>
            {cancelHint}
          </Text>
        )}

        <View style={[styles.actions, { gap: space[2] }]}>
          <Button label="Get help" variant="secondary" onPress={() => router.push('/support')} />
          <Button label="Order it again" onPress={() => router.push(foodHref.kitchen(order.kitchenId))} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rider: { borderWidth: StyleSheet.hairlineWidth },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  code: { alignItems: 'center' },
  refund: { borderWidth: StyleSheet.hairlineWidth },
  group: { borderWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row' },
  center: { textAlign: 'center' },
});
