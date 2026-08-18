import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ConfirmModal, Dialog, Icon, Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { OwnerStatusTrail, WaitLoader, type TrailStep } from '@/components/request';
import { errorStates } from '@/constants/copy';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useTheme } from '@/context/ThemeContext';
import { confirmationRewards } from '@/data/rewards';
import { useListing, useStayRequest } from '@/services';

/**
 * The request, and the owner deciding — in three minutes.
 *
 * ## What this screen used to be, twice over
 *
 * First a simulation: a timer on mount, six invented stages, and dev buttons
 * to pick an ending. Then the website's flow, ported: an SMS code, a WhatsApp
 * message to the owner, and a twenty-four-hour window drawn as a three-minute
 * bar that meant nothing.
 *
 * Both are gone. The student's number was proved at sign-in, so there is no
 * code to ask for. The owner has the Stay Partner app, so there is no
 * WhatsApp. And the three minutes are REAL now — the server sets `expiresAt`,
 * both apps render it, and nothing on a phone decides when it has passed.
 *
 * ## The one rule that shapes the whole file
 *
 * **The countdown reaching zero is not an answer.** It means "ask the server".
 * An owner who tapped Accept at 2:59.8 wins that race, and a screen that had
 * marked itself expired would be telling a student they missed out on a bed
 * they actually got. So every ending on this screen is a status the server
 * reported, and zero on the clock only triggers one more fetch.
 *
 * ## Declined and expired are not the same screen
 *
 * They are different facts and they call for different actions. An owner said
 * no — look elsewhere. Nobody answered — ask again, it costs nothing. And a
 * third case the website never had: the bed went to somebody else while this
 * student waited, which is nobody's rejection and says so.
 */

