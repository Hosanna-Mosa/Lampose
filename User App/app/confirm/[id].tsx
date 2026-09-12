import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ConfirmModal, InlineAlert, Text, TextField, useAlert } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { OwnerStatusTrail, WaitLoader, type TrailStep } from '@/components/request';
import { errorStates } from '@/constants/copy';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { ongoingQueryKey } from '@/hooks/useOngoing';
import { usePreviewControls } from '@/hooks/useAppEnv';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useListing, useStayCoupons, useStayRequest } from '@/services';
import { addAddress } from '@/services/api/addresses.api';
/* DEVELOPMENT ONLY — remove with the dev bypass button below. */
import { ApiError } from '@/services/api/client';
import { devMarkVisitPaid } from '@/services/api/stayRequests.api';

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
  const { mode, colors, space, layout, radius } = useTheme();
  const { confirm } = useAlert();
  /* Whether this build may draw developer controls at all — see the note on
     the dev button below. False on a production build, and it re-renders when
     the mode is switched. */
  const previewControls = usePreviewControls();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    id, stayType, units, sharingId, joinDate, flexibleJoin, consented,
    checkIn, checkOut, rateStructure, rateQuantity,
  } =
    useLocalSearchParams<{
      id: string;
      stayType?: string;
      units?: string;
      sharingId?: string;
      joinDate?: string;
      /* Hotels: two dates and a structure instead of a track and a length. */
      checkIn?: string;
      checkOut?: string;
      rateStructure?: string;
      rateQuantity?: string;
      flexibleJoin?: string;
      consented?: string;
    }>();

  const { listing, isPending: listingLoading, notFound, refetch: refetchListing } = useListing(id);
  const { request: pending, start: startPill, settle: settlePill, clear: clearPill } =
    usePendingRequest();
  const { completeProfile } = useAuth();
  const queryClient = useQueryClient();


  /* Keyed by listing, so a request survives the app being closed. Only the
     ID is stored — the status is always the server's. */
  const stay = useStayRequest(id);

  const [askingCancel, setAskingCancel] = useState(false);

  /* Manual pull-to-refresh state. Declared here, with the screen's other
     hooks, rather than beside `onRefresh` below — that sits past two early
     returns (loading, not-found), and a hook declared there runs on some
     renders and not others, which is the exact "rendered more hooks than
     during the previous render" crash. See the note on `devBusy` below for
     the same rule applied to the dev-only payment bypass. */
  const [manualRefreshing, setManualRefreshing] = useState(false);

  /* ── The profile a request needs, asked here rather than at sign-in ──────
     `stayRequest.service.js` refuses a nameless request with
     `PROFILE_INCOMPLETE` — the account proved a phone number, not a name,
     and this is the first moment a name has anywhere to go: an owner reads
     it off the request. The address line is not enforced server-side (a PG
     owner has no use for a guest's home address), but it is asked in the
     SAME form, once, because this is genuinely the first and only moment
     until now this app ever asked for either — collecting them together
     here is one interruption instead of two. Both save through calls that
     already existed (`completeProfile`, `addAddress`); nothing new was
     added to the backend for this. */
  const [profileName, setProfileName] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  /** The stay, in the shape the server validates it in. */
  const intent = useMemo(() => {
    /*
     * A hotel arrives with dates rather than a track and a length.
     *
     * Sent as its own fields, which the server resolves into the same intent a
     * short stay produces — so everything past `createStayRequest` reads one
     * shape. Checked first because a hotel carries no `stayType` and would
     * otherwise fall through as "no intent at all".
     */
    if (checkIn) {
      return {
        checkIn,
        checkOut: checkOut || undefined,
        rateStructure: (rateStructure as 'nightly' | 'monthly' | 'flexible') || undefined,
        rateQuantity: rateQuantity ? Number(rateQuantity) : undefined,
        flexibleJoin: flexibleJoin === '1',
      };
    }

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
  }, [stayType, units, joinDate, flexibleJoin, checkIn, checkOut, rateStructure, rateQuantity]);

  /*
   * The best reward available to spend, if any.
   *
   * `spendable` is the SERVER's verdict — active, unexpired, not held by
   * another booking — rather than a rule re-implemented here. See
   * `BackendStayCoupon`.
   */
  const { spendable } = useStayCoupons(true);
  const reward = spendable[0] ?? null;

  /* One shape, two callers: the auto-send effect below, and the "Save and
     send request" button on the profile form, once a PROFILE_INCOMPLETE
     failure is fixed. Kept as one `useMemo` so a retry can never drift from
     what the first attempt actually sent. */
  const sendPayload = useMemo(() => (listing ? {
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
    /*
     * The ₹100 move-in reward, applied without being asked for.
     *
     * ## Why there is no "apply coupon" control
     *
     * This screen sends on its own — there is no review step to hang a picker
     * off, and adding one would mean stopping an automatic flow to ask a
     * question with one sensible answer. A discount you have to remember to
     * apply is one most people do not, and the student already earned this by
     * moving into somewhere: making them opt in a second time is a second
     * chance to lose it.
     *
     * ## Hotels only
     *
     * Gated on the category here as well as on the server, where the coupon
     * cannot reach the ₹199 assisted-visit fee. Sending it on a PG request
     * would be harmless — it is simply never reserved — but it would also
     * mean a coupon briefly appearing to be in play on a booking it can never
     * discount, which is worse than not sending it.
     *
     * The id, never an amount: the server subtracts it from a total it has
     * just re-derived from the owner's own rates.
     */
    couponId: listing.category === 'HOTEL' ? (reward?.id ?? null) : null,
  } : null), [listing, sharingId, intent, consented, reward]);

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
    if (!sendPayload || sent.current) return;

    sent.current = true;
    stay.send(sendPayload).finally(() => {
      /* A new wait belongs in the strip immediately — and, just as
         importantly, has to start blocking a second booking before the
         student can walk back to the feed and try one. `finally`, because a
         REFUSED send is also worth re-reading: the reason is often that
         something else is already in flight. */
      queryClient.invalidateQueries({ queryKey: ongoingQueryKey });
    });
    /* Narrow deps on purpose: `stay` is a fresh object every render, so
       depending on it would re-run this effect constantly. Only the things
       the guard actually reads matter. */
  }, [sendPayload, stay.isHydrating, stay.phase, stay.request, stay.send]);

  /* The profile form's "Save and send request" — same payload, a fresh
     attempt. `sent.current` is left alone: it already guards against the
     EFFECT firing twice, and this is a person tapping a button, not a
     re-render. */
  const retryAfterProfile = useCallback(async () => {
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      setProfileError('Add your name to send the request.');
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    try {
      await completeProfile({ name: trimmedName });
      const trimmedAddress = profileAddress.trim();
      if (trimmedAddress) {
        /* Best-effort. A booking request should not fail because a saved
           address (which the server does not require for one) could not be
           written — the name above is the only hard requirement. */
        await addAddress({ kind: 'home', label: 'Home', line1: trimmedAddress }).catch(() => {});
      }
      if (sendPayload) await stay.send(sendPayload);
    } catch (caught) {
      setProfileError(
        caught instanceof ApiError ? caught.displayMessage : 'We could not save that. Please try again.',
      );
    } finally {
      setSavingProfile(false);
    }
  }, [profileName, profileAddress, completeProfile, sendPayload, stay]);

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

  /*
   * ── The ₹199 assisted visit, on the one tap that continues ──────────────
   *
   * Bachelor and co-live charge ₹199 for a confirmed visit — ₹100 for the
   * Lampose representative who accompanies it, ₹99 Lampose fee. Rather than
   * a separate panel to find, the payment sits on the button that was
   * already the next thing to press: pay, then the slot picker opens, and
   * the address arrives with the slot. A PG has no charge and goes straight
   * through, so this whole branch is invisible there.
   *
   * ## A WebView in the app, not a browser and not the native SDK
   *
   * Razorpay's React Native SDK needs a prebuild and a config plugin on both
   * platforms for one screen, so the checkout is a page the SERVER renders and
   * verifies — the app never touches a payment id or a signature.
   *
   * That page used to be handed to `WebBrowser.openAuthSessionAsync`. It is
   * meant to stay in-app, and on Android with no Chrome Custom Tabs provider it
   * quietly falls back to launching the browser APP instead: Lampose disappears
   * and a browser opens on the student's payment. Paying is the worst moment in
   * the product to leave the app.
   *
   * `pay/checkout.tsx` renders the same URL in a `WebView` inside this
   * navigator, where there is no fallback to fall back TO. What the server does
   * is unchanged.
   */
  const [paying, setPaying] = useState(false);

  /*
   * Whether a checkout was actually opened FROM this screen.
   *
   * The poll below exists for one moment: coming back from Razorpay, where a
   * webhook can land a second or two after the view closes. It used to run on
   * every focus, so simply arriving here — from the home strip, a deep link,
   * or the first mount — put the pay button into "Checking your payment..."
   * and disabled it for four and a half seconds, on a request nobody had paid
   * a rupee towards. It reads as though the payment went through, and it
   * blocks the one control that would have taken it.
   *
   * A ref, not state: it must survive the re-render the checkout screen's
   * focus change causes without itself causing one.
   */
  const wentToCheckout = useRef(false);

  const payThenContinue = useCallback(() => {
    if (!stay.request?.id) return;
    wentToCheckout.current = true;
    router.push({
      pathname: '/pay/checkout',
      params: { requestId: String(stay.request.id), returnTo: `/confirm/${String(id)}` },
    } as never);
  }, [stay.request?.id, router, id]);

  /*
   * DEVELOPMENT ONLY — mark the token paid without paying it.
   *
   * Not a payment option and deliberately not dressed as one: no money moves,
   * nothing is collected, and nothing is owed afterwards. It exists so the
   * screens behind the paywall can be worked on while Razorpay's checkout is
   * unavailable, and it is labelled loudly enough that nobody could mistake it
   * for something a real student should press.
   *
   * Drawn only when the SERVER says it is available
   * (`payment.devMarkPaidAllowed`, which is `DEV_ALLOW_MARK_PAID` and is
   * refused when NODE_ENV=production), so the whole branch disappears by
   * itself when the flag comes off — no app change needed.
   *
   * It sits HERE, with the other hooks, and not beside `tokenAmount` where the
   * copy it feeds lives: `tokenAmount` is declared past two early returns, so
   * three hooks next to it run on some renders and not others — which is
   * exactly the "rendered more hooks than during the previous render" crash.
   *
   * Delete this block, `devMarkVisitPaid`, its endpoint and the route when the
   * online checkout is working.
   */
  const [devBusy, setDevBusy] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  const devSkipPayment = useCallback(async () => {
    if (!stay.request?.id || devBusy) return;

    /* The app's own dialog — see `AppAlert`. Warning-toned rather than
       destructive: nothing is lost by doing this, it simply is not a real
       payment, and the copy is what says so. */
    const ok = await confirm({
      title: 'Mark payment as done?',
      message: 'Development bypass — no payment is taken and nothing is owed. The visit will '
        + 'behave as though the ₹199 had been paid so the rest of the flow can be tested.',
      confirmLabel: 'Mark as paid',
      cancelLabel: 'Cancel',
      tone: 'warning',
    });
    if (!ok) return;

    setDevBusy(true);
    setDevError(null);
    try {
      await devMarkVisitPaid(String(stay.request!.id));
      /*
       * The server's answer, read back.
       *
       * Nothing here navigates. `payment.status` flipping to `paid` is what
       * the effect above is watching, and it routes to the slot picker or
       * straight to the booking depending on whether a slot has been chosen —
       * the same two destinations a real payment lands on. Pushing a screen
       * from here would be a second, divergent copy of that decision.
       */
      await stay.refresh();
    } catch (err) {
      /*
       * The route 404s when the flag is off, which is the likeliest failure
       * by far now that the button is drawn without waiting for the server to
       * offer it. `displayMessage` on a 404 is generic, so this says the one
       * thing that actually unblocks it.
       */
      const notEnabled = err instanceof ApiError && (err.status === 404 || err.status === 403);
      setDevError(
        notEnabled
          ? 'The server does not allow this. Set DEV_ALLOW_MARK_PAID="true" in Backend/.env '
            + '(NODE_ENV must not be production) and restart it.'
          : err instanceof ApiError
            ? err.displayMessage
            : 'We could not mark it paid. Please try again.',
      );
    } finally {
      setDevBusy(false);
    }
  }, [stay, devBusy, confirm]);


  /*
   * Coming back from checkout is not an answer either way.
   *
   * Backing out without paying and paying successfully look identical from
   * here — Razorpay's webhook can land a second or two after the view closes.
   * So the SERVER is asked, a few times, on the way back in. Telling somebody
   * who just paid that they have not is the worse mistake of the two.
   *
   * On focus rather than after an `await`, because the checkout is now a
   * screen rather than a call that returns: this fires whichever way the
   * student left it — the redirect, the header's back, or the OS gesture.
   *
   * Gated on having gone there in the first place. See `wentToCheckout`.
   */
  useFocusEffect(
    useCallback(() => {
      if (!stay.request?.payment?.required) return;
      if (stay.request.payment.status === 'paid') return;
      /* Only on the way BACK from a checkout. Arriving here any other way
         means nothing was paid and there is nothing to wait for — see
         `wentToCheckout`. Cleared immediately so a second visit that did not
         go through the checkout does not inherit this one's poll. */
      if (!wentToCheckout.current) return;
      wentToCheckout.current = false;

      let live = true;
      setPaying(true);
      (async () => {
        for (let attempt = 0; attempt < 5 && live; attempt += 1) {
          // eslint-disable-next-line no-await-in-loop
          await stay.refresh();
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
        if (live) setPaying(false);
      })();

      return () => {
        live = false;
        setPaying(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stay.request?.payment?.required, stay.request?.payment?.status, stay.refresh]),
  );

  /*
   * The server decides this, never the browser.
   *
   * Navigation is done through the router directly rather than by calling
   * `goToBooking`, which is declared further down: this hook has to sit above
   * the screen's early returns, and reaching forward to a `const` that has not
   * been evaluated yet would be a temporal-dead-zone crash on the first paid
   * render.
   *
   * Where it goes depends on whether the visit has its SLOT yet. Paying is
   * no longer the last step — the ₹199 buys a visit that still needs a day
   * and a time, so a paid request without one goes to the picker, and only a
   * scheduled (or team-handled) one goes through to the booking.
   */
  useEffect(() => {
    if (paying) return;
    if (stay.request?.payment?.status !== 'paid') return;
    if (stay.phase !== 'confirmed') return;

    const passthrough = {
      id: String(id),
      ...(stayType ? { stayType } : null),
      ...(units ? { units } : null),
      ...(sharingId ? { sharingId } : null),
      ...(joinDate ? { joinDate } : null),
      ...(flexibleJoin ? { flexibleJoin } : null),
    };

    /*
     * Where a settled payment goes, and it depends on what it bought.
     *
     * An assisted VISIT buys a viewing, so the next thing is a day and a
     * time: the slot picker, and the address is released with the slot.
     *
     * A stay BOOKING buys the stay. The guest chose their dates before the
     * owner ever saw the request, nobody is being sent to meet them, and the
     * server leaves `lamposeVisit.status` at `none` for exactly this reason —
     * so there is nothing to schedule and the booking is finished. Sending a
     * hotel guest to a slot picker would ask them to arrange a viewing of a
     * room they have already paid for.
     */
    const visitStatus = stay.request?.lamposeVisit?.status;
    const buysAVisit = (stay.request?.payment?.purpose ?? 'assisted_visit') === 'assisted_visit';

    if (stay.request?.payment?.required && buysAVisit
      && visitStatus !== 'scheduled' && visitStatus !== 'manual') {
      router.replace({
        pathname: '/visit/slot',
        params: { requestId: String(stay.request.id), ...passthrough },
      } as never);
      return;
    }

    router.replace({ pathname: '/booked/[id]', params: passthrough } as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paying, stay.request?.payment?.status, stay.request?.payment?.purpose,
    stay.request?.lamposeVisit?.status, stay.phase]);

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
  const tokenDue = Boolean(
    stay.request?.payment?.required && stay.request.payment.status !== 'paid',
  );
  const tokenAmount = (stay.request?.payment?.amountPaise ?? 0) / 100;
  /*
   * Which of the two payments this is.
   *
   * A visit fee and a room bill are the same subdocument and completely
   * different sentences: one is a charge for somebody's afternoon, the other
   * is the price of the stay. Every string below branches on this rather than
   * on the category, so a request keeps the wording it was created with.
   */
  const isStayBooking = (stay.request?.payment?.purpose ?? 'assisted_visit') === 'stay_booking';

  /**
   * How the stay total was arrived at — "3 nights · ₹1,200 a night".
   *
   * Read off the SERVER's resolved intent, never recomputed here. The figure
   * on the button is the one being charged, and a breakdown this screen
   * multiplied out itself could disagree with it — which, on a payment
   * screen, is the one disagreement nobody forgives.
   *
   * Null when the intent carries no quantity, which is every non-hotel
   * category. The caption falls back to a plain sentence rather than printing
   * a half-built line.
   */
  const stayBreakdown = (() => {
    const intent = stay.request?.intent;
    if (!intent?.rateQuantity || !intent?.rateAmount) return null;

    const unit = intent.rateQuantityUnit ?? 'nights';
    /* "1 night", not "1 nights". The server's unit is always plural. */
    const counted = `${intent.rateQuantity} ${
      intent.rateQuantity === 1 ? unit.replace(/s$/, '') : unit
    }`;
    const per = unit === 'nights' ? 'a night' : unit === 'months' ? 'a month' : 'an hour';

    return `${counted} · ₹${intent.rateAmount.toLocaleString('en-IN')} ${per}`;
  })();

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
    /* The last row differs by category. A paid visit has NO entry PIN — a
       Lampose representative is at the door, so there is nothing to match —
       and promising one would leave this row "pending" forever. Its slot in
       the trail is the visit schedule instead. */
    /* A stay booking's last row is the PAYMENT, because that is the last thing
       that has to happen. It has no slot and no entry PIN to wait for. */
    stay.request?.payment?.required && isStayBooking
      ? {
        id: 'paid',
        label: stay.request?.payment?.status === 'paid'
          ? 'Booking paid'
          : `Pay ₹${tokenAmount.toLocaleString('en-IN')} to confirm`,
        note: stay.request?.payment?.status === 'paid'
          ? 'Your dates are booked. The address is on your booking.'
          : 'Your dates are held until this is paid.',
        when: stamp(stay.request?.payment?.paidAt),
        state: (stay.request?.payment?.status === 'paid' ? 'done' : 'pending') as TrailStep['state'],
      }
      : stay.request?.payment?.required
      ? {
        id: 'slot',
        label: stay.request?.lamposeVisit?.status === 'scheduled'
          ? `Visit scheduled · ${stay.request.lamposeVisit.date} at ${stay.request.lamposeVisit.time}`
          : 'Your visit slot',
        note: stay.request?.lamposeVisit?.status === 'scheduled'
          ? 'A Lampose representative will meet you there.'
          : 'Pay, then pick a day and time. The address arrives with your slot.',
        when: stamp(stay.request?.lamposeVisit?.scheduledAt),
        state: (stay.request?.lamposeVisit?.status === 'scheduled' ? 'done' : 'pending') as TrailStep['state'],
      }
      : {
        id: 'pin',
        label: stay.request?.entryPin ? `Your entry PIN · ${stay.request.entryPin}` : 'Your entry PIN',
        note: stay.request?.entryPin
          ? 'Read this out at the door. The owner has the same one.'
          : 'You and the owner get the same code to check you in.',
        when: stamp(stay.request?.entryPinIssuedAt),
        state: (stay.request?.entryPin ? 'done' : 'pending') as TrailStep['state'],
      },
  ];

  /* Said before the sheet opens, not by it. A student who picked a layout and
     waited for an owner should not meet the price for the first time as a
     payment request. */
  const banner = accepted
    ? {
      tint: colors.success.tint,
      ink: colors.success.ink,
      title: `${owner} confirmed`,
      body: tokenDue
        ? (isStayBooking
          /* A hotel: the money IS the booking, and the dates are already
             chosen. Saying "nothing has been charged" here would be true for
             one more tap and misleading about what the tap does. */
          ? `Your room is held. Pay ₹${tokenAmount.toLocaleString('en-IN')} to confirm the booking — `
            + 'your dates are already set, and the address arrives the moment it clears.'
          : `Your room is held. Nothing has been charged. Book your assisted visit for ₹${tokenAmount} `
            + '— a Lampose representative accompanies you, and you pick the day and time right '
            + 'after paying.')
        : 'Your room is held. Nothing has been charged.',
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
             building on a given day — and, crucially, about ONE ROOM TYPE on
             that day. The old copy ended there, which read as a verdict on the
             whole property; the last sentence is what makes the button below
             ("See other rooms here") make sense. */
          title: 'No availability right now',
          body: 'What you asked for is not free at the moment. Nothing was charged, and nothing is '
            + 'owed — other rooms here may still be free, and you can ask again.',
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



  /*
   * The countdown already polls the server every three seconds while
   * waiting — see `useStayRequest`. A manual pull is still worth offering as
   * a nudge, and it is harmless on the terminal states too, where the poll
   * has stopped. `stay.refresh()` is a no-op with nothing to refresh before a
   * request id exists.
   */
  const onRefresh = async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([refetchListing(), stay.refresh()]);
    } finally {
      setManualRefreshing(false);
    }
  };

  const askAgain = () => {
    stay.reset();
    clearPill();
    sent.current = false;
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg, paddingBottom: insets.bottom }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {/*
        A way back.

        This screen had no back arrow, on the reasoning that "backing out has
        to mean something definite, so the only ways off are the buttons".
        That held while a floating pill followed the request around the app —
        leaving was safe because the request came with you. The pill is gone,
        and without it a student who opened this screen had exactly one way
        off it per state, several of which sit below the fold on a short
        phone. The OS back gesture did nothing.

        Backing out does not cancel anything, and it should not: the request
        lives on the server, it is listed in Alerts the moment the owner
        answers, and "Withdraw request" is still the only thing that ends it.
        So this is navigation, not a decision — which is why it is a plain
        arrow and not a prompt.

        `canGoBack()` because this screen is reached by `push` from the
        listing but by `replace` from the slot picker and from a push
        notification; home is the honest destination when there is nothing
        underneath.
      */}
      <StandardHeader
        title="Owner confirmation"
        subtitle={listing.name}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      />

      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: space[4],
          paddingBottom: space[8],
          gap: space[5],
        }}
        refreshControl={
          <RefreshControl refreshing={manualRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
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

          `PROFILE_INCOMPLETE` is the one exception. It is not really a
          failure — it is the server saying "I need one more thing before I
          can send this" — so instead of a dead end it gets the one thing
          that actually resolves it: a name (owners read it off the
          request), and, since this is genuinely the first moment this app
          ever asks, an address alongside it. Saved once, fetched on every
          later sign-in, never asked again.
        */}
        {failed && stay.error?.code === 'PROFILE_INCOMPLETE' ? (
          <View style={{ gap: space[3] }}>
            <View style={{
              backgroundColor: colors.surface,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[4],
            }}
            >
              <View style={{ gap: space[1] }}>
                <Text variant="bodyStrong">One more thing before we send this</Text>
                <Text variant="caption" color="secondary">
                  {listing?.ownerName ?? 'The owner'} sees this on your request. Saved to your account —
                  you will not be asked again.
                </Text>
              </View>

              <TextField
                label="Your name"
                value={profileName}
                onChangeText={setProfileName}
                placeholder="Anjali Reddy"
                autoCapitalize="words"
                textContentType="name"
                helper="As on the ID you'll show at move-in."
              />
              <TextField
                label="Your address"
                optional
                value={profileAddress}
                onChangeText={setProfileAddress}
                placeholder="House no., street, area, city"
                autoCapitalize="sentences"
                helper="For your records — not sent to the owner."
              />

              {profileError ? <InlineAlert tone="error" title="Not saved" body={profileError} /> : null}

              <Button
                label="Save and send request"
                loadingLabel="Sending"
                loading={savingProfile}
                disabled={savingProfile || profileName.trim().length === 0}
                onPress={retryAfterProfile}
                fullWidth
              />
            </View>
          </View>
        ) : null}

        {failed && stay.error && stay.error.code !== 'PROFILE_INCOMPLETE' ? (
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

        {/*
          The "N offers on this booking" strip stood here, above the actions,
          with a sheet behind it listing what confirming supposedly earned.

          It is gone, and the reason is what was behind it rather than where it
          sat. `confirmationRewards` was placeholder content — its own file said
          so — and every line of it was a commercial promise this app had no way
          to keep: nothing applies an offer, the payment screen does not read
          them, and the amounts came off no total anywhere. A student waiting on
          an owner was being shown three discounts that did not exist, on the
          screen where they are deciding whether to go through with it.
        */}

        {/* ── The actions, one set per ending ─────────────────────────── */}

        {accepted ? (
          <View style={{ gap: space[3] }}>
            {/* One button, two jobs. The label names the money before the
                sheet opens — a tap that expects a screen and gets a payment
                request is a tap nobody meant to make. */}
            <Button
              label={tokenDue
                ? (paying
                  ? 'Checking your payment...'
                  : isStayBooking
                    /* Names the total, and says what it buys. "Pay ₹3,600 and
                       continue" reads as a step in a longer flow; this is the
                       last one. */
                    ? `Pay ₹${tokenAmount.toLocaleString('en-IN')} and book`
                    : `Pay ₹${tokenAmount} and continue`)
                : 'Continue to booking'}
              onPress={tokenDue ? payThenContinue : goToBooking}
              disabled={paying}
              fullWidth
            />
            {/*
              DEVELOPMENT ONLY — see `devSkipPayment`.

              Two gates, and they do different jobs.

              The BUILD gate (`previewControls`) decides whether the button is
              drawn. It used to be the server's `devMarkPaidAllowed` alone,
              which meant that on a server without `DEV_ALLOW_MARK_PAID` the
              button was simply absent — with nothing on screen to say why, or
              that it existed at all. A developer looking for it concluded it
              had been removed.

              The SERVER gate is still the one that decides whether it WORKS,
              and it has to be: a client that could settle a payment by asking
              nicely is the whole thing `foodPayment.confirmPayment` exists to
              prevent. `env.js` refuses the flag outright under
              NODE_ENV=production.

              So on a dev build with the flag off, the button is visible and
              says what to switch on — which is the useful state, and the one
              that used to be invisible. On a production build neither gate is
              open and none of this renders.
            */}
            {tokenDue && previewControls ? (
              <>
                {/*
                  NOT disabled by `paying`, unlike the real pay button above.

                  `paying` means "a checkout may have just settled, ask the
                  server a few times" — the focus effect sets it for about four
                  and a half seconds every time this screen is opened on an
                  unpaid request, whether or not anybody has been to a
                  checkout. Gating this on it meant that on arriving at the
                  accepted state the dev button was greyed out for the first
                  few seconds: you tapped it, nothing happened, and it looked
                  broken.

                  There is nothing to protect against. The bypass settles the
                  request server-side, and the poll that is in flight reads the
                  same row and sees the same answer. `devBusy` still stops a
                  double tap.
                */}
                <Button
                  label={devBusy ? 'Marking as paid…' : '🛠 DEV: mark payment as done'}
                  onPress={() => { void devSkipPayment(); }}
                  variant="secondary"
                  disabled={devBusy}
                  fullWidth
                />
                <Text variant="numMeta" color="tertiary" style={styles.centred}>
                  {stay.request?.payment?.devMarkPaidAllowed
                    ? 'Development bypass — no payment is taken'
                    : 'Development bypass — needs DEV_ALLOW_MARK_PAID=true on the server'}
                </Text>
              </>
            ) : null}
            {devError ? (
              <Text variant="numMeta" color="danger" style={styles.centred}>
                {devError}
              </Text>
            ) : null}
            {/* The caption under the button must not contradict the button.
                With a payment due, it explains the figure instead. */}
            <Text variant="numMeta" color="tertiary" style={styles.centred}>
              {!tokenDue
                ? 'Nothing is charged at any point'
                : isStayBooking
                  /* The stay, broken down the way it was priced — the same
                     figures the listing quoted, so the total is checkable
                     rather than asserted. */
                  ? stayBreakdown ?? 'The full amount for your stay'
                  : '₹100 Lampose representative · ₹99 Lampose fee'}
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
            {/*
              Back to the listing, on EVERY decline — not just when the bed went.
              This used to be shown only for `INVENTORY_TAKEN`, on the reasoning
              that a request the owner actually declined "could only come back
              refused". That is not what a decline is.

              An owner answers one request, for one room TYPE, on one day. They
              are not rejecting the person, and the server agrees: the
              "one live request per listing" gate in `createStayRequest` refuses
              only a request that is still PENDING or already CONFIRMED — a
              declined one blocks nothing, so a second request is accepted
              normally.

              The case that made this obvious: a student asked for a 1 BHK, was
              declined, and was sent back to the home feed — while that same
              property had eight 2 BHKs and twenty-four 3 BHKs free, and had
              stopped offering 1 BHK at all. The one room they could not have
              was the one they asked for, and the app pushed them off the
              property entirely.

              Back to the LISTING rather than re-sending: they should pick from
              what is actually available now, not repeat the request that was
              just turned down.
            */}
            <Button
              label="See other rooms here"
              onPress={() => { clearPill(); router.replace(`/listing/${listing.id}` as never); }}
              fullWidth
            />
            <Button
              label="Find another property"
              variant="secondary"
              onPress={() => { clearPill(); router.replace('/home'); }}
              fullWidth
            />
          </View>
        ) : null}
      </ScrollView>

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
          /* Withdrawing is the one way a student ENDS a wait themselves, and
             it is what unblocks starting another booking. The strip and the
             listing screen's guard both read one query — dropping it here is
             what makes "cancel this, then book the other place" work on the
             next tap rather than fifteen seconds later. */
          queryClient.invalidateQueries({ queryKey: ongoingQueryKey });
        }}
        cancelLabel="Keep waiting"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
});
