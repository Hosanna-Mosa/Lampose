import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { VerificationCodeDisplay } from '@/components/booking';
import { DirectionsButton } from '@/components/discovery';
import { errorStates } from '@/constants/copy';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { addressVisible, confirmedBookingFor, fromRealBooking } from '@/data/bookings';
import { useBooking, useListing, useStayRequest } from '@/services';
import { formatRupees } from '@/utils/money';

/**
 * Screen two of two: it is yours.
 *
 * The last thing in the flow, and the first moment the student has something
 * concrete rather than a hope. Four blocks, in the order somebody actually
 * needs them:
 *
 *   1. it is confirmed
 *   2. where it is, and a way to get there
 *   3. the code that gets them in the door
 *   4. where this lives from now on
 *
 * ## The address appears here for the first time
 *
 * Not because this screen decided to show it — because this is the first
 * object in the system that *has* one. `Listing` carries a locality and a
 * landmark and nothing more, so no discovery screen is capable of leaking an
 * address it was never given. The full address, the landmark and the map pin
 * are attached to the booking at confirmation, and `addressVisible()` is the
 * single place that decides which booking states may render them.
 *
 * ## Whether anything was paid depends on the category, and this screen says
 * which
 *
 * It used to state "nothing was charged" unconditionally, because when it was
 * written no category charged for anything. One does now: a bachelor room
 * takes ₹199 for an assisted visit — ₹100 for the Lampose representative
 * who accompanies it, ₹99 our fee — before
 * this screen is ever reached. So the sentence was flatly untrue for the one
 * category that had just been charged, on the screen somebody looks at
 * immediately after paying, and there was no receipt for it anywhere in the
 * app.
 *
 * `stay.request.payment.required` is the server's answer to "does this
 * category charge", and `payment.status` to "did this one go through" — the
 * same two fields `confirm/[id].tsx` gates its own pay button on, so the two
 * screens cannot disagree about whether money moved. The paid block below is
 * a receipt: what was taken, how it splits, when, and what it bought. The free
 * categories say so in one clause instead.
 *
 * `payment.mode` is checked as well as the status, because the development
 * bypass marks a request paid without taking anything. Printing "₹199 paid" for
 * a waived visit would put a receipt on screen for money nobody sent.
 *
 * The entry PIN stays the centre of the free path: with no payment step
 * between the owner accepting and the bed being held, the code is the only
 * thing between a confirmation and a stranger walking in.
 *
 * ## The screen is a receipt, not a destination
 *
 * Everything on it is repeated in the booking detail, permanently. A student
 * arriving at the gate three weeks later goes to Bookings, not back here — so
 * the last block's job is to say that out loud, and the primary action takes
 * them there rather than dumping them on the feed.
 *
 * Which is also why the prose here is kept short. Somebody ten seconds past
 * paying wants four facts — it is confirmed, where, the code, where it lives
 * — and every extra sentence pushes one of those below the fold. Anything
 * that reads as reassurance rather than information belongs to the booking
 * detail, which is where it is read at leisure.
 */