/** "5 Sep 2026" from a `YYYY-MM-DD` calendar day. */
function prettyDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${names[month - 1]} ${year}`;
}

/** Wall-clock stamps for the trail, from timestamps the server sent. */
function stamp(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export default function OwnerConfirmation() {
  const { colors, space, layout, radius, touch } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { id, stayType, units, sharingId, joinDate, flexibleJoin, consented } =
    useLocalSearchParams<{
      id: string;
      stayType?: string;
      units?: string;
      sharingId?: string;
      joinDate?: string;
      flexibleJoin?: string;
      consented?: string;
    }>();

  const { listing, isPending: listingLoading, notFound } = useListing(id);
  const { request: pending, start: startPill, settle: settlePill, clear: clearPill } =
    usePendingRequest();

  /* Keyed by listing, so a request survives the app being closed. Only the
     ID is stored — the status is always the server's. */
  const stay = useStayRequest(id);

  const [askingCancel, setAskingCancel] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);

  /** The stay, in the shape the server validates it in. */
  const intent = useMemo(() => {
    if (!stayType && !units && !joinDate) return null;
    return {
      /* The app's rate ids and the server's stay types are different
         vocabularies for the same two things. DAILY is a short stay and
         MONTHLY is a long one; there is no weekly rate on either side. */
      stayType: stayType === 'DAILY' ? ('short' as const)
        : stayType === 'MONTHLY' ? ('long' as const) : undefined,
      duration: units ? Number(units) : undefined,
      durationUnit: stayType === 'DAILY' ? ('days' as const)
        : stayType === 'MONTHLY' ? ('months' as const) : undefined,
      joiningDate: joinDate || undefined,
      flexibleJoin: flexibleJoin === '1',
    };
  }, [stayType, units, joinDate, flexibleJoin]);

  /*
   * One request, ever, unless the student asks for another.
   *
   * A ref rather than state so a re-render cannot reset it. Cleared only by
   * "Ask again", which is a person deciding to send a second one.
   */
  const sent = useRef(false);

  useEffect(() => {
    /*
     * Never over a request that already exists — checked three ways.
     *
     * Hydration reads the stored id back asynchronously, and a send fired
     * during that window creates a SECOND request for a listing this student
     * has already asked about. When the first one was ACCEPTED, the second is
     * refused with "every bed in this room type is taken" — the student's own
     * booking standing in their way, on a screen telling them their request
     * failed.
     *
     * The hook no longer reports `idle` while a stored request is loading, so
     * the first two conditions now suffice. `stay.request` is here as a third
     * because this is the failure worth being paranoid about: it costs an
     * owner a notification and tells a student something untrue.
     */
    if (stay.isHydrating || stay.phase !== 'idle' || stay.request) return;
    if (!listing || sent.current) return;

    sent.current = true;
    stay.send({
      listingId: listing.id,
      /* The bed they chose, exactly as the listing offered it. */
      sharing: sharingId ?? listing.sharingOptions?.[0]?.label ?? '',
      intent,
      /*
       * The tick from the listing screen, carried through rather than
       * asserted here. Sending `true` unconditionally would record a consent
       * nobody gave — and this is precisely the record that matters, since it
       * is the moment a student's name and number reach a stranger.
       */
      consentedTerms: consented === '1',
    });
    /* Narrow deps on purpose: `stay` is a fresh object every render, so
       depending on it would re-run this effect constantly. Only the three
       things the guard actually reads matter. */
  }, [listing, stay.isHydrating, stay.phase, stay.request, stay.send, intent, sharingId, consented]);

  /* The app-wide pill takes over the wait, so leaving this screen does not
     mean losing sight of the answer. */
  useEffect(() => {
    if (!listing || stay.phase !== 'waiting') return;
    if (pending?.listingId === listing.id) return;
    startPill({
      listingId: listing.id,
      listingName: listing.name,
      owner: listing.ownerName ?? 'the owner',
      /* The server's own deadline, so the pill expires exactly when the
         request does rather than counting its own three minutes. */
      deadline: stay.request?.expiresAt ?? undefined,
      params: {
        ...(stayType ? { stayType } : null),
        ...(units ? { units } : null),
        ...(sharingId ? { sharingId } : null),
        ...(joinDate ? { joinDate } : null),
        ...(flexibleJoin ? { flexibleJoin } : null),
      },
    });
  }, [stay.phase, stay.request?.expiresAt, listing, pending?.listingId, startPill,
    stayType, units, sharingId, joinDate, flexibleJoin]);

  useEffect(() => {
    if (stay.phase === 'confirmed') settlePill('accepted');
    /* Three different endings, three different pill sentences. Collapsing
       them would tell a student an owner declined when nobody did. */
    if (stay.phase === 'declined') settlePill('declined');
    if (stay.phase === 'expired') settlePill('cancelled');
    if (stay.phase === 'cancelled') clearPill();
  }, [stay.phase, settlePill, clearPill]);

  /* Read back before anything is drawn, so a student returning to a wait
     never sees the form flash first. */
  if (listingLoading || stay.isHydrating) {
    return (
      <View style={[styles.flex, styles.centre, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (notFound || !listing) {
    return <StateTemplate copy={errorStates.notFound()} onPrimary={() => router.replace('/home')} />;
  }

  const owner = listing.ownerName ?? 'the owner';

  const waiting = stay.phase === 'waiting';
  const sending = stay.phase === 'sending' || stay.phase === 'idle';
  const accepted = stay.phase === 'confirmed';
  const declined = stay.phase === 'declined';
  const ranOut = stay.phase === 'expired';
  const cancelled = stay.phase === 'cancelled';
  const failed = stay.phase === 'failed';

  /* Nobody rejected this student — the last bed went while they waited. A
     completely different sentence, and a different next action. */
  const bedTaken = declined && stay.request?.decisionReason === 'INVENTORY_TAKEN';

  /*
   * What the bar says, driven by what has actually happened.
   *
   * This is where the "keep them on the screen" work lives: a student who can
   * see the request moving through real stages has a reason to stay, and every
   * one of these sentences is backed by a timestamp the server wrote.
   */
  const waitingLabel = stay.request?.seenAt
    ? `${owner} is reading your request`
    : stay.request?.notifiedAt
      ? `${owner} has been notified`
      : `Reaching ${owner}`;

  const totalSeconds = stay.request?.expiresAt && stay.request?.createdAt
    ? Math.max(1, Math.round(
      (Date.parse(stay.request.expiresAt) - Date.parse(stay.request.createdAt)) / 1000,
    ))
    : 180;

  /* ------------------------------------------------------------------ *
   * The trail — every row a thing the server actually reported
   * ------------------------------------------------------------------ */

  const sentNote = joinDate
    ? `Moving in ${prettyDate(joinDate)}${flexibleJoin === '1' ? ', give or take a day' : ''}`
    : 'Nothing has been charged.';

  /*
   * Six rows, every one of them an event the server recorded.
   *
   * The first three happen before an owner answers; the last three only exist
   * once one has. Showing all six from the start is the point — a student
   * waiting can see what is still to come, which is a reason to stay on the
   * screen rather than a blank space below the fold.
   *
   * What is NOT here is anything inferred. The website's version of this
   * screen invented "Delivered" and "checking availability"; these are backed
   * by `createdAt`, `notifiedAt`, `seenAt`, `decidedAt`, `bookingId` and
   * `entryPinIssuedAt` respectively.
   */
  const answered = accepted || declined || ranOut || cancelled;

  const steps: readonly TrailStep[] = [
    {
      id: 'sent',
      label: 'Request sent',
      note: sentNote,
      when: stamp(stay.request?.createdAt),
      state: stay.request ? 'done' : 'live',
    },
    {
      id: 'notified',
      label: `${owner} was notified`,
      note: 'They can see your dates and your name.',
      when: stamp(stay.request?.notifiedAt),
      state: stay.request?.notifiedAt ? 'done' : stay.request ? 'live' : 'pending',
    },
    {
      id: 'seen',
      label: stay.request?.seenAt ? `${owner} opened your request` : `${owner} has not opened it yet`,
      note: stay.request?.seenAt
        ? 'They are looking at your dates now.'
        : 'We will show you the moment they do.',
      when: stamp(stay.request?.seenAt),
      /* Never `stopped`. An owner who has not looked yet has done nothing
         wrong, and a red row would read as a refusal that has not happened. */
      state: stay.request?.seenAt ? 'done' : waiting ? 'live' : 'pending',
    },
    /* Row four is the decision, and it is the one that ends badly when it
       ends badly — so the three failure shapes replace it rather than sitting
       underneath a row that still says "waiting". */
    declined
      ? {
        id: 'answer',
        label: bedTaken ? 'Taken by someone else' : 'No availability',
        when: stamp(stay.request?.decidedAt),
        state: 'stopped' as const,
        note: 'Nothing was charged.',
      }
      : cancelled
        ? {
          id: 'answer',
          label: 'You cancelled',
          when: stamp(stay.request?.cancelledAt),
          state: 'stopped' as const,
          note: 'Nothing was charged.',
        }
        : ranOut
          ? {
            id: 'answer',
            label: 'Closed — no answer',
            when: stamp(stay.request?.decidedAt),
            state: 'stopped' as const,
            note: 'Nothing was charged.',
          }
          : {
            id: 'answer',
            label: accepted ? `${owner} confirmed` : `Waiting on ${owner}`,
            when: stamp(stay.request?.decidedAt),
            state: (accepted ? 'done' : waiting ? 'live' : 'pending') as TrailStep['state'],
            note: accepted ? undefined : 'They usually answer within a minute or two.',
          },
    {
      id: 'held',
      label: accepted ? 'Your room is held' : 'Your room is held',
      note: accepted
        ? `${stay.request?.sharing?.label ?? 'Your room'} is off the market for you.`
        : 'The moment they say yes, the bed comes off their availability.',
      when: accepted ? stamp(stay.request?.decidedAt) : undefined,
      /* Pending rather than stopped on a failed request — nothing went wrong
         with this step, it simply never got its turn. */
      state: accepted && stay.request?.bookingId ? 'done' : answered ? 'pending' : 'pending',
    },
    {
      id: 'pin',
      label: stay.request?.entryPin ? `Your entry PIN · ${stay.request.entryPin}` : 'Your entry PIN',
      note: stay.request?.entryPin
        ? 'Read this out at the door. The owner has the same one.'
        : 'You and the owner get the same code to check you in.',
      when: stamp(stay.request?.entryPinIssuedAt),
      state: stay.request?.entryPin ? 'done' : 'pending',
    },
  ];

  const banner = accepted
    ? {
      tint: colors.success.tint,
      ink: colors.success.ink,
      title: `${owner} confirmed`,
      body: 'Your room is held. Nothing has been charged.',
    }
    : bedTaken
      ? {
        tint: colors.warning.tint,
        ink: colors.warning.ink,
        title: 'That room was just taken',
        /* The distinction the reason code exists for. Somebody was faster;
           this is not a judgement about the student, and telling them it was
           would be both untrue and the fastest way to stop them asking
           anywhere else. */
        body: `The last bed went while you were waiting. Nothing was charged — other rooms at ${listing.name} may still be free.`,
      }
      : declined
        ? {
          tint: colors.danger.tint,
          ink: colors.danger.ink,
          /* Not "they turned you down". Availability is a fact about a
             building on a given day. */
          title: 'No availability right now',
          body: 'What you asked for is not free at the moment. Nothing was charged, and nothing is owed.',
        }
        : ranOut
          ? {
            tint: colors.warning.tint,
            ink: colors.warning.ink,
            title: 'No answer in time',
            body: `${owner} did not reply, so the request closed itself. Nothing was charged — you can ask again.`,
          }
          : cancelled
            ? {
              tint: colors.info.tint,
              ink: colors.info.ink,
              title: 'Request cancelled',
              body: 'Nothing was charged. You can ask again whenever you like.',
            }
            : null;

  const goToBooking = () =>
    router.replace({
      pathname: '/booked/[id]',
      params: {
        id: listing.id,
        ...(stayType ? { stayType } : null),
        ...(units ? { units } : null),
        ...(sharingId ? { sharingId } : null),
        ...(joinDate ? { joinDate } : null),
        ...(flexibleJoin ? { flexibleJoin } : null),
      },
    } as never);

  const askAgain = () => {
    stay.reset();
    clearPill();
    sent.current = false;
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="auto" />
      {/* No back arrow while a request is in flight: backing out has to mean
          something definite, so the only ways off are the buttons. */}
      <StandardHeader title="Owner confirmation" subtitle={listing.name} />

      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: space[4],
          paddingBottom: insets.bottom + space[6],
          gap: space[5],
        }}
      >
        {/* Step 1 — sending. `idle` is included so an auto-sending request
            shows this rather than a blank frame before the effect runs. */}
        {sending ? (
          <View style={{ gap: space[3] }}>
            <WaitLoader label="Sending your request" secondsRemaining={0} totalSeconds={1} />
            <Text variant="caption" color="tertiary">
              {owner} is notified straight away.
            </Text>
          </View>
        ) : null}

        {/* Step 2 — the wait. The bar drains against the SERVER's deadline,
            not a number this screen invented. */}
        {/*
          The bar drains against the server's real deadline; the NUMBER is
          gone.

          A visible countdown turns a wait into a thing being lost — a student
          watches it fall and leaves. The bar carries the same information at
          a glance, without inviting anyone to count. Nothing behind it
          changed: the deadline is still the server's and still exact.
        */}
        {waiting || accepted || declined || ranOut || cancelled ? (
          <WaitLoader
            label={waiting ? waitingLabel : `${owner} answered`}
            secondsRemaining={waiting ? stay.secondsRemaining : accepted || declined ? totalSeconds : 0}
            totalSeconds={totalSeconds}
          />
        ) : null}

        {waiting ? (
          <Text variant="caption" color="secondary">
            {stay.secondsRemaining <= 0
              /* Zero on the clock is a question, not an answer. Saying
                 "expired" here would pre-empt the server, which may be about
                 to report that the owner accepted at the last second. */
              ? 'Checking with the owner…'
              : stay.request?.seenAt
                ? 'They have your request open. An answer usually comes straight after.'
                : stay.request?.notifiedAt
                  ? 'It is on their phone now. You can close the app — we will tell you the moment they answer.'
                  : 'Sending it to their phone…'}
          </Text>
        ) : null}

        {banner ? (
          <View style={{
            backgroundColor: banner.tint,
            borderRadius: radius.card,
            padding: space[4],
            gap: space[1],
          }}
          >
            <Text variant="bodyStrong" style={{ color: banner.ink }}>{banner.title}</Text>
            <Text variant="caption" style={{ color: banner.ink }}>{banner.body}</Text>
          </View>
        ) : null}

        {/*
          A failure that stopped the request before it started.

          The server's own words, which are better than anything invented
          here: "This owner is not on Lampose Stay Partner yet" and "Every bed
          in this room type is taken" are completely different problems, and
          only one of them is worth retrying.
        */}
        {failed && stay.error ? (
          <View style={{ gap: space[3] }}>
            <View style={{
              backgroundColor: colors.warning.tint,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[1],
            }}
            >
              <Text variant="bodyStrong" style={{ color: colors.warning.ink }}>
                Your request did not go through
              </Text>
              <Text variant="caption" style={{ color: colors.warning.ink }}>
                {stay.error.displayMessage}
              </Text>
            </View>
            <Button
              label="Back to the listing"
              variant="secondary"
              onPress={() => router.replace(`/listing/${listing.id}` as never)}
              fullWidth
            />
          </View>
        ) : null}

        {stay.request ? <OwnerStatusTrail steps={steps} /> : null}

        {/* What confirming earns. Read-only: nothing has been paid. */}
        {!declined && !ranOut && !cancelled && !failed && stay.request && confirmationRewards.length ? (
          <Pressable
            onPress={() => setRewardsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${confirmationRewards.length} offers unlock when this is confirmed. Opens a list.`}
            style={({ pressed }) => [
              styles.rewardStrip,
              {
                minHeight: touch.min,
                paddingHorizontal: space[4],
                paddingVertical: space[3],
                gap: space[3],
                borderRadius: radius.card,
                backgroundColor: colors.success.tint,
                borderColor: colors.success.border,
                borderWidth: StyleSheet.hairlineWidth,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <View style={[styles.rewardDisc, { backgroundColor: colors.brand, borderRadius: radius.pill }]}>
              <Icon name="offer" size={20} color={colors.onBrand} />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong" style={{ color: colors.success.ink }}>
                {confirmationRewards.length} offers on this booking
              </Text>
              <Text variant="caption" style={{ color: colors.success.ink }}>
                They come off the total when you pay
              </Text>
            </View>
            <Icon name="chevronRight" size={20} color={colors.success.ink} />
          </Pressable>
        ) : null}

        {/* ── The actions, one set per ending ─────────────────────────── */}

        {accepted ? (
          <View style={{ gap: space[3] }}>
            <Button label="Continue to booking" onPress={goToBooking} fullWidth />
            <Text variant="numMeta" color="tertiary" style={styles.centred}>
              Nothing is charged at any point
            </Text>
          </View>
        ) : waiting ? (
          <View style={{ gap: space[3] }}>
            {/* Offered only while the request is genuinely live — the hook
                decides, so a button that could only fail never appears. */}
            {stay.canWithdraw ? (
              <Button
                label="Withdraw request"
                variant="secondary"
                onPress={() => setAskingCancel(true)}
                fullWidth
              />
            ) : null}
            <Button
              label="Keep browsing while I wait"
              variant="ghost"
              onPress={() => router.replace('/home')}
              fullWidth
            />
            <Text variant="numMeta" color="tertiary" style={styles.centred}>
              Nothing is charged at any point
            </Text>
          </View>
        ) : ranOut || cancelled ? (
          <View style={{ gap: space[3] }}>
            {/* Asking again is offered here and NOT after a decline. Nobody
                said no — the owner did not answer, or the student changed
                their mind — so a second request is worth sending. After a
                decline it could only come back refused. */}
            <Button label="Ask again" onPress={askAgain} fullWidth />
            <Button
              label="Find another property"
              variant="secondary"
              onPress={() => { clearPill(); router.replace('/home'); }}
              fullWidth
            />
          </View>
        ) : declined ? (
          <View style={{ gap: space[3] }}>
            {/* The bed went to somebody else, so another room here may well
                be free — back to the listing rather than out of it. */}
            {bedTaken ? (
              <Button
                label="See other rooms here"
                onPress={() => { clearPill(); router.replace(`/listing/${listing.id}` as never); }}
                fullWidth
              />
            ) : null}
            <Button
              label="Find another property"
              variant={bedTaken ? 'secondary' : 'primary'}
              onPress={() => { clearPill(); router.replace('/home'); }}
              fullWidth
            />
          </View>
        ) : null}
      </ScrollView>

      <Dialog
        visible={rewardsOpen}
        onClose={() => setRewardsOpen(false)}
        title="What you get when this is confirmed"
        dismissLabel="Got it"
      >
        <View style={{ gap: space[4] }}>
          <View style={[styles.rewardDisc, { backgroundColor: colors.brand, borderRadius: radius.pill }]}>
            <Icon name="offer" size={20} color={colors.onBrand} />
          </View>
          {confirmationRewards.map((reward) => (
            <View key={reward.id} style={[styles.rewardRow, { gap: space[3] }]}>
              <Icon name="check" size={20} color={colors.brandInk} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">{reward.label}</Text>
                <Text variant="caption" color="tertiary">{reward.terms}</Text>
              </View>
            </View>
          ))}
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
          <Text variant="caption" color="tertiary">
            These are not codes to copy and nothing here expires while you wait. Whichever of them
            apply to your booking come off the total on the payment screen.
          </Text>
        </View>
      </Dialog>

      {/*
        Withdrawing is a real cancellation now.

        The website's version could only stop the app watching, because a
        WhatsApp message cannot be un-sent. This one tells the server, the
        owner's copy goes non-actionable, and they are notified — so the
        sentence can promise something it actually does.
      */}
      <ConfirmModal
        visible={askingCancel}
        onClose={() => setAskingCancel(false)}
        title="Withdraw this request?"
        body={`${owner} will be told you have cancelled, and the room goes back to whoever asks next. Nothing has been charged. You can send a new request afterwards.`}
        confirmLabel="Withdraw"
        onConfirm={async () => {
          setAskingCancel(false);
          await stay.withdraw();
        }}
        cancelLabel="Keep waiting"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  rewardStrip: { flexDirection: 'row', alignItems: 'center' },
  rewardDisc: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  /* The tick pins to the first line, because the label may wrap. */
  rewardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  centred: { textAlign: 'center' },
});
