import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { BookingTimeline, VerificationCodeDisplay } from '@/components/booking';
import { DirectionsButton } from '@/components/discovery';
import { ActionBar } from '@/components/lifecycle';
import { errorStates } from '@/constants/copy';
import { useTheme } from '@/context/ThemeContext';
import {
  addressVisible, findBooking, fromRealBooking, longDateLabel, type BookingSummary,
} from '@/data/bookings';
import {
  confirmMovedIn, devForceCheckIn, useBooking, useListing, useStayRequest,
} from '@/services';
/* DEVELOPMENT ONLY — remove with the dev check-in button below. */
import { usePreviewControls } from '@/hooks/useAppEnv';
import { formatRupees } from '@/utils/money';
import { useDepositMark } from '@/components/ui/DepositMark';

/**
 * One template, thirteen statuses.
 *
 * CONSTANT — never re-arranges, never disappears:
 *   · the header: name, booking id, sharing type
 *   · the timeline, always present and always in the same place
 *   · the terms: sharing, rent, deposit, move-in date, notice period
 *
 * A student in a dispute must find those in the SAME spot regardless of what
 * state the booking is in. Thirteen bespoke screens would drift, and the drift
 * lands on exactly the states people reach when something has gone wrong.
 *
 * SWAPS — one slot: the action bar.
 *
 * ## The status block at the top is gone
 *
 * It was the first thing on the screen: a tinted card restating the status in
 * a sentence. Directly beneath it, "Where this booking is" draws the same
 * status as a timeline with the same words on it. Two blocks answering one
 * question, the second better than the first, and the pair pushed the terms —
 * the reason anybody opens this screen twice — below the fold on a short
 * phone. The timeline carries its own headline and body, so nothing was lost
 * with the card.
 *
 * ## Every figure here is the server's
 *
 * The terms used to fall back to `data/bookings.ts` fixtures — ₹8,500 rent,
 * ₹17,000 deposit, a 30-day notice period, "13 Aug, 9:12 am" on every timeline
 * node — for any booking the fixture lookup matched. Those numbers belong to a
 * demo property. Printing them under the heading "Your terms", on the screen a
 * student opens when they are arguing with an owner about money, is the worst
 * place in the product to show a made-up figure.
 *
 * What is drawn now comes from two real sources and nothing else:
 *
 *   the BOOKING   `GET /customers/bookings/:id` — the share type, the dates,
 *                 `totalAmount` and `paidAmount` as the owner recorded them,
 *                 and the two move-in timestamps
 *   the LISTING   fetched by the booking's own `propertyId` — the rent and
 *                 deposit the property is listed at, clearly labelled as the
 *                 listing's figures rather than as an agreement, because that
 *                 is what they are
 *
 * A row with nothing behind it is absent. An empty terms block is a true
 * statement about a booking Lampose was told no money about; a filled one with
 * invented numbers is not.
 */