/** "5 September 2026" from a `YYYY-MM-DD` calendar day. */
function prettyDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${day} ${names[month - 1]} ${year}`;
}

export default function Booked() {
  const { mode, colors, space, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const { id, sharingId, joinDate } = useLocalSearchParams<{
    id: string;
    sharingId?: string;
    joinDate?: string;
  }>();

  const { clear } = usePendingRequest();

  /*
   * Reaching this screen is what "finish" meant.
   *
   * The pill says "confirmed — tap to finish" and keeps saying it until
   * something clears it. Landing here IS the finish, so it goes — otherwise a
   * student who has seen their booking is followed around the app by a
   * prompt to go and see it.
   */
  useEffect(() => { clear(); }, [clear]);

  const { listing, isPending, notFound, refetch: refetchListing } = useListing(id);

  /*
   * The accepted request — and specifically its ENTRY PIN.
   *
   * This screen used to mint everything on the device, including the code,
   * because the comment here said "there is no bookings endpoint, nothing
   * server-side records that a student took a bed". That stopped being true
   * when accepting a request started writing a booking and issuing a PIN.
   *
   * The consequence was the bug this fixes: the owner's app showed the real
   * `LV-548005` and this screen showed an invented `419273`. Two people
   * standing at a door with different codes, each certain theirs was right.
   *
   * The presentational scaffolding below is still local — the address, the
   * "valid on" wording, the move-in label — because those have no server
   * equivalent yet. The CODE is not scaffolding.
   */
  const stay = useStayRequest(id);

  /*
   * The real booking, fetched the moment there is an id for one.
   *
   * `stay.request.bookingId` is stamped server-side the instant the owner
   * accepts (`acceptAndBook`), so it is there before this screen ever
   * renders on the normal path — the request only redirects here once it is
   * `confirmed`. This is what fixes the move-in date this screen used to
   * show: `joinDate` is a route param carried from the ORIGINAL request, and
   * for a bachelor room — which has no joining-date field on the request at
   * all, only the visit-scheduling one — it was always empty, so the date
   * below silently fell back to a fixture's hardcoded "5 September" on every
   * bachelor booking, regardless of when it actually started. The real
   * booking's own `checkInDate` is what `app/bookings/[id].tsx` already
   * reads correctly; this screen now reads the same field.
   */
  const realBookingId = stay.request?.bookingId ?? null;
  const real = useBooking(realBookingId);

  /*
   * Three independent fetches feed this receipt — the listing, the stay
   * request (for the PIN and payment split) and the real booking once it
   * exists. None of the three hooks expose a matching `isFetching`, so the
   * pulled-to-refresh gesture tracks its own flag the way `addresses/index.tsx`
   * does, rather than trying to line up three differently-shaped hooks.
   */
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchListing(), stay.refresh(), real.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };
  /* The real booking's own PIN wins where there is one — same priority as
     `app/bookings/[id].tsx`, and for the same reason: `stay.request` can go
     stale in a way a freshly-fetched booking does not. */
  const entryPin = real.booking?.entryPin ?? stay.request?.entryPin ?? null;

  /*
   * The booking the confirmed request became.
   *
   * Created once and then found on every later visit, so re-entering this
   * screen does not mint a second booking or a second move-in code — but
   * only as a fallback while the real one is still loading. Once `real`
   * resolves it always wins, `moveInLabel` included.
   */
  const booking = useMemo(() => {
    if (real.booking) return fromRealBooking(real.booking);
    if (!listing) return undefined;
    return confirmedBookingFor({
      listingId: listing.id,
      propertyName: listing.name,
      sharingLabel:
        listing.sharingOptions?.find((option) => option.id === sharingId)?.label ??
        listing.sharingLabel ??
        'Your room',
      ownerName: listing.ownerName,
      rent: listing.rent ?? 0,
      moveInLabel: joinDate ? prettyDate(joinDate) : undefined,
    });
  }, [real.booking, listing, sharingId, joinDate]);

  /* A fetch in flight is not a missing booking. Showing "not found" while the
     listing loads would tell a student their confirmation had gone. */
  if (isPending) {
    // `styles.centre` only centres horizontally and is used by blocks that
    // rely on that, so centring both axes is inline rather than a change to it.
    return (
      <View
        style={[styles.flex, { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }]}
      >
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (notFound || !listing || !booking) {
    return <StateTemplate copy={errorStates.notFound()} onPrimary={() => router.replace('/home')} />;
  }

  const owner = listing.ownerName ?? 'the owner';

  /*
   * The address, and which of the two is real.
   *
   * `stay.request.address` is the property's own, attached by the server only
   * once the request has earned it — a fixed slot on an assisted visit, a
   * cleared payment on a stay booking. `booking.address` is the local fixture
   * `confirmedBookingFor` mints, which is a placeholder and has been the only
   * thing this screen showed.
   *
   * The server's wins whenever there is one. The COORDINATES do not travel
   * with it, and that is why they are dropped alongside: the fixture's pin
   * belongs to the fixture's address, and pairing a real street with an
   * invented pin would send somebody confidently to the wrong building.
   * `openInGoogleMaps` falls back to searching the address text, which is
   * right for an address somebody could also read out over a phone.
   */
  const realAddress = stay.request?.address?.trim() || null;
  const shownAddress = realAddress ?? booking.address;
  const shownLandmark = realAddress ? undefined : booking.landmark;
  const shownCoords = realAddress ? undefined : booking.coords;

  const showAddress = addressVisible(booking.status) && Boolean(shownAddress);

  /* ------------------------------------------------------------------ *
   * Did this category charge, and did it go through? See the header note.
   * ------------------------------------------------------------------ */

  const payment = stay.request?.payment;
  /** The category charges for the assisted visit — bachelor and co-live. */
  const chargesForVisit = Boolean(payment?.required);
  /** Real money, verified by the server. `dev` is the bypass, not a payment. */
  const paidForVisit = chargesForVisit && payment?.status === 'paid' && payment?.mode !== 'dev';
  /** The bypass waived it. Said plainly rather than dressed as a receipt. */
  const waivedForVisit = chargesForVisit && payment?.status === 'paid' && payment?.mode === 'dev';

  const paidRupees = (payment?.amountPaise ?? 0) / 100;
  const repRupees = (payment?.representativePaise ?? 0) / 100;
  const feeRupees = (payment?.feePaise ?? 0) / 100;

  const paidAtLabel = payment?.paidAt
    ? new Date(payment.paidAt).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
    })
    : null;

  const visit = stay.request?.lamposeVisit;
  const visitScheduled = visit?.status === 'scheduled' && Boolean(visit.date && visit.time);

  /*
   * Which of the two payments this was — see the header note.
   *
   * A visit fee bought somebody's afternoon; a stay booking bought the room.
   * The receipt below says completely different things for the two, and it
   * reads the REQUEST's own purpose rather than the listing's category so a
   * re-categorised listing cannot rewrite a receipt.
   */
  const isStayBooking = (payment?.purpose ?? 'assisted_visit') === 'stay_booking';

  /* The dates and the arithmetic, from the server's resolved intent. Nothing
     here is multiplied out on the device: the total was charged by the server
     and a locally-derived breakdown could contradict it. */
  const intent = stay.request?.intent;
  const stayNights = intent?.rateQuantity ?? null;
  const stayUnit = intent?.rateQuantityUnit ?? 'nights';
  const stayRate = intent?.rateAmount ?? null;

  const goToBooking = () => {
    // The request is over and its outcome has been read, so the pill that was
    // following the student around has nothing left to tell them.
    clear();
    router.replace(`/bookings/${booking.id}` as never);
  };

  return (
    /*
     * The bottom inset lives on the SCREEN, not on the scroll content.
     *
     * Content padding only guarantees the LAST item clears the navigation bar.
     * The viewport still runs underneath it, so on an edge-to-edge Android
     * build everything above the end visibly slides under the gesture bar as
     * you scroll — which is what this screen was reported for: a paragraph
     * half-disappearing into the system navigation.
     *
     * Padding the root ends the viewport ABOVE the bar instead and leaves a
     * band of `bg` behind it, so nothing ever passes underneath. It is the
     * same thing the tab bar does on the screens that have one — it paints an
     * opaque surface across that band — done with the page's own ground on a
     * screen that has no bottom chrome of its own.
     */
    <View style={[styles.flex, { backgroundColor: colors.bg, paddingBottom: insets.bottom }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {/*
        A way out, which this screen did not have.

        It had no back arrow on the reasoning that "back would be the wait,
        which no longer exists" — true of the navigation stack and beside the
        point for the person holding the phone. Every route into here is a
        `replace`, so the OS back gesture leaves the app entirely and the only
        controls were two buttons below the fold, under a receipt, an address
        and a six-digit code. On a short phone that is a screen with no visible
        way off it.

        It goes HOME rather than back: what is underneath varies by route —
        the confirmation screen, the slot picker, the pill that used to float
        over everything — and none of those is somewhere to return to once the
        booking exists. `clear()` for the same reason the buttons below call
        it; the request is finished either way.
      */}
      <StandardHeader
        title="Confirmed"
        subtitle={listing.name}
        onBack={() => {
          clear();
          router.replace('/home');
        }}
      />

      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: space[5],
          paddingBottom: space[8],
          gap: space[6],
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {/* 1 — it is confirmed. */}
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(160) : FadeInDown.duration(320)}
          style={[styles.centre, { gap: space[3] }]}
        >
          <View
            style={[
              styles.seal,
              { backgroundColor: colors.success.tint, borderRadius: radius.pill },
            ]}
          >
            <Icon name="check" size={28} color={colors.brandInk} />
          </View>
          <Text variant="title1" style={styles.centred}>
            {owner} has your booking
          </Text>
          {/* One clause, and which one is true is the category's answer, never
              this screen's guess. Saying "nothing was charged" to somebody who
              has just paid ₹199 is the specific failure this avoids. The
              detail behind each — the split, the dates — is the receipt
              block's job, so this line does not also carry it. */}
          <Text variant="bodyLg" color="secondary" style={styles.centred}>
            {booking.sharingLabel} at {listing.name}, from {booking.moveInLabel}.{' '}
            {!chargesForVisit
              ? 'Nothing to pay before you move in.'
              : isStayBooking
                ? 'Paid in full.'
                : 'Your visit is paid for.'}
          </Text>
          <Text variant="priceSm" color="tertiary">
            {/* The server's PIN doubles as the booking reference — one string
                both people and support can quote. The local `booking.reference`
                was minted from the listing id and means nothing to anybody. */}
            {entryPin ?? booking.reference}
          </Text>
        </Animated.View>

        {/*
          1b — what was paid, on the categories that charge.

          A receipt rather than a confirmation: the total, the split the server
          sent, and when. The split is the server's own `representativePaise`
          and `feePaise` — the two always add up to `amountPaise`, so nothing
          here is arithmetic this screen did — and it is printed because "₹199"
          on its own invites the question this block exists to answer.
        */}
        {paidForVisit ? (
          <View style={{ gap: space[3] }}>
            <Text variant="title3">What you paid</Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: radius.card,
                padding: space[4],
                gap: space[3],
              }}
            >
              <View style={styles.payRow}>
                <Text variant="caption" color="secondary" style={styles.flex}>
                  {isStayBooking ? 'Your stay' : 'Assisted visit'}
                </Text>
                <Text variant="priceMd">{formatRupees(paidRupees)}</Text>
              </View>

              {/*
                How the figure was reached.

                A stay shows the arithmetic — "3 nights × ₹1,200" — because a
                guest handed a four-figure total is owed the sum behind it. A
                visit shows the two-line split the fee is explained with. Both
                come off the server; neither is computed here, so neither can
                disagree with what was charged.
              */}
              {isStayBooking ? (
                stayNights && stayRate ? (
                  <>
                    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />
                    <View style={styles.payRow}>
                      <Text variant="caption" color="tertiary" style={styles.flex}>
                        {stayNights} {stayNights === 1 ? stayUnit.replace(/s$/, '') : stayUnit}
                        {' × '}{formatRupees(stayRate)}
                      </Text>
                      <Text variant="priceSm" color="tertiary">
                        {formatRupees(paidRupees)}
                      </Text>
                    </View>
                  </>
                ) : null
              ) : repRupees > 0 && feeRupees > 0 ? (
                <>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />
                  <View style={styles.payRow}>
                    <Text variant="caption" color="tertiary" style={styles.flex}>
                      Lampose representative who comes with you
                    </Text>
                    <Text variant="priceSm" color="tertiary">
                      {formatRupees(repRupees)}
                    </Text>
                  </View>
                  <View style={styles.payRow}>
                    <Text variant="caption" color="tertiary" style={styles.flex}>
                      Lampose fee
                    </Text>
                    <Text variant="priceSm" color="tertiary">
                      {formatRupees(feeRupees)}
                    </Text>
                  </View>
                </>
              ) : null}

              {paidAtLabel ? (
                <Text variant="numMeta" color="tertiary">
                  Paid {paidAtLabel}
                </Text>
              ) : null}
            </View>

            {/* What the money bought. A stay is finished — the dates are the
                answer. A visit still needs a day and a time, and says so
                rather than leaving the block ending on a figure. */}
            <Text variant="caption" color="secondary">
              {isStayBooking
                ? (intent?.checkIn && intent?.checkOut
                  ? `Your room is booked from ${prettyDate(intent.checkIn)} to ${prettyDate(intent.checkOut)}.`
                  : 'Your room is booked for the dates you chose.')
                : visitScheduled
                  ? `A Lampose representative meets you at ${visit!.time} on ${visit!.date}.`
                  : visit?.status === 'manual'
                    ? 'Our team is arranging your visit and will call you to fix a time.'
                    : 'Pick a day and time for your visit and we will confirm the representative.'}
            </Text>

            {/* What is NOT covered — on the visit fee only. ₹199 against a
                year's rent is the figure somebody can mistake for a deposit,
                so that one line stays. A stay booking says "Paid in full"
                above and needs no paragraph qualifying it. */}
            {!isStayBooking ? (
              <Text variant="caption" color="tertiary">
                Rent and deposit are settled with {owner} directly.
              </Text>
            ) : null}
          </View>
        ) : waivedForVisit ? (
          <View
            style={{
              backgroundColor: colors.warning.tint,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[1],
            }}
          >
            <Text variant="bodyStrong" style={{ color: colors.warning.ink }}>
              Visit fee waived
            </Text>
            <Text variant="caption" style={{ color: colors.warning.ink }}>
              Nothing was charged for this booking.
            </Text>
          </View>
        ) : null}

        {/* 2 — where it is. The first screen in the product allowed to say. */}
        {showAddress ? (
          <View style={{ gap: space[3] }}>
            <Text variant="title3">Where to go</Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: radius.card,
                padding: space[4],
                gap: space[3],
              }}
            >
              <View style={[styles.row, { gap: space[3] }]}>
                <Icon name="mapPin" size={20} color={colors.textSecondary} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{shownAddress}</Text>
                  {/* How people here actually navigate the last 200 metres. A
                      pin gets you to the street; a shop gets you to the gate.
                      Only ever the fixture's — the server sends a street
                      address and no landmark. */}
                  {shownLandmark ? (
                    <Text variant="caption" color="secondary">
                      {shownLandmark}
                    </Text>
                  ) : null}
                </View>
              </View>

              {owner !== 'the owner' ? (
                <Text variant="caption" color="tertiary">
                  Ask for {owner} at the gate.
                </Text>
              ) : null}

              {/* The button sits under the address rather than replacing it —
                  somebody comparing two places, or reading it out over a phone
                  call, needs the text itself and not just a link. */}
              <DirectionsButton
                place={{
                  coords: shownCoords,
                  address: shownAddress,
                  label: `${listing.name}, ${listing.locality}`,
                }}
                variant="secondary"
                label="Open in Google Maps"
              />
            </View>
          </View>
        ) : null}

        {/*
          3 — the code.

          Shown only when the SERVER has issued one. A locally minted code
          here would be a number a student reads out at a door to an owner
          holding a different one — worse than no code at all, because both
          people believe it.

          The tiles carry the six digits; the full `LV-` form sits underneath
          as the reference, and the owner's screen shows the same two things
          in the same order. Nine tiles do not fit a phone.
        */}
        {entryPin ? (
          <VerificationCodeDisplay
            code={entryPin.replace(/\D/g, '')}
            bookingReference={entryPin}
            ownerName={listing.ownerName}
            validLabel={booking.codeValidLabel ?? 'Valid on your move-in day'}
            variant="embedded"
          />
        ) : null}

        {/* 4 — where this lives from now on. */}
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.card,
            padding: space[4],
            gap: space[2],
          }}
        >
          <Text variant="bodyStrong">This is saved in Bookings</Text>
          <Text variant="caption" color="secondary">
            The address and your code stay there — no need to screenshot this.
          </Text>
        </View>

        <View style={{ gap: space[3] }}>
          <Button label="View my booking" onPress={goToBooking} fullWidth />
          {/*
            "Go to home", not "Keep looking".

            This button has always gone to `/home`; the label was the problem.
            `/home` IS the explore feed in this app, so the two are the same
            destination — but "Keep looking" reads as an invitation to carry on
            shopping, which is not what somebody wants ten seconds after
            booking a room. Asked for a way home, they scrolled past this.

            Renamed rather than joined by a second button: two controls with
            one behaviour is a worse screen than one control that says where it
            goes.
          */}
          <Button
            label="Go to home"
            variant="secondary"
            onPress={() => {
              clear();
              router.replace('/home');
            }}
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  /* Baseline-aligned, so a wrapping label and its figure sit on one line. */
  payRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  centre: { alignItems: 'center' },
  centred: { textAlign: 'center' },
  seal: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});
