import { useEffect } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  Screen,
  Text,
  Button,
  Card,
  Divider,
  DetailRow,
  EmptyState,
  IconButton,
  BookingStatusBadge,
  CountdownChip,
  type BookingStatus,
} from '@/components/ui';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { formatDateTime, formatINR } from '@/lib/format';
import type { BackendPartnerRequest } from '@/services/api/types';
import {
  formatCountdown,
  useAnswerRequest,
  useStayRequest,
} from '@/services/hooks/useStayRequests';

/**
 * One stay request, and the three minutes to answer it.
 *
 * ## What this replaced
 *
 * A screen driven by `lib/requests.ts` — a module-level array seeded at
 * import time, where Accept flipped a field nobody else could see and the
 * countdown ran against a number invented at app launch. It now reads
 * `GET /api/v2/partners/requests/:id` and answers through the real accept and
 * decline endpoints.
 *
 * ## The KYC block is gone, and that is the correct behaviour
 *
 * The old screen collected an address, an Aadhar number and a document scan
 * after accepting. That belongs to the WALK-IN path, not this one: a student
 * arriving through a request has already proved their own phone number in the
 * User App, and the backend records KYC only for `source: 'manual'` bookings
 * for exactly that reason. Asking for papers here would be collecting
 * identity documents the business has not decided it needs, which is the kind
 * of thing that is much easier not to start.
 *
 * ## Zero on the clock is a question, not an answer
 *
 * The countdown runs against the server's `expiresAt`, corrected for this
 * device's clock. Reaching zero does not mark anything expired — it triggers
 * one more fetch, because the server may be about to report that this very
 * owner accepted at 2:59.8. Every state below is one the server reported.
 */

const BADGE_FOR: Record<string, BookingStatus> = {
  pending_owner: 'pending',
  confirmed: 'confirmed',
  declined: 'declined',
  expired: 'expired',
  cancelled: 'cancelled',
};

