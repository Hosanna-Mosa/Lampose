import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { Button, Icon, Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { BookingTimeline, VerificationCodeDisplay } from '@/components/booking';
import { LinearGradient } from 'expo-linear-gradient';
import { DirectionsButton } from '@/components/discovery';
import { ActionBar, hasActions } from '@/components/lifecycle';
import { errorStates } from '@/constants/copy';
import { useTheme } from '@/context/ThemeContext';
import {
  addressVisible, findBooking, fromRealBooking, longDateLabel, type BookingSummary,
} from '@/data/bookings';
import {
  devForceCheckIn, useBooking, useListing, useStayRequest,
} from '@/services';

/* DEVELOPMENT ONLY — remove with the dev check-in button below. */
import { useDevBypass } from '@/hooks/useAppEnv';
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

/**
 * Every boxed container on this screen corners at this.
 *
 * One number rather than the 20/16/10 they had drifted to, and tighter than
 * `radius.card` (16): the screen is a column of five or six bordered cards,
 * and at 20 the stack read as a pile of lozenges. Badges, chips, dots and
 * circular icon wells keep their own radii — those are meant to be round.
 */
const BOX_RADIUS = 10;

export default function BookingDetail() {
  const { colors, space, layout, mode } = useTheme();
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
   * Moving in, which is the owner's single act.
   *
   * It used to take two confirmations — the owner marked the student in, and
   * the student then tapped "I have moved in" here. The second one is gone.
   * The owner typing the entry PIN off the student's phone is the two of them
   * standing in the same doorway, which is better evidence than a tap by the
   * person who just read the number out; all the second step reliably
   * produced was stays that sat unfinished because somebody put their phone
   * down after being let in.
   *
   * So `complete` is read off the OWNER's stamp alone. The server does the
   * same (`withMoveIn`), and doing it identically here is what settles the
   * bookings that were mid-flight when this changed: an owner had marked them
   * in, the student never tapped, and they are moved in.
   *
   * `stay.request.moveIn` only exists on the legacy path (it needs the stay
   * request, which the real-id path never fetches) — a real booking carries
   * the timestamps directly — so this is built from whichever resolved.
   */
  const moveIn = real.booking
    ? {
      ownerConfirmedAt: real.booking.movedInByOwnerAt,
      studentConfirmedAt: real.booking.movedInByStudentAt,
      complete: Boolean(real.booking.movedInByOwnerAt),
    }
    : stay.request?.moveIn
      ? { ...stay.request.moveIn, complete: Boolean(stay.request.moveIn.ownerConfirmedAt) }
      : undefined;

  /*
   * DEVELOPMENT ONLY — force both halves of the move-in.
   *
   * Two things gate a real check-in and both are correct: the owner has to go
   * first, and their own button does not unlock until the check-in DATE. That
   * makes everything downstream of moving in — and in particular the hotel
   * settlement becoming releasable, which is what the admin Monitor's Withdraw
   * button waits on — impossible to reach before the day arrives.
   *
   * Drawn only on a build that OPTED IN with `EXPO_PUBLIC_DEV_BYPASS=true`,
   * and it still 404s unless the SERVER has `DEV_ALLOW_FORCE_CHECKIN` on — so
   * the button says what to switch on rather than vanishing, the same shape as
   * the payment bypass on the confirmation screen.
   *
   * Not `usePreviewControls`: that is on in an internal preview APK, which
   * points at the production API like any other build, and this stamps a real
   * move-in — the thing a hotel settlement becoming releasable waits on.
   *
   * Delete this, `devForceCheckIn` and the route it calls once the flow no
   * longer needs walking through by hand.
   */
  const devBypassAllowed = useDevBypass();
  const [forcing, setForcing] = useState(false);
  /* Its own, since the move-in card no longer has an error line to borrow:
     nothing on the student's side of a move-in can fail any more. */
  const [forceError, setForceError] = useState<string | null>(null);

  const forceCheckIn = async () => {
    if (!realBookingId || forcing) return;
    setForcing(true);
    setForceError(null);
    try {
      await devForceCheckIn(realBookingId);
      /* Read back rather than assumed — the booking is the server's, and this
         has just changed both halves of it. */
      await real.refetch();
    } catch (error) {
      const failure = error as { status?: number; displayMessage?: string };
      setForceError(
        failure?.status === 404
          ? 'The server does not allow this. Set DEV_ALLOW_FORCE_CHECKIN="true" in Backend/.env '
            + '(NODE_ENV must not be production) and restart it.'
          : failure?.displayMessage ?? 'We could not force the check-in.',
      );
    } finally {
      setForcing(false);
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
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {/* Pass Card: Plain White Card with Highlighted OTP Tiles & Offer Banner */}
        {booking.status === 'CONFIRMED' && entryPin ? (
          <View style={styles.heroPassCard}>
            <VerificationCodeDisplay
              code={entryPin.replace(/\D/g, '')}
              bookingReference={entryPin}
              ownerName={booking.ownerName}
              validLabel={booking.codeValidLabel ?? 'Valid on your move-in day'}
            />
          </View>
        ) : null}

        {/* Section: Timeline Progress Card */}
        <View style={styles.sectionCard}>
          {/* The title shrinks and the chip does not: the chip is one short
              word and the heading is the line that can afford to give. They
              also hold a gap between them, so the two can never meet however
              long the status word or the font scale gets. */}
          <View style={styles.cardHeaderRow}>
            <View style={[styles.cardHeaderLeft, styles.flex]}>
              <View style={[styles.cardHeaderIconBadge, { backgroundColor: '#ECFDF5' }]}>
                <Icon name="clock" size={16} color="#059669" />
              </View>
              <Text variant="title3" style={styles.cardHeaderTitle} numberOfLines={1}>
                Where this booking is
              </Text>
            </View>
            <View style={styles.statusChip}>
              <View style={styles.statusDot} />
              <Text style={styles.statusChipText}>
                {booking.status === 'CONFIRMED'
                  ? 'Confirmed'
                  : booking.status === 'ACCEPTED'
                  ? 'Accepted'
                  : booking.status === 'REQUESTED'
                  ? 'Requested'
                  : booking.status}
              </Text>
            </View>
          </View>

          <BookingTimeline
            status={booking.status}
            steps={stamps}
            showPaid={chargesForVisit}
          />
        </View>

        {/* Section: Destination & Address Card */}
        {addressVisible(booking.status) && booking.address ? (
          <View style={styles.sectionCard}>
            <View style={styles.cardHeaderLeft}>
              <View style={[styles.cardHeaderIconBadge, { backgroundColor: '#EFF6FF' }]}>
                <Icon name="mapPin" size={16} color="#2563EB" />
              </View>
              <Text variant="title3" style={styles.cardHeaderTitle}>Where to go</Text>
            </View>

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

        {/* Section: Terms Summary Card */}
        <View style={styles.sectionCard}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.cardHeaderIconBadge, { backgroundColor: '#F8FAFC' }]}>
              <Icon name="verified" size={16} color="#64748B" />
            </View>
            <Text variant="title3" style={styles.cardHeaderTitle}>Your terms</Text>
          </View>

          <View style={styles.termsBody}>
            {/* The share type as the owner recorded it on the booking. */}
            <Term label="Sharing" value={booking.sharingLabel} />

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

            {real.booking && real.booking.totalAmount > 0 ? (
              <>
                <Term label="Total agreed with the owner" value={formatRupees(real.booking.totalAmount)} />
                <Term label="Paid to the owner so far" value={formatRupees(real.booking.paidAmount)} />
              </>
            ) : null}

            {chargesForVisit && visitPaid && visitPaidRupees > 0 ? (
              <Term
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

            {property.listing?.noticePeriodDays != null ? (
              <Term label="Notice period" value={`${property.listing.noticePeriodDays} days`} />
            ) : null}
          </View>

          <View style={styles.disclaimerBox}>
            <Text variant="caption" color="tertiary" style={{ lineHeight: 17 }}>
              Rent and deposit are settled directly with {booking.ownerName ?? 'the owner'} — Lampose
              does not hold them. Anything shown here is what we were told.
            </Text>
          </View>
        </View>

        {/* Section: Moving in */}
        {moveIn && !moveIn.complete ? (
          <View
            /* One edge, not two. The border used to go green once the owner
               had marked the student in, because that was the moment their
               button woke up; there is no button and no second state now, so
               the card is simply an instruction until it is a confirmation. */
            style={[styles.sectionCard, { borderColor: '#E2E8F0' }]}
          >
            {/* One instruction, and it is the only thing the student has to
                do: be there and read out the PIN. There is no button under
                this any more — nothing is waiting on them. */}
            <View style={{ gap: space[1] }}>
              <Text variant="bodyStrong">Moving in</Text>
              <Text variant="caption" color="secondary">
                Show your entry PIN to {booking.ownerName ?? 'the owner'} when you arrive. The
                moment they enter it, your stay starts — there is nothing to confirm here.
              </Text>
            </View>

            {devBypassAllowed ? (
              <>
                <Button
                  label={forcing ? 'Checking in…' : '🛠 DEV: force check-in (both sides)'}
                  onPress={() => { void forceCheckIn(); }}
                  variant="secondary"
                  disabled={forcing}
                  fullWidth
                />
                {forceError ? (
                  <Text variant="caption" style={{ color: colors.danger.ink }}>
                    {forceError}
                  </Text>
                ) : null}
                <Text variant="numMeta" color="tertiary" style={styles.centred}>
                  Development bypass — marks the owner and you as checked in
                </Text>
              </>
            ) : null}
          </View>
        ) : moveIn?.complete ? (
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: colors.success.tint,
                borderColor: colors.success.border,
              },
            ]}
          >
            <Text variant="bodyStrong" style={{ color: colors.success.ink }}>
              You have moved in
            </Text>
            <Text variant="caption" style={{ color: colors.success.ink }}>
              {booking.ownerName ?? 'The owner'} entered your code, so your stay has started.
              Enjoy the room.
            </Text>

            {/* The reward lives on its own screen rather than being repeated
                here. This card is read every time somebody opens a booking —
                a ₹100 offer restated on all of them stops being a thank-you
                and becomes an advert for hotels attached to the room they
                already live in. */}
            <Button
              label="See your move-in reward"
              variant="secondary"
              size="xs"
              onPress={() => router.push({
                pathname: '/moved-in/[id]',
                params: { id: String(id), property: booking.propertyName ?? '' },
              })}
            />
          </View>
        ) : null}

        {/* SLOT 2 — swaps by status. */}
        <ActionBar
          booking={booking}
          category={property.listing?.category}
          onPrimary={() => {
            if (booking.status === 'ACCEPTED' || booking.status === 'PAYMENT_PENDING') {
              /*
               * The confirmation screen, which is where the pay button lives.
               *
               * This was `/pay/lst-pg-0143` — a hardcoded FIXTURE listing id,
               * harmless only for as long as nothing reached it. It is
               * reachable now: an accepted-but-unpaid booking used to be
               * mapped to `CONFIRMED`, which offers no primary action at all,
               * and it correctly reads as `PAYMENT_PENDING` since
               * `fromRealBooking` started reading the request's payment. So a
               * student tapping "Pay to confirm" would have landed on a
               * stranger's fixture PG.
               *
               * `confirm/[id]` is keyed by the LISTING, and it is the only
               * screen that holds a real Razorpay order for this request.
               */
              if (propertyId) router.push(`/confirm/${propertyId}` as never);
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

        {/*
          A way off the screen when the bar above has nothing.

          On a confirmed bachelor, PG or co-living booking every action is
          withheld by design — from confirmation on it is a direct arrangement
          with the owner, and every button the bar used to offer named
          something Lampose cannot do. What it left behind was a page that
          ended on a paragraph: no footer, no action, only the back arrow in
          the corner. This is not a thirteenth action; it is the exit.

          "Done", and it goes HOME rather than to the Bookings list. This
          screen is the end of the booking flow, not a detour inside it —
          the student has read the code or confirmed they moved in, and the
          next thing they want is the app, not the list they came through.
          The strip above the tab bar carries anything still unfinished, so
          nothing is lost by leaving.
        */}
        {!hasActions(booking, property.listing?.category) ? (
          <Button
            label="Done"
            variant="secondary"
            onPress={() => router.replace('/home')}
            fullWidth
          />
        ) : null}

        {/* "Rate your stay" — additive, and independent of the fixture status
            above. Shown only once the REAL booking behind this one says the
            stay is complete and unreviewed; see `real` above. */}
        {canReview ? (
          <View
            style={{
              backgroundColor: colors.surfaceSunken,
              borderRadius: BOX_RADIUS,
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
  const depositMark = useDepositMark();
  return (
    <View style={styles.termRow}>
      <Text variant="caption" color="secondary" style={styles.termLabel}>
        {label}
      </Text>
      <Text
        variant="bodyStrong"
        style={refundable && depositMark ? [styles.termValue, depositMark] : styles.termValue}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
  heroPassCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BOX_RADIUS,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BOX_RADIUS,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
    gap: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    /* The one thing that guarantees the title and the status chip are never
       touching, whatever either of them says. */
    gap: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /* 14 rather than `title3`'s 15: a heading sharing its line with a status
     chip has less room than one that owns the line, and all three section
     headings move together so they stay one rank. */
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  cardHeaderIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    /* One short word. It keeps its size and the heading beside it shrinks. */
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  termsBody: {
    gap: 0,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  termLabel: {
    flex: 1,
    fontSize: 13,
  },
  termValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  disclaimerBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginTop: 4,
  },
  flex: { flex: 1 },
});