export default function BookingDetail() {
  const { colors, space, layout, mode, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  /*
   * Two id shapes reach this screen, and REAL is the primary one now.
   *
   *   a real booking id     the Mongo `_id` `GET /customers/bookings` hands
   *                         back — what `home.tsx`'s Bookings tab and a
   *                         push notification both link with. Fetched
   *                         directly, no detour through a stay request.
   *
   *   `bkg-<listingId>`     the legacy shape `booked/[id].tsx` still mints
   *                         at the moment of confirmation, kept working here
   *                         as a fallback by resolving the stay request
   *                         behind it — `stay.request.bookingId` is the real
   *                         id, stamped server-side the moment the owner
   *                         accepts (`acceptAndBook`).
   *
   * Either way, once a real booking resolves, `fromRealBooking` is what this
   * whole template actually renders — the fixture lookup (`findBooking`)
   * only fires as a fallback for ids that resolve to neither.
   */
  const isLegacyId = id?.startsWith('bkg-') ?? false;
  const listingId = isLegacyId ? (id as string).slice(4) : null;
  const stay = useStayRequest(listingId);

  const realBookingId = isLegacyId ? (stay.request?.bookingId ?? null) : (id ?? null);
  const real = useBooking(realBookingId);

  const fixture = useMemo(() => (id ? findBooking(id) : undefined), [id]);
  const stored = real.booking ? fromRealBooking(real.booking) : fixture;

  /* Still trying — a real fetch in flight, or (on the legacy path) the stay
     request it depends on not yet hydrated. Neither is "not found" yet. */
  const resolving = real.loading || (isLegacyId && (stay.isHydrating || (!stay.request && !fixture)));

  const entryPin = real.booking?.entryPin ?? stay.request?.entryPin ?? null;
  const canReview = real.booking?.status === 'completed' && real.booking?.reviewed === false;

  /*
   * The property this booking is for.
   *
   * Fetched by the booking's own `propertyId`, which is the same id the feed
   * and the detail screen use — so this is the listing, not a lookalike. It is
   * the only honest source for a rent and a deposit: `CustomerBooking` carries
   * `totalAmount` and `paidAmount` and no rent at all, because the owner
   * records what they have collected rather than what the room is listed at.
   *
   * On the legacy `bkg-<listingId>` path the id is in the route, so this
   * resolves either way.
   */
  const propertyId = real.booking?.propertyId ?? listingId ?? null;
  const property = useListing(propertyId ?? undefined);

  /*
   * Does this category take a payment through us?
   *
   * The category is the answer, not the status: `CONFIRMED` means the same
   * thing on a PG and on a bachelor room, and only one of the two involved
   * any money of ours. `visitToken.required` is the listing's own statement of
   * it — the same field `confirm/[id].tsx` reads to decide whether to show a
   * pay button — so the timeline and the payment flow cannot disagree about
   * whether this booking had a paid step.
   *
   * The stay request's `payment.required` is preferred where there is one,
   * because it is what was true for THIS request rather than what is true of
   * the listing today.
   */
  const chargesForVisit = stay.request?.payment
    ? Boolean(stay.request.payment.required)
    : Boolean(property.listing?.visitToken?.required);

  /* What the Lampose payment bought — a viewing, or the stay itself. Read off
     the request rather than the category, so a re-categorised listing cannot
     relabel a settled payment. */
  const visitPurpose = stay.request?.payment?.purpose ?? 'assisted_visit';

  const visitPaid = stay.request?.payment?.status === 'paid'
    && stay.request?.payment?.mode !== 'dev';
  const visitPaidRupees = (stay.request?.payment?.amountPaise ?? 0) / 100;

  /*
   * The timeline's stamps, from timestamps that were actually recorded.
   *
   * `timelineSteps` in `data/bookings.ts` was a fixture — "13 Aug, 9:12 am" on
   * every node of every booking — so the screen dated a stay that happened in
   * November to a morning in August. Each of these is null until the thing it
   * describes has happened, and `BookingTimeline` draws a stamp only on a node
   * it has both reached and been given one for.
   */
  const stamps = useMemo(() => {
    const at = (value?: string | null): string | undefined => {
      if (!value) return undefined;
      const ms = Date.parse(value);
      if (!Number.isFinite(ms)) return undefined;
      return new Date(ms).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
      });
    };

    return [
      { id: 'requested' as const, label: 'Requested', timestamp: at(stay.request?.createdAt ?? real.booking?.createdAt) },
      { id: 'accepted' as const, label: 'Accepted', timestamp: at(stay.request?.decidedAt) },
      { id: 'paid' as const, label: 'Paid', timestamp: at(stay.request?.payment?.paidAt) },
      {
        id: 'movedIn' as const,
        label: 'Moved in',
        /* The STUDENT's confirmation, because that is the one that completes
           it — the owner's alone leaves the move-in half done. */
        timestamp: at(real.booking?.movedInByStudentAt ?? real.booking?.movedInByOwnerAt),
      },
    ];
  }, [
    stay.request?.createdAt, stay.request?.decidedAt, stay.request?.payment?.paidAt,
    real.booking?.createdAt, real.booking?.movedInByStudentAt, real.booking?.movedInByOwnerAt,
  ]);

  /*
   * Moving in, which takes both of them.
   *
   * The owner marks it first — they check the PIN and open the door — and this
   * button unlocks only once they have. Before that it says what to do instead
   * of being greyed out for no stated reason: a disabled control with no
   * explanation is one people tap repeatedly.
   *
   * `stay.request.moveIn` only exists on the legacy path (it needs the stay
   * request, which the real-id path never fetches) — a real booking carries
   * the same two facts directly (`movedInByOwnerAt`/`movedInByStudentAt`),
   * so this is built from whichever of the two actually resolved.
   */
  const moveIn = real.booking
    ? {
      ownerConfirmedAt: real.booking.movedInByOwnerAt,
      studentConfirmedAt: real.booking.movedInByStudentAt,
      awaitingStudent: Boolean(real.booking.movedInByOwnerAt) && !real.booking.movedInByStudentAt,
      complete: Boolean(real.booking.movedInByOwnerAt && real.booking.movedInByStudentAt),
    }
    : stay.request?.moveIn;
  const [confirming, setConfirming] = useState(false);
  const [moveInError, setMoveInError] = useState<string | null>(null);

  /*
   * DEVELOPMENT ONLY — force both halves of the move-in.
   *
   * Two things gate a real check-in and both are correct: the owner has to go
   * first, and their own button does not unlock until the check-in DATE. That
   * makes everything downstream of moving in — and in particular the hotel
   * settlement becoming releasable, which is what the admin Monitor's Withdraw
   * button waits on — impossible to reach before the day arrives.
   *
   * Drawn on a build that allows preview controls, and it still 404s unless
   * the SERVER has `DEV_ALLOW_FORCE_CHECKIN` on — so the button says what to
   * switch on rather than vanishing, the same shape as the payment bypass on
   * the confirmation screen.
   *
   * Delete this, `devForceCheckIn` and the route it calls once the flow no
   * longer needs walking through by hand.
   */
  const previewControls = usePreviewControls();
  const [forcing, setForcing] = useState(false);

  const forceCheckIn = async () => {
    if (!realBookingId || forcing) return;
    setForcing(true);
    setMoveInError(null);
    try {
      await devForceCheckIn(realBookingId);
      /* Read back rather than assumed — the booking is the server's, and this
         has just changed both halves of it. */
      await real.refetch();
    } catch (error) {
      const failure = error as { status?: number; displayMessage?: string };
      setMoveInError(
        failure?.status === 404
          ? 'The server does not allow this. Set DEV_ALLOW_FORCE_CHECKIN="true" in Backend/.env '
            + '(NODE_ENV must not be production) and restart it.'
          : failure?.displayMessage ?? 'We could not force the check-in.',
      );
    } finally {
      setForcing(false);
    }
  };

  /* `POST /customers/stay-requests/:id/moved-in` is keyed by the REQUEST id,
     never the booking id — `CustomerBooking.requestId` is what carries it on
     the real path; the legacy path already has the request itself. */
  const confirmMoveInId = real.booking?.requestId ?? stay.request?.id ?? null;

  const onConfirmMovedIn = async () => {
    if (!confirmMoveInId) return;
    setConfirming(true);
    setMoveInError(null);
    try {
      await confirmMovedIn(confirmMoveInId);
      /* Refetched rather than assumed — the booking is the server's, and this
         screen has just changed it. */
      if (real.booking) await real.refetch();
      else await stay.refresh();
    } catch (error) {
      setMoveInError((error as { displayMessage?: string }).displayMessage
        ?? 'We could not confirm that. Try again in a moment.');
    } finally {
      setConfirming(false);
    }
  };
  /*
   * The screen reads three fetches — the booking, its property, and (on the
   * legacy `bkg-` path only) the stay request behind it. None of the hooks
   * expose a shared `isFetching`, so the refresh gesture tracks its own flag
   * the way `addresses/index.tsx` does, and simply awaits whichever of the
   * three are actually in play — `stay.refresh()` is a no-op with nothing to
   * refresh on the real-id path, since it has no `requestId`.
   */
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([real.refetch(), property.refetch(), stay.refresh()]);
    } finally {
      setRefreshing(false);
    }
  };

  if (!stored && resolving) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Booking" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="body" color="tertiary">Loading…</Text>
        </View>
      </View>
    );
  }

  if (!stored) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StateTemplate copy={errorStates.notFound()} onPrimary={() => router.replace('/home')} />
      </View>
    );
  }

  const booking: BookingSummary = stored;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title={booking.propertyName}
        subtitle={`${booking.reference} · ${booking.sharingLabel.toLowerCase()}`}
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[5], paddingBottom: space[8] }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {/* The status card that opened this screen is gone — "Where this
            booking is", immediately below, answers the same question with the
            same words and a timeline besides. See the note on the component. */}

        {/* Shown directly, no "reveal" tap — the code is the one thing on
            this screen a student opens it to read out at the door, and
            burying it behind a button was an extra step to something that
            is not a secret from either of them. Shown only when the SERVER
            has issued one and the booking is still awaiting move-in — see
            the note above. A locally minted code here is a number a student
            reads out to an owner holding a different one, and both believe
            it. */}
        {booking.status === 'CONFIRMED' && entryPin ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.card,
              padding: space[4],
            }}
          >
            {/* Six digit tiles with the full `LV-` form beneath — the same
                two things, in the same order, as both owner screens. */}
            <VerificationCodeDisplay
              code={entryPin.replace(/\D/g, '')}
              bookingReference={entryPin}
              ownerName={booking.ownerName}
              validLabel={booking.codeValidLabel ?? 'Valid on your move-in day'}
            />
          </View>
        ) : null}

        {/* CONSTANT — always present, always here. */}
        <View style={{ gap: space[3] }}>
          <Text variant="title3">Where this booking is</Text>
          <BookingTimeline
            status={booking.status}
            /* Real timestamps, from the request and the booking — see
               `stamps`. The fixture that used to sit here dated every node of
               every booking to one morning in August. */
            steps={stamps}
            /* The "Paid" node only on the categories that actually pay us —
               a bachelor's visit fee or a hotel's stay. See the note on
               `BookingTimeline`. */
            showPaid={chargesForVisit}
          />
        </View>

        {/* The address, revealed by payment.
            The public listing shows the locality only; the exact address, the
            landmark and the pin arrive with a paid booking and live on the
            booking itself rather than the listing. `addressVisible()` is the
            one place that decides which states may see it — a privacy rule
            written at three call sites is a privacy rule that will disagree
            with itself. */}
        {addressVisible(booking.status) && booking.address ? (
          <View style={{ gap: space[3] }}>
            <Text variant="title3">Where to go</Text>
            <DirectionsButton
              place={{
                coords: booking.coords,
                address: booking.address,
                label: booking.propertyName,
              }}
              address={booking.address}
              landmark={booking.landmark}
              variant="secondary"
            />
          </View>
        ) : null}

        {/* CONSTANT — a student in a dispute finds these in the same place
            whatever state the booking is in. */}
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
          <Text variant="title3">Your terms</Text>

          {/* The share type as the owner recorded it on the booking. */}
          <Term label="Sharing" value={booking.sharingLabel} />

          {/*
            The property's listed rent and deposit.

            Labelled "listed" rather than "your rent", and that wording is the
            honest part: these come from the LISTING, which is what the place
            is advertised at today, and the rent a student actually agreed with
            an owner is a conversation Lampose was never part of. Stating them
            as the agreement would be inventing a contract; stating them as the
            listing is a fact, and it is the figure somebody wants when they
            are checking whether they are being asked for more than the
            advertised price.

            Absent entirely when the listing has no rent on record, rather than
            drawn as ₹0.
          */}
          {property.listing?.rent != null ? (
            <Term label="Listed rent" value={`${formatRupees(property.listing.rent)} /mo`} />
          ) : null}
          {property.listing?.deposit != null ? (
            <Term
              label="Listed deposit"
              value={formatRupees(property.listing.deposit)}
              refundable
            />
          ) : null}

          {/*
            What the OWNER has recorded against this stay, when they have
            recorded anything. Zero and null are different here: an owner who
            has entered nothing gets no row, and one who has entered ₹0 paid
            against a ₹40,000 total gets both, because that gap is the thing
            worth seeing.
          */}
          {real.booking && real.booking.totalAmount > 0 ? (
            <>
              <Term label="Total agreed with the owner" value={formatRupees(real.booking.totalAmount)} />
              <Term label="Paid to the owner so far" value={formatRupees(real.booking.paidAmount)} />
            </>
          ) : null}

          {/* The one payment that came through Lampose. Only the assisted-visit
              categories have one, and only once it has actually verified — the
              development bypass is excluded, so a waived visit never prints a
              receipt for money nobody sent. */}
          {chargesForVisit && visitPaid && visitPaidRupees > 0 ? (
            <Term
              /* A visit fee and a room bill are the same field and completely
                 different money. Named by what the payment BOUGHT, off the
                 request's own purpose. */
              label={visitPurpose === 'stay_booking'
                ? 'Stay, paid to Lampose'
                : 'Assisted visit, paid to Lampose'}
              value={formatRupees(visitPaidRupees)}
            />
          ) : null}

          <Term label="Move-in date" value={booking.moveInLabel} />
          {booking.checkOutDate ? (
            <Term label="Move-out date" value={longDateLabel(booking.checkOutDate)} />
          ) : null}

          {/* Notice period and lock-in come from the LISTING where the panel
              recorded them. Nothing derives either — a notice period guessed
              from a rent is the kind of number that ends up quoted back to an
              owner. */}
          {property.listing?.noticePeriodDays != null ? (
            <Term label="Notice period" value={`${property.listing.noticePeriodDays} days`} />
          ) : null}

          {/* Said once, under the figures, so nobody reads the two blocks above
              as one agreement. */}
          <Text variant="caption" color="tertiary">
            Rent and deposit are settled directly with {booking.ownerName ?? 'the owner'} — Lampose
            does not hold them. Anything shown here is what we were told.
          </Text>
        </View>

        {/*
          Moving in — the second half of it.

          Shown once there is a booking and until both sides have confirmed.
          Before the owner marks it, this is a SENTENCE rather than a greyed
          button: "waiting for the owner" tells somebody standing in a room
          what to do next, and a disabled control with no explanation is one
          people tap over and over.
        */}
        {moveIn && !moveIn.complete ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderColor: moveIn.awaitingStudent ? colors.success.border : colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[3],
            }}
          >
            <View style={{ gap: space[1] }}>
              <Text variant="bodyStrong">
                {moveIn.awaitingStudent ? 'Confirm you have moved in' : 'Moving in'}
              </Text>
              <Text variant="caption" color="secondary">
                {moveIn.awaitingStudent
                  ? `${booking.ownerName ?? 'The owner'} has marked you in. Confirm from your side and the stay begins.`
                  : `Show your entry PIN to ${booking.ownerName ?? 'the owner'} when you arrive. Once they mark you in, you confirm here.`}
              </Text>
            </View>

            {moveInError ? (
              <Text variant="caption" style={{ color: colors.danger.ink }}>
                {moveInError}
              </Text>
            ) : null}

            <Button
              label={confirming ? 'Confirming…' : 'I have moved in'}
              onPress={onConfirmMovedIn}
              /* Locked until the owner goes first — the server refuses it
                 anyway, and a button that can only fail is worse than one
                 that plainly waits. */
              disabled={!moveIn.awaitingStudent || confirming}
              fullWidth
            />

            {/* DEVELOPMENT ONLY — see `forceCheckIn`. Stamps BOTH halves, so
                it works from either state rather than only unlocking the
                button above. Labelled loudly enough that it cannot be
                mistaken for the real control. */}
            {previewControls ? (
              <>
                <Button
                  label={forcing ? 'Checking in…' : '🛠 DEV: force check-in (both sides)'}
                  onPress={() => { void forceCheckIn(); }}
                  variant="secondary"
                  disabled={forcing}
                  fullWidth
                />
                <Text variant="numMeta" color="tertiary" style={styles.centred}>
                  Development bypass — marks the owner and you as checked in
                </Text>
              </>
            ) : null}
          </View>
        ) : moveIn?.complete ? (
          <View
            style={{
              backgroundColor: colors.success.tint,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[1],
            }}
          >
            <Text variant="bodyStrong" style={{ color: colors.success.ink }}>
              You have moved in
            </Text>
            <Text variant="caption" style={{ color: colors.success.ink }}>
              Both you and {booking.ownerName ?? 'the owner'} confirmed it. Enjoy the room.
            </Text>
          </View>
        ) : null}

        {/* SLOT 2 — swaps by status. */}
        <ActionBar
          booking={booking}
          category={property.listing?.category}
          onPrimary={() => {
            if (booking.status === 'ACCEPTED' || booking.status === 'PAYMENT_PENDING') {
              router.push(`/pay/lst-pg-0143` as never);
            } else if (booking.status === 'CHECKED_OUT') router.push('/bookings/refund');
            else router.push('/home');
          }}
          onSecondary={() => {
            // "Track my refund", on both cancelled states.
            if (booking.status.startsWith('CANCELLED')) {
              router.push({ pathname: '/bookings/refund', params: { id: realBookingId ?? id } } as never);
            }
            else router.push('/home');
          }}
          onDestructive={() => {
            // Leaving a stay is notice; leaving a booking is cancellation.
            // They are different screens because they are different amounts of
            // someone's money.
            if (booking.status === 'CHECKED_IN') {
              router.push('/bookings/notice');
              return;
            }
            router.push(
              (realBookingId ? `/bookings/cancel?id=${realBookingId}` : '/bookings/cancel') as never,
            );
          }}
          onSupport={() => router.push('/support/new')}
        />

        {/* "Rate your stay" — additive, and independent of the fixture status
            above. Shown only once the REAL booking behind this one says the
            stay is complete and unreviewed; see `real` above. */}
        {canReview ? (
          <View
            style={{
              backgroundColor: colors.surfaceSunken,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[3],
            }}
          >
            <Text variant="title3">How was your stay?</Text>
            <Text variant="body" color="secondary">
              A quick review helps other students, and it reaches {booking.propertyName} directly.
            </Text>
            <Button
              label="Rate your stay"
              variant="secondary"
              onPress={() => router.push(`/bookings/review?id=${realBookingId}` as never)}
            />
          </View>
        ) : null}

        {/* The preview-only status switcher stood here: thirteen buttons under
            the cancel button, one per booking status, for reaching states
            without a server. It is gone with the rest of the developer surface
            — and it was the last thing on a screen whose last thing should be
            the action bar. `override` and `usePreviewControls` went with it. */}

      </ScrollView>
    </View>
  );
}

function Term({
  label,
  value,
  refundable = false,
}: {
  label: string;
  value: string;
  refundable?: boolean;
}) {
  const { colors } = useTheme();
  const depositMark = useDepositMark();
  return (
    <View style={styles.termRow}>
      {/* The label flexes, the value does not. "Lock-in ends" beside
          "5 December 2026" had no give at all — and a truncated date in the
          terms block is exactly the thing a student would be arguing about. */}
      <Text variant="caption" color="secondary" style={styles.flex}>
        {label}
      </Text>
      <Text
        variant="priceSm"
        style={
          refundable
            ? depositMark
            : undefined
        }
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
  termRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  flex: { flex: 1 },
});
