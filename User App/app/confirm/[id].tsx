import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ConfirmModal, Dialog, Icon, Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { OwnerStatusTrail, WaitLoader, type TrailStep } from '@/components/request';
import { errorStates } from '@/constants/copy';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useTheme } from '@/context/ThemeContext';
import { findListing } from '@/data/listings';
import { confirmationRewards } from '@/data/rewards';
import { useCountdown } from '@/hooks/useCountdown';
import { SCREEN_WAIT_SECONDS, type RequestOutcome } from '@/types/request';

/**
 * Screen one of two: the owner deciding.
 *
 * Everything that used to sit between the listing and the booking — a
 * three-step request form, a waiting screen, three payment screens — collapses
 * to this and the screen after it.
 *
 * ## What this screen is for
 *
 * A wait is the part of a product where trust is either built or lost, and the
 * only material available is honesty about what is happening. So: a line that
 * drains, a trail that says which of four things has happened, and a name. No
 * spinner, no "processing", no invented progress.
 *
 * ## What is deliberately NOT here
 *
 * Similar listings. Showing someone alternatives the moment they commit to a
 * place implies we expect them to be rejected, which is the exact anxiety this
 * screen exists to absorb.
 *
 * ## None of the three endings is red
 *
 * Declined is the owner's decision, running out is nobody's fault, and nothing
 * has been charged at any point. The only red on this screen is the cross on a
 * declined pinpoint.
 *
 * ## Two clocks, not one
 *
 * The bar counts `SCREEN_WAIT_SECONDS` (three minutes). The request itself
 * lives for `OWNER_WINDOW_MINUTES`. At 0:00 the screen gives up holding the
 * student, not the request — see the constant's note.
 */

/**
 * The stages of the wait, and how far into it each one begins.
 *
 * Six rather than four. The point of keeping someone on this screen is that
 * there is something to watch: a trail that has moved twice since they last
 * looked is a trail worth looking at, and four steps over three minutes leaves
 * two and a half of those minutes with nothing happening.
 *
 * These are stages of a real process, not filler — a request is delivered, it
 * is opened, availability is checked against it, and then a person decides.
 * Inventing a stage that does not exist would be the same lie as a fake
 * progress bar, only slower.
 *
 * `at` is seconds from the request being sent. In production these arrive from
 * the server as they actually happen; the schedule is what the screen falls
 * back to so the trail is never frozen on a stage the server has not confirmed
 * yet.
 */
type Stage = { id: string; label: (owner: string) => string; note?: string; at: number };

const STAGES: readonly Stage[] = [
  { id: 'sent', label: () => 'Request sent', at: 0 },
  { id: 'reaching', label: (o) => `Reaching ${o}`, note: 'Push and SMS.', at: 0 },
  { id: 'delivered', label: (o) => `Delivered to ${o}`, note: 'It is on their phone.', at: 14 },
  {
    id: 'opened',
    label: (o) => `${o} opened it`,
    // The moment a student wonders what a stranger can now see about them.
    note: 'They can see your dates, not your number.',
    at: 38,
  },
  { id: 'checking', label: () => 'Checking availability', note: 'Against what is free right now.', at: 72 },
  { id: 'deciding', label: (o) => `${o} is deciding`, at: 115 },
];