/** "5 Sep 2026" from a `YYYY-MM-DD` calendar day. */
function prettyDate(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${names[m - 1]} ${y}`;
}

function stayLength(request: BackendPartnerRequest): string {
  const intent = request.intent;
  if (!intent?.duration || !intent?.durationUnit) return 'Not specified';
  const unit = intent.durationUnit === 'days' ? 'night' : 'month';
  return `${intent.duration} ${unit}${intent.duration === 1 ? '' : 's'}`;
}

/** What each ending means to the owner looking at it. */
function outcomeCopy(request: BackendPartnerRequest): { title: string; body: string } | null {
  switch (request.status) {
    case 'confirmed':
      return {
        title: 'You accepted this request',
        body: 'The student has been told and a customer record is open. The bed is off your availability.',
      };
    case 'cancelled':
      return {
        title: 'The student cancelled',
        body: 'They withdrew before you answered. Nothing was charged and the bed was never taken.',
      };
    case 'expired':
      return {
        title: 'This request ran out of time',
        body: 'Nobody answered within the window, so it closed itself. The student can send a new one.',
      };
    case 'declined':
      /* A decline this owner never made. Accepting somebody else for the last
         bed turned everybody still waiting on that room away in the same
         action — and a history screen that called that "you declined" would
         read as though they had rejected people they never looked at. */
      return request.decisionReason === 'INVENTORY_TAKEN'
        ? {
          title: 'Closed — the last bed went',
          body: 'You accepted another student for this room type, so this request was closed automatically.',
        }
        : {
          title: 'You declined this request',
          body: 'The student has been told. Nothing was charged.',
        };
    default:
      return null;
  }
}

export default function RequestDetailScreen() {
  const router = useRouter();
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { request, secondsRemaining, countdown, actionable, isPending, error } = useStayRequest(id);
  const answer = useAnswerRequest(id);

  /* The server's refusal, shown as the server worded it. "This request has
     expired" and "The student cancelled this request" are different things
     for an owner to know, and a generic failure would flatten both. */
  useEffect(() => {
    if (!answer.error) return;
    Alert.alert('Could not answer', answer.error.displayMessage);
  }, [answer.error]);

  if (isPending && !request) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <View style={styles.loading}>
          <ActivityIndicator color={c.accent} />
        </View>
      </Screen>
    );
  }

  if (!request) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <EmptyState
          icon="search"
          title="Request not found"
          body={error?.displayMessage ?? 'It may have been withdrawn by the student.'}
          actionLabel="Back to requests"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const outcome = outcomeCopy(request);
  const pending = request.status === 'pending_owner';

  const onAccept = () => {
    answer.accept.mutate(undefined, {
      onSuccess: (result) => {
        /* Accepting the last bed turns other students away. Saying so is the
           difference between an owner learning it here and learning it from
           a phone call. */
        if (result.autoDeclined > 0) {
          Alert.alert(
            'Accepted',
            `That was the last bed in this room, so ${result.autoDeclined} other `
            + `request${result.autoDeclined === 1 ? '' : 's'} closed automatically.`,
          );
        }
      },
    });
  };

  return (
    <Screen
      padX={22}
      background="bg"
      contentStyle={styles.stack}
      stickyHeader={(
        <View style={styles.headerRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          <BookingStatusBadge status={BADGE_FOR[request.status] ?? 'pending'} />
        </View>
      )}
      footer={pending ? (
        <View style={styles.footer}>
          <Button
            label="Decline"
            variant="secondary"
            /* Not disabled while accepting — an owner who changes their mind
               mid-tap should not be locked out. Both are guarded server-side
               and exactly one can win. */
            disabled={!actionable || answer.isBusy}
            onPress={() => router.push({ pathname: '/requests/reject', params: { id: request.id } })}
            style={styles.action}
          />
          <Button
            label={answer.accept.isPending ? 'Accepting…' : 'Accept'}
            /* `actionable` is the server's flag. A request that expired while
               this screen was open loses its buttons on the next poll rather
               than failing on tap. */
            disabled={!actionable || answer.isBusy}
            onPress={onAccept}
            style={styles.action}
          />
        </View>
      ) : undefined}
    >
      <Text variant="screenTitle">{request.customer?.name || 'A student'}</Text>

      {/* The clock, and only while one is running. */}
      {pending ? (
        <View style={styles.clockRow}>
          <CountdownChip
            /* Epoch ms from the server's deadline, corrected for this device.
               The chip colours itself from urgency, so a fast phone would
               otherwise turn it red a minute early. */
            expiresAt={Date.now() + secondsRemaining * 1000}
            size="md"
          />
          <Text variant="label" style={{ color: c.textCaption }}>
            {secondsRemaining > 0
              ? `${countdown} to answer`
              /* Running out is not a verdict. The next poll brings the
                 server's, which may be an acceptance this owner just made. */
              : 'Checking…'}
          </Text>
        </View>
      ) : null}

      {outcome ? (
        <Card>
          <Text variant="cardTitle">{outcome.title}</Text>
          <Text variant="body" style={{ color: c.textSecondary, marginTop: 4 }}>
            {outcome.body}
          </Text>
        </Card>
      ) : null}

      {/*
        The entry PIN, given its own card and set large.

        It is the one thing on this screen an owner will need to READ ALOUD,
        at a door, probably on a phone held at arm's length. Burying it in a
        detail row beside "Room type" would make the single operational fact
        here look like metadata.

        The student holds the same value — it is compared, not verified — so
        it is deliberately not masked or hidden behind a tap.
      */}
      {request.entryPin ? (
        <Card>
          <Text variant="label" style={{ color: c.textCaption }}>ENTRY PIN</Text>

          {/*
            The DIGITS large, the full code beneath — the same two things in
            the same order as the student's screen.

            They stand at a door comparing two phones, so the thing they
            compare has to look the same on both. The student's screen renders
            six digit tiles (nine will not fit a phone) with the `LV-` form
            underneath as the reference, so this mirrors it exactly rather
            than showing one combined string only one of them can see.
          */}
          <Text tabular style={[styles.pin, { color: c.textPrimary }]}>
            {request.entryPin.replace(/\D/g, '')}
          </Text>
          <Text tabular variant="label" style={{ color: c.textCaption }}>
            {request.entryPin}
          </Text>

          <Text variant="body" style={{ color: c.textSecondary, marginTop: 6 }}>
            {(request.customer?.name || 'The student')} sees the same digits. Check they match when
            they arrive.
          </Text>
        </Card>
      ) : null}

      <Card>
        <DetailRow label="Property" value={request.propertyName} />
        <Divider />
        <DetailRow label="Room type" value={request.sharing?.label ?? '—'} />
        <Divider />
        <DetailRow label="Moving in" value={prettyDate(request.intent?.joiningDate)} />
        <Divider />
        <DetailRow label="Length of stay" value={stayLength(request)} />
        {request.intent?.flexibleJoin ? (
          <>
            <Divider />
            {/* Worth its own row: it is often the thing that lets an owner say
                yes to a date they could not otherwise take. */}
            <DetailRow label="Flexible" value="A day or two either way" />
          </>
        ) : null}
        <Divider />
        <DetailRow
          label="Rent"
          value={request.sharing?.price ? `${formatINR(request.sharing.price)}/mo` : '—'}
          last
        />
      </Card>

      <Card>
        {/*
          The student's number, shown to the owner and nowhere else.

          It is the one piece of somebody else's personal data on this screen,
          and it is here because an owner who has accepted needs to be able to
          call the person arriving at their door.
        */}
        <DetailRow label="Phone" value={request.customer?.phone || '—'} />
        <Divider />
        <DetailRow label="Email" value={request.customer?.email || '—'} />
        <Divider />
        <DetailRow label="Requested" value={formatDateTime(new Date(request.createdAt))} last />
      </Card>

      {request.status === 'confirmed' ? (
        <Button
          label="See the booking"
          variant="secondary"
          /*
           * The BOOKING, not `/customers`.
           *
           * That screen asks the server for `?source=manual` — walk-ins the
           * owner typed in themselves — so a booking created by accepting a
           * request can never appear there. Sending an owner to a list that
           * is structurally incapable of showing the thing they just made
           * reads as the acceptance having done nothing.
           *
           * The Bookings tab renders it (an `upcoming` booking maps to
           * `confirmed` there), and the detail screen opens it directly when
           * the acceptance gave us an id.
           */
          onPress={() => (request.bookingId
            ? router.push({ pathname: '/booking/[id]', params: { id: request.bookingId } })
            : router.push('/bookings'))}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  /* Large and tabular: read out loud, at a door, from arm's length. */
  pin: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 38, letterSpacing: 1.5, marginVertical: 4 },
  headerRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: -10,
  },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
});
