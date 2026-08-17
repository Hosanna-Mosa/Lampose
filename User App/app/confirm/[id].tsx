import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ConfirmModal, Dialog, Icon, OtpInput, Text, TextField } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { OwnerStatusTrail, WaitLoader, type TrailStep } from '@/components/request';
import { errorStates } from '@/constants/copy';
import { useAuth } from '@/context/AuthContext';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useTheme } from '@/context/ThemeContext';
import { confirmationRewards } from '@/data/rewards';
import { useCountdown } from '@/hooks/useCountdown';
import { useListing, useVisitRequest } from '@/services';
import { isValidIndianMobile } from '@/types/auth';
import { SCREEN_WAIT_SECONDS } from '@/types/request';

/**
 * The request, and the owner deciding.
 *
 * This screen was a three-minute simulation. It started a timer on mount,
 * walked a trail of six invented stages — "Delivered to Ramesh", "Ramesh
 * opened it" — and offered a row of dev buttons to choose an ending, because
 * "the owner is not real, so the endings are unreachable". The owner is real
 * now. Every state below is a state the server reported.
 *
 * ## The four steps, and why the order is a safety property
 *
 *   POST /visit-requests            the form goes in and an SMS code goes to
 *                                   the STUDENT. The owner is told nothing.
 *   POST /visit-requests/:id/verify the code is checked, and only if it is
 *                                   right is the owner messaged on WhatsApp.
 *   GET  /visit-requests/:id        polled until the owner answers.
 *
 * The code step is not a formality and it is not this app's idea of security
 * theatre — it is what stops a button on a public listing from making a
 * stranger's phone ring under an invented name. It is why this screen has an
 * OTP block that the simulation never needed.
 *
 * ## The stages that were removed
 *
 * "Delivered", "opened it" and "checking availability" are gone. WhatsApp
 * tells the backend when a message is accepted for delivery and nothing else;
 * there is no read receipt, and nobody is checking a vacancy system because
 * there is not one. Those three rows were a progress bar with a narrative,
 * and the trail is shorter and true instead.
 *
 * ## The three-minute clock means something different now
 *
 * It used to run the request: at 0:00 the request was cancelled. The server
 * gives the owner twenty-four hours. So the bar now measures only how long
 * this screen holds the student's attention — when it runs out the request is
 * still open, the screen says so, and the pill keeps watching it. Telling
 * somebody their request had expired while an owner was still reading it
 * would be the worst lie on this screen.
 */