/** "5 Sep 2026" from a `YYYY-MM-DD` calendar day. */
function prettyDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${names[month - 1]} ${year}`;
}

/** Wall-clock stamps for the trail. The server supplies these in production. */
function stamp(atMs: number): string {
  return new Date(atMs).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function OwnerConfirmation() {
  const { colors, space, layout, radius, touch } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { id, stayType, units, sharingId, joinDate, flexibleJoin } = useLocalSearchParams<{
    id: string;
    stayType?: string;
    units?: string;
    sharingId?: string;
    joinDate?: string;
    flexibleJoin?: string;
  }>();

  const listing = useMemo(() => (id ? findListing(id) : undefined), [id]);

  const { request, start, settle: settleShared, clear } = usePendingRequest();

  const [outcome, setOutcome] = useState<RequestOutcome>('waiting');
  const [askingCancel, setAskingCancel] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  /** When the request was sent, and when it was answered. Wall clock, once. */
  const [sentMs] = useState(() => Date.now());
  const [answeredMs, setAnsweredMs] = useState<number | null>(null);

  /*
   * Every ending goes through here, so none of them can forget its timestamp —
   * and so the pill following the student around the app cannot disagree with
   * the screen about what happened.
   */
  const settle = (next: RequestOutcome) => {
    setOutcome(next);
    setAnsweredMs(next === 'waiting' ? null : Date.now());
    if (next === 'accepted') settleShared('accepted');
    if (next === 'rejected' || next === 'expired') settleShared('cancelled');
  };

  /*
   * The deadline is an absolute timestamp, fixed once on mount.
   *
   * A duration would restart every time this component re-rendered, which it
   * does on every tick — the wait would never end. `useCountdown` also applies
   * a server-clock offset to a timestamp, which is what stops a phone that is
   * ten minutes fast from telling a student their window closed early.
   */
  /*
   * The deadline belongs to the request, not to this mount.
   *
   * Coming back to the screen from the pill must resume the same clock, not
   * start a fresh three minutes — so the provider's deadline wins whenever
   * there is one, and this screen only invents one for a request it is
   * starting.
   */
  const [ownDeadline] = useState(
    () => new Date(Date.now() + SCREEN_WAIT_SECONDS * 1000).toISOString(),
  );
  const deadline = request?.listingId === id ? request.deadline : ownDeadline;

  const { secondsRemaining } = useCountdown(deadline, {
    // The bar is paused the moment the wait is over one way or the other. A
    // clock still running under an answered request is a clock that means
    // nothing.
    paused: outcome !== 'waiting',
    onExpire: () => settle('expired'),
  });

  /*
   * Hand the request to the app.
   *
   * From here the pill owns the wait: leaving this screen no longer ends
   * anything, and the countdown that cancels it runs in the provider whether
   * or not this component is mounted.
   */
  useEffect(() => {
    if (!listing) return;
    if (request?.listingId === listing.id) return;
    start({
      listingId: listing.id,
      listingName: listing.name,
      owner: listing.ownerName ?? 'the owner',
      deadline: ownDeadline,
      params: {
        ...(stayType ? { stayType } : null),
        ...(units ? { units } : null),
        ...(sharingId ? { sharingId } : null),
        ...(joinDate ? { joinDate } : null),
        ...(flexibleJoin ? { flexibleJoin } : null),
      },
    });
  }, [listing, request?.listingId, start, ownDeadline, stayType, units, sharingId, joinDate, flexibleJoin]);

  /* Returning to a request the pill already settled must not replay the wait. */
  useEffect(() => {
    if (request?.status === 'accepted' && outcome === 'waiting') setOutcome('accepted');
    if (request?.status === 'cancelled' && outcome === 'waiting') setOutcome('expired');
  }, [request?.status, outcome]);

  if (!listing) {
    return (
      <StateTemplate copy={errorStates.notFound()} onPrimary={() => router.replace('/home')} />
    );
  }

  const owner = listing.ownerName ?? 'the owner';

  const accepted = outcome === 'accepted';
  const declined = outcome === 'rejected';
  const ranOut = outcome === 'expired';
  const waiting = outcome === 'waiting';

  /*
   * How far down the schedule the wait has got.
   *
   * Derived from the clock rather than held in state: one source of truth, and
   * a screen that is re-entered mid-wait lands on the right stage instead of
   * starting the story again. Once answered, every stage is behind us.
   */
  const sentNote = joinDate
    ? `Moving in ${prettyDate(joinDate)}${flexibleJoin === '1' ? ', give or take a day' : ''}`
    : 'Nothing has been charged.';

  const elapsed = SCREEN_WAIT_SECONDS - secondsRemaining;
  const liveIndex = waiting
    ? STAGES.reduce((found, stage, index) => (stage.at <= elapsed ? index : found), 0)
    : STAGES.length - 1;

  /*
   * The trail: the six stages, then whatever ended it.
   *
   * Built as data rather than four hand-written blocks, so the endings cannot
   * drift apart — the difference between them is the last row and nothing else.
   */
  const steps: readonly TrailStep[] = [
    ...STAGES.map((stage, index) => ({
      id: stage.id,
      label: stage.label(owner),
      // The first stage carries the move-in date. It is the one fact the owner
      // is being asked to agree to that the student cannot see anywhere else on
      // this screen, now that the stay details have come off it.
      note: stage.id === 'sent' ? sentNote : stage.note,
      when: index <= liveIndex ? stamp(sentMs + stage.at * 1000) : undefined,
      state: (waiting && index === liveIndex ? 'live' : 'done') as TrailStep['state'],
    })),
    declined
      ? {
          id: 'closed',
          label: 'No availability',
          when: answeredMs ? stamp(answeredMs) : undefined,
          state: 'stopped' as const,
          note: 'Nothing was charged.',
        }
      : {
          id: 'answer',
          label: accepted ? 'Confirmed' : ranOut ? 'Cancelled — no answer' : 'Waiting on the answer',
          when: accepted && answeredMs ? stamp(answeredMs) : undefined,
          state: (accepted ? 'done' : ranOut ? 'stopped' : 'pending') as TrailStep['state'],
          note: accepted
            ? 'You have 2 hours to complete it.'
            : ranOut
              ? 'Nothing was charged.'
              : undefined,
        },
  ];

  /* One tinted block, only once there is something to say. */
  const banner = accepted
    ? {
        tint: colors.success.tint,
        ink: colors.success.ink,
        title: `${owner} confirmed`,
        body: 'You have 2 hours to complete it. Nothing has been charged yet.',
      }
    : declined
      ? {
          tint: colors.danger.tint,
          ink: colors.danger.ink,
          // Not "they turned you down". Availability is a fact about the
          // building on a given day, and a student who reads a full house as a
          // personal rejection is a student who stops sending requests.
          title: 'No availability right now',
          body: 'What you asked for is not free at the moment. Nothing was charged, and nothing is owed.',
        }
      : ranOut
        ? {
            tint: colors.warning.tint,
            ink: colors.warning.ink,
            title: 'Request cancelled',
            // Amber, not red, and the reason is named as a fact about a clock
            // rather than a failure by anybody. Nobody did anything wrong here.
            body: `${owner} did not answer in time, so the request has closed itself. Nothing was charged. You can send it again, or look elsewhere.`,
          }
        : null;

  /*
   * Straight to the booking. There is no payment step in this flow — the
   * category is free while it is being seeded — so the owner accepting and the
   * student confirming is the whole of it.
   *
   * The choices pass straight through. This screen deliberately does not show
   * them — it asks one question and shows one process — so it has nothing
   * resolved to hand on, and the booking screen reads the ids itself.
   */
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

  return (
    <View style={styles.flex}>
      <StatusBar style="auto" />
      {/*
        No back arrow.
        A request is in flight and the owner is reading it. Backing out of the
        screen has to mean something definite, so the only ways off it are the
        two buttons — both of which say what they do.
      */}
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
        {/* The line drains for the whole three minutes and then stays at zero.
            It is not removed once answered — a bar that vanishes takes the
            explanation of what just happened with it. */}
        <WaitLoader
          label={waiting || ranOut ? `Waiting for ${owner}` : `${owner} answered`}
          secondsRemaining={waiting ? secondsRemaining : accepted || declined ? SCREEN_WAIT_SECONDS : 0}
          totalSeconds={SCREEN_WAIT_SECONDS}
        />

        {waiting ? (
          <Text variant="caption" color="tertiary">
            {owner} usually answers in about a minute.
          </Text>
        ) : null}

        {banner ? (
          <View
            style={{
              backgroundColor: banner.tint,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[1],
            }}
          >
            <Text variant="bodyStrong" style={{ color: banner.ink }}>
              {banner.title}
            </Text>
            <Text variant="caption" style={{ color: banner.ink }}>
              {banner.body}
            </Text>
          </View>
        ) : null}

        <OwnerStatusTrail steps={steps} />

        {/*
          What confirming earns — a mark, a count, and a way in.

          It was a line of text. The client's note is the right one: somebody
          who has not read the words should still know this row is about money
          coming off. So the row now leads with the offer glyph in a filled
          disc, and the count is a numeral rather than a word — "3" and a tag
          are legible in the quarter-second a glance actually lasts, where
          "3 offers unlock when this is confirmed" is not.

          The words stay underneath. An icon-only row would be a guess for
          anyone who has not met the glyph before, and this audience meets it
          exactly once.

          Still a popup rather than an accordion, and still a fixed height in
          every state, because the block under it belongs to advertising and
          must not move.
        */}
        {!declined && !ranOut && confirmationRewards.length ? (
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
            {/* The disc is filled brand, not tinted: against a tinted strip a
                tinted disc would disappear, and the mark is the one thing on
                this row that has to survive being glanced at. */}
            <View
              style={[
                styles.rewardDisc,
                { backgroundColor: colors.brand, borderRadius: radius.pill },
              ]}
            >
              <Icon name="offer" size={20} color={colors.onBrand} />
            </View>

            <View style={styles.flex}>
              {/* The numeral leads. A count is a fact you can take in without
                  reading a sentence, which is the entire point of this row. */}
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

        {/* Cancel above, Confirm below in thumb reach. Cancel is a ghost, not a
            danger button — withdrawing is an ordinary thing to do and does not
            deserve a warning colour. */}
        {declined || ranOut ? (
          // Both endings are over. One way out, and it is forward.
          <Button
            label="Back to results"
            onPress={() => {
              // The outcome has been read here, so the pill has nothing left
              // to tell them about it.
              clear();
              router.replace('/home');
            }}
            fullWidth
          />
        ) : (
          <View style={{ gap: space[3] }}>
            <Button
              label="Cancel request"
              variant="secondary"
              onPress={() => setAskingCancel(true)}
              fullWidth
            />
            <Button
              label="Confirm"
              onPress={goToBooking}
              // Dead for the whole wait. There is nothing to confirm until the
              // owner has answered, and a live button here would be confirming
              // something nobody has offered.
              disabled={!accepted}
              fullWidth
            />
            <Text variant="numMeta" color="tertiary" style={styles.centred}>
              Nothing is charged at any point
            </Text>
          </View>
        )}

        {/* Dev only: the owner is not real, so the endings are unreachable. */}
        {__DEV__ ? (
          <View style={{ gap: space[2], paddingTop: space[4] }}>
            <Text variant="numMeta" color="tertiary">
              outcome — preview only
            </Text>
            <View style={[styles.wrap, { gap: space[2] }]}>
              {(['waiting', 'accepted', 'rejected', 'expired'] as const).map((value) => (
                <Button
                  key={value}
                  label={value}
                  size="sm"
                  variant={outcome === value ? 'primary' : 'secondary'}
                  onPress={() => settle(value)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* One tap withdrawing a request the owner is actively reading is too
          easy to do by accident, so it asks — and the question names what is
          happening on the other end. */}
      {/*
        The offers, in a centred dialog rather than a sheet.

        A sheet is for a control — it slides from the thumb's edge and expects
        to be reopened. This is a self-contained thing to read with nothing to
        pick, so it interrupts in the middle of the screen and then gets out of
        the way, leaving the page behind exactly where it was.

        Read-only on purpose. The student has not paid anything and cannot yet
        choose how to; taking a decision here — before the owner has even
        answered — would mean possibly taking it back at the worst moment there
        is to take anything back. The choosing happens at payment, against a
        real total.

        Every row carries its condition. An offer whose terms live somewhere
        else is a trap, and this audience has met that trap before.
      */}
      <Dialog
        visible={rewardsOpen}
        onClose={() => setRewardsOpen(false)}
        title="What you get when this is confirmed"
        dismissLabel="Got it"
      >
        <View style={{ gap: space[4] }}>
          {/* The same mark that opened it, so the dialog is visibly the strip's
              own content rather than a panel that happened to appear. */}
          <View
            style={[
              styles.rewardDisc,
              { backgroundColor: colors.brand, borderRadius: radius.pill },
            ]}
          >
            <Icon name="offer" size={20} color={colors.onBrand} />
          </View>

          {confirmationRewards.map((reward) => (
            <View key={reward.id} style={[styles.rewardRow, { gap: space[3] }]}>
              <Icon name="check" size={20} color={colors.brandInk} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">{reward.label}</Text>
                <Text variant="caption" color="tertiary">
                  {reward.terms}
                </Text>
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

      <ConfirmModal
        visible={askingCancel}
        onClose={() => setAskingCancel(false)}
        title="Withdraw your request?"
        body={`${owner} is looking at it right now. Nothing has been charged, and you can request again later — but it may be taken by then.`}
        confirmLabel="Withdraw"
        onConfirm={() => {
          setAskingCancel(false);
          // Withdrawn means gone, not cancelled-and-still-on-screen: the
          // student made this one happen, so nothing needs to report it back.
          clear();
          router.replace('/home');
        }}
        cancelLabel="Keep waiting"
      />

    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rewardStrip: { flexDirection: 'row', alignItems: 'center' },
  rewardDisc: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  /* The tick pins to the first line, because the label may wrap. */
  rewardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  centred: { textAlign: 'center' },
});