/** "5 Sep 2026" from a `YYYY-MM-DD` calendar day. */
function prettyDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${names[month - 1]} ${year}`;
}

/** Wall-clock stamps for the trail, from timestamps the server sent. */
function stamp(value: string | number | null | undefined): string | undefined {
  if (!value) return undefined;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  const { user } = useAuth();
  const { request: pending, start: startPill, settle: settlePill, clear: clearPill } =
    usePendingRequest();

  /* Keyed by listing, so a request survives the app being closed — see the
     hook. The website has always done this in localStorage; this screen was
     the one place the two diverged. */
  const visit = useVisitRequest(id);

  const [askingCancel, setAskingCancel] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [code, setCode] = useState('');

  /*
   * The contact details the server requires.
   *
   * It refuses a request without a name, a mobile it recognises as Indian,
   * and a deliverable email — the email is where the agreement goes, and it
   * is validated server-side rather than trusted. The account carries a name
   * and a number; it has never asked for an email, so this screen asks once
   * and hands it straight to the request rather than storing a second copy of
   * the student's identity.
   */
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [touchedDetails, setTouchedDetails] = useState(false);

  const digits = phone.replace(/\D/g, '').slice(-10);
  const detailsValid =
    name.trim().length > 0 && EMAIL_RE.test(email.trim()) && isValidIndianMobile(digits);

  /**
   * Could the account answer everything on its own, at the moment we arrived?
   *
   * Fixed at mount, and that is the whole point. The auto-send below has to
   * fire for a student the account can speak for and must NOT fire for one
   * who is filling the form in — watching `detailsValid` alone would send the
   * request the instant the last character of an email address was typed,
   * before they had read the button, let alone pressed it.
   */
  const [accountIsComplete] = useState(() => {
    const stored = (user?.phone ?? '').replace(/\D/g, '').slice(-10);
    return (
      Boolean(user?.name?.trim()) &&
      EMAIL_RE.test(user?.email?.trim() ?? '') &&
      isValidIndianMobile(stored)
    );
  });

  /** The stay, in the shape the server validates it in. */
  const intent = useMemo(() => {
    if (!stayType && !units && !joinDate) return null;
    return {
      /* The app's rate ids and the server's stay types are different
         vocabularies for the same two things. DAILY is a short stay and
         MONTHLY is a long one; there is no weekly rate on either side. */
      stayType: stayType === 'DAILY' ? ('short' as const) : stayType === 'MONTHLY' ? ('long' as const) : undefined,
      duration: units ? Number(units) : undefined,
      durationUnit: stayType === 'DAILY' ? ('days' as const) : stayType === 'MONTHLY' ? ('months' as const) : undefined,
      joiningDate: joinDate || undefined,
      flexibleJoin: flexibleJoin === '1',
    };
  }, [stayType, units, joinDate, flexibleJoin]);

  /*
   * One POST, ever, unless the student asks for another.
   *
   * A second one is a second SMS to them and — once verified — a second
   * WhatsApp to the owner about the same bed. The guard is a ref rather than
   * state so it cannot be reset by a re-render, and it is cleared only by the
   * retry button, which is a person deciding to send again.
   */
  const sent = useRef(false);

  const send = useRef<() => void>(() => {});
  send.current = () => {
    if (!listing || !detailsValid || sent.current) return;
    /*
     * Never over a request that already exists.
     *
     * Hydration reads the stored request back off the device, and it is
     * asynchronous — so a send fired before it finished would create a
     * second row for a listing this student has already asked about: another
     * SMS to them, and after verification another WhatsApp to the owner.
     * The server deduplicates a request that has already reached the owner,
     * but not one still waiting on its code.
     */
    if (visit.isHydrating || visit.phase !== 'idle') return;
    sent.current = true;
    visit.start({
      listingId: listing.id,
      name: name.trim(),
      phone: digits,
      email: email.trim(),
      sharing: sharingId ?? null,
      intent,
      /*
       * The tick from the listing screen, carried through rather than
       * asserted here.
       *
       * The server requires it on the full stay-intent path and refuses the
       * request without it. Sending `true` unconditionally would have this
       * screen record a consent nobody gave — which is precisely the record
       * that matters, since it is the moment a student's name and number are
       * handed to a stranger.
       */
      consentedTerms: consented === '1',
      consentWhatsApp: true,
    });
  };

  /*
   * Straight through when the account already answers everything.
   *
   * The design of this flow is "no form in between" — a student who has
   * chosen a bed should not meet a data-entry screen. They only do when the
   * server needs something the account has never collected, which today is
   * an email address.
   */
  useEffect(() => {
    if (visit.isHydrating) return;
    if (listing && accountIsComplete && !sent.current) send.current();
  }, [listing, accountIsComplete, visit.isHydrating]);

  /* The app-wide pill takes over the wait once the owner has actually been
     asked — before that there is nothing for it to watch, and a pill saying
     "waiting for Ramesh" while a code sits unentered would be wrong. */
  useEffect(() => {
    if (!listing) return;
    if (visit.phase !== 'waitingOwner') return;
    if (pending?.listingId === listing.id) return;
    startPill({
      listingId: listing.id,
      listingName: listing.name,
      owner: listing.ownerName ?? 'the owner',
      /* The server's own deadline for this request, so the pill expires when
         the request actually does. Without it the pill counted three minutes
         and then announced "cancelled — no answer" about a request the owner
         still had most of a day to reply to. */
      deadline: visit.request?.expiresAt ?? undefined,
      params: {
        ...(stayType ? { stayType } : null),
        ...(units ? { units } : null),
        ...(sharingId ? { sharingId } : null),
        ...(joinDate ? { joinDate } : null),
        ...(flexibleJoin ? { flexibleJoin } : null),
      },
    });
  }, [visit.phase, listing, pending?.listingId, startPill, stayType, units, sharingId, joinDate, flexibleJoin]);

  useEffect(() => {
    if (visit.phase === 'confirmed') settlePill('accepted');
    /* Declined and expired are different things and the pill says different
       sentences for them: one owner answered, the other never did. */
    if (visit.phase === 'declined') settlePill('declined');
    if (visit.phase === 'expired') settlePill('cancelled');
  }, [visit.phase, settlePill]);

  /*
   * How long this screen holds the student.
   *
   * Anchored to the moment the owner was asked, not to mount: the code step
   * comes first and its length is up to how fast an SMS arrives. Running out
   * does not settle anything — see the note at the top of the file.
   */
  const [heldFrom, setHeldFrom] = useState<string | null>(null);
  useEffect(() => {
    if (visit.phase === 'waitingOwner' && !heldFrom) {
      setHeldFrom(new Date(Date.now() + SCREEN_WAIT_SECONDS * 1000).toISOString());
    }
  }, [visit.phase, heldFrom]);

  const { secondsRemaining } = useCountdown(heldFrom ?? new Date().toISOString(), {
    paused: visit.phase !== 'waitingOwner',
  });

  /* The stored request is read back before anything is drawn, so a student
     returning to a wait never sees the form flash first. */
  if (listingLoading || visit.isHydrating) {
    return (
      <View style={[styles.flex, styles.centre, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (notFound || !listing) {
    return (
      <StateTemplate copy={errorStates.notFound()} onPrimary={() => router.replace('/home')} />
    );
  }

  const owner = listing.ownerName ?? 'the owner';

  const accepted = visit.phase === 'confirmed';
  const declined = visit.phase === 'declined';
  const ranOut = visit.phase === 'expired';
  const waiting = visit.phase === 'waitingOwner';
  const needsCode = visit.phase === 'awaitingCode' || visit.phase === 'verifying';
  const failed = visit.phase === 'failed';

  /**
   * The screen gave up holding them, but the request has not gone anywhere.
   *
   * Two separate clocks reach this: the three-minute bar running out, and the
   * poll giving up at fifteen minutes. Both mean "we have stopped watching
   * for you here", neither means the request ended, and the copy says so.
   */
  const stillOpen = waiting && (secondsRemaining <= 0 || visit.pollingStopped);

  /* ------------------------------------------------------------------ *
   * The trail — every row a thing the server actually reported
   * ------------------------------------------------------------------ */

  const sentNote = joinDate
    ? `Moving in ${prettyDate(joinDate)}${flexibleJoin === '1' ? ', give or take a day' : ''}`
    : 'Nothing has been charged.';

  /*
   * Every stamp is a timestamp the server recorded.
   *
   * Not `Date.now()`. This trail re-renders on every poll — four seconds
   * apart at first — so a row stamped from the clock would show a time that
   * crept forward all the way through the wait, which is worse than no time
   * at all: it reads as the event happening again and again.
   *
   * The WhatsApp row has no timestamp of its own to draw on, and it does not
   * borrow one. The owner is messaged inside the same request that verifies
   * the code, so `phoneVerifiedAt` is within a second of it — near enough to
   * be tempting and still a different event. The row states that it happened
   * and does not claim to know when.
   */
  const steps: readonly TrailStep[] = [
    {
      id: 'sent',
      label: 'Request prepared',
      note: sentNote,
      when: stamp(visit.request?.createdAt),
      state: visit.request ? 'done' : 'live',
    },
    {
      id: 'verified',
      label: 'Your number confirmed',
      // Says out loud why a code was asked for at all.
      note: 'We check it before anyone is contacted.',
      when: stamp(visit.request?.phoneVerifiedAt),
      state: visit.request?.phoneVerifiedAt ? 'done' : needsCode ? 'live' : 'pending',
    },
    {
      id: 'asked',
      label: `${owner} asked on WhatsApp`,
      note: 'They can see your dates and your name.',
      state: waiting || accepted || declined || ranOut ? 'done' : 'pending',
    },
    declined
      ? {
          id: 'closed',
          label: 'No availability',
          when: stamp(visit.request?.decidedAt),
          state: 'stopped' as const,
          note: 'Nothing was charged.',
        }
      : {
          id: 'answer',
          label: accepted
            ? 'Confirmed'
            : ranOut
              ? 'Closed — no answer'
              : `Waiting on ${owner}`,
          when: accepted ? stamp(visit.request?.decidedAt) : undefined,
          state: (accepted ? 'done' : ranOut ? 'stopped' : waiting ? 'live' : 'pending') as TrailStep['state'],
          note: accepted
            ? 'You have 2 hours to complete it.'
            : ranOut
              ? 'Nothing was charged.'
              : undefined,
        },
  ];

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
          // building on a given day, and a student who reads a full house as
          // a personal rejection stops sending requests.
          title: 'No availability right now',
          body: 'What you asked for is not free at the moment. Nothing was charged, and nothing is owed.',
        }
      : ranOut
        ? {
            tint: colors.warning.tint,
            ink: colors.warning.ink,
            title: 'Request closed',
            body: `${owner} did not answer, so the request has closed itself. Nothing was charged. You can send it again, or look elsewhere.`,
          }
        : stillOpen || visit.pollingStopped
          ? {
              tint: colors.info.tint,
              ink: colors.info.ink,
              title: 'Still with the owner',
              /* The honest version of running out of screen time — and, once
                 polling has given up at fifteen minutes, of the app having
                 stopped asking. Neither closes the request, and the alert
                 arrives either way, so the sentence is the same. */
              body: `${owner} has not answered yet. The request stays open for 24 hours — you can leave this screen and your alerts will tell you the moment they reply.`,
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

  return (
    <View style={styles.flex}>
      <StatusBar style="auto" />
      {/* No back arrow once a request is in flight: backing out has to mean
          something definite, so the only ways off are the buttons. */}
      <StandardHeader title="Owner confirmation" subtitle={listing.name} />

      <KeyboardAwareScrollViewCompat
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: space[4],
          paddingBottom: insets.bottom + space[6],
          gap: space[5],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          Step 0 — the details the server needs.

          Only shown when the account cannot supply them, which today is
          everybody, because the sign-in flow collects a name and a number and
          the request needs an email as well.
        */}
        {visit.phase === 'idle' && !accountIsComplete ? (
          <View style={{ gap: space[3] }}>
            <View style={{ gap: space[1] }}>
              <Text variant="title3">Where should we send your copy?</Text>
              <Text variant="caption" color="secondary">
                {owner} sees your name and your dates. Your email is for your agreement and
                receipts, and is not shared with them.
              </Text>
            </View>

            <TextField
              label="Your name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              error={touchedDetails && !name.trim() ? 'The owner needs a name to expect.' : undefined}
            />
            <TextField
              label="Mobile"
              value={phone}
              onChangeText={setPhone}
              prefix="+91"
              keyboardType="number-pad"
              maxLength={10}
              helper="We send a code here before anyone is contacted."
              error={
                touchedDetails && !isValidIndianMobile(digits)
                  ? 'Enter your 10-digit mobile number.'
                  : undefined
              }
            />
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              error={
                touchedDetails && !EMAIL_RE.test(email.trim())
                  ? 'Enter an email we can send the agreement to.'
                  : undefined
              }
            />

            <Button
              label="Send my request"
              onPress={() => {
                /* The errors appear on the first press, not while somebody is
                   still typing their address. */
                setTouchedDetails(true);
                send.current();
              }}
              disabled={visit.isBusy}
              fullWidth
            />
          </View>
        ) : null}

        {/* Step 1 — sending. `idle` is included so an auto-sending request
            shows this rather than a blank frame before the effect runs. */}
        {visit.phase === 'creating' || (visit.phase === 'idle' && accountIsComplete) ? (
          <View style={{ gap: space[3] }}>
            <WaitLoader label="Sending your request" secondsRemaining={0} totalSeconds={1} />
            <Text variant="caption" color="tertiary">
              Nothing reaches {owner} until your number is confirmed.
            </Text>
          </View>
        ) : null}

        {/*
          Step 2 — the code.

          This is the gate that makes the whole flow safe, so it says what it
          is for rather than just demanding six digits.
        */}
        {needsCode ? (
          <View style={{ gap: space[3] }}>
            <View style={{ gap: space[1] }}>
              <Text variant="title3">Confirm your number</Text>
              <Text variant="caption" color="secondary">
                We sent a code to {visit.phoneMasked ?? `+91 ${digits}`}. {owner} is contacted only
                once it comes back correct.
              </Text>
            </View>

            <OtpInput
              value={code}
              onChange={setCode}
              length={6}
              autoFocus
              state={visit.error && visit.error.code === 'OTP_WRONG' ? 'error' : 'idle'}
              errorMessage={
                visit.error?.code === 'OTP_WRONG'
                  ? visit.error.message
                  : visit.attemptsLeft !== null
                    ? `${visit.attemptsLeft} attempts left`
                    : undefined
              }
              onComplete={(value) => visit.verify(value)}
            />

            {/* The owner message failed after a correct code. The number is
                already proven, so this retries the message alone. */}
            {visit.canRetryOwner ? (
              <View style={{ gap: space[2] }}>
                <Text variant="caption" color="secondary">
                  {visit.error?.message}
                </Text>
                <Button
                  label="Try reaching the owner again"
                  onPress={() => visit.verify('')}
                  disabled={visit.isBusy}
                  fullWidth
                />
              </View>
            ) : (
              <Button
                label={visit.isBusy ? 'Checking…' : 'Confirm'}
                onPress={() => visit.verify(code)}
                disabled={visit.isBusy || code.length < 6}
                fullWidth
              />
            )}

            <Button
              label={visit.resendIn > 0 ? `Send another code in ${visit.resendIn}s` : 'Send another code'}
              variant="ghost"
              onPress={() => {
                setCode('');
                visit.resend();
              }}
              disabled={visit.resendIn > 0 || visit.isBusy}
              fullWidth
            />
          </View>
        ) : null}

        {/* Step 3 — the wait. The bar drains for three minutes and then stays
            at zero; it is not removed, because a bar that vanishes takes the
            explanation of what happened with it. */}
        {waiting || accepted || declined || ranOut ? (
          <WaitLoader
            label={waiting ? `Waiting for ${owner}` : `${owner} answered`}
            secondsRemaining={waiting ? Math.max(0, secondsRemaining) : accepted || declined ? SCREEN_WAIT_SECONDS : 0}
            totalSeconds={SCREEN_WAIT_SECONDS}
          />
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

        {/*
          A failure that stopped the request before it started.

          The server writes these, and they are better than anything invented
          here: "You have already requested a visit for this property today"
          and "This owner has no reachable number on file" are two completely
          different problems, and only one of them is worth retrying.
        */}
        {failed && visit.error ? (
          <View style={{ gap: space[3] }}>
            <View
              style={{
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
                {visit.error.displayMessage}
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

        {visit.request ? <OwnerStatusTrail steps={steps} /> : null}

        {/* What confirming earns. Read-only: nothing has been paid and the
            choosing happens at payment, against a real total. */}
        {!declined && !ranOut && !failed && visit.request && confirmationRewards.length ? (
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
            <View
              style={[styles.rewardDisc, { backgroundColor: colors.brand, borderRadius: radius.pill }]}
            >
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

        {declined || ranOut ? (
          <View style={{ gap: space[3] }}>
            {/*
              Asking again is offered after an expiry and NOT after a decline.

              The server holds one request per property per day, so a second
              one after the owner has said "nothing free" can only come back
              refused — a button whose single possible outcome is an error.
              An expiry is different: nobody answered, and the request is
              genuinely worth putting again. The website draws exactly this
              line, and this screen was offering neither.
            */}
            {ranOut ? (
              <Button
                label="Ask again"
                onPress={() => {
                  /* Both cleared, or the stored request would be restored on
                     the next render and the screen would show the old
                     expiry instead of starting over. */
                  visit.reset();
                  clearPill();
                  sent.current = false;
                  setCode('');
                }}
                fullWidth
              />
            ) : null}
            <Button
              label="Back to results"
              variant={ranOut ? 'secondary' : 'primary'}
              onPress={() => {
                visit.reset();
                clearPill();
                router.replace('/home');
              }}
              fullWidth
            />
          </View>
        ) : waiting || accepted ? (
          <View style={{ gap: space[3] }}>
            {/* Leaving is a real option once the screen has stopped holding
                them, and it is not the same act as withdrawing. */}
            {stillOpen ? (
              <Button
                label="Keep browsing while I wait"
                variant="secondary"
                onPress={() => router.replace('/home')}
                fullWidth
              />
            ) : (
              <Button
                label="Cancel request"
                variant="secondary"
                onPress={() => setAskingCancel(true)}
                fullWidth
              />
            )}
            <Button label="Confirm" onPress={goToBooking} disabled={!accepted} fullWidth />
            <Text variant="numMeta" color="tertiary" style={styles.centred}>
              Nothing is charged at any point
            </Text>
          </View>
        ) : null}
      </KeyboardAwareScrollViewCompat>

      <Dialog
        visible={rewardsOpen}
        onClose={() => setRewardsOpen(false)}
        title="What you get when this is confirmed"
        dismissLabel="Got it"
      >
        <View style={{ gap: space[4] }}>
          <View
            style={[styles.rewardDisc, { backgroundColor: colors.brand, borderRadius: radius.pill }]}
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

      {/*
        Withdrawing is local, and the modal now says so.

        There is no endpoint that cancels a visit request — the owner has
        already been messaged and nothing can un-send that. So this stops the
        app watching, and the sentence no longer implies the owner will be
        told to stop reading.
      */}
      <ConfirmModal
        visible={askingCancel}
        onClose={() => setAskingCancel(false)}
        title="Stop waiting for this?"
        body={`${owner} already has your request and may still reply. Nothing has been charged. We will stop showing you this wait, and you can request again later.`}
        confirmLabel="Stop waiting"
        onConfirm={() => {
          setAskingCancel(false);
          /* The stored copy goes too. Clearing only the pill would leave the
             request on the device, and reopening this listing would restore
             the wait somebody just chose to leave. */
          visit.reset();
          clearPill();
          router.replace('/home');
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
