import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import {
  BottomSheet, Button, Checkbox, Icon, InlineAlert, RentDisplay, Text, TextField, useAlert,
  type IconName,
} from '@/components/ui';
import {
  PhotoHeader,
  PhotoHero,
  StateTemplate,
  StickyCtaBar,
  usePhotoHeroHeight,
  usePhotoHeaderStatusBarStyle,
} from '@/components/shell';
import {
  AmenityGrid,
  GenderBadge,
  HeroCarousel,
  MealPlanCard,
  PhotoGallery,
  ListingCard,
  HotelStaySelector,
  type HotelIntent,
  SharingTypeSelector,
  StayIntentSelector,
  stayTotals,
  stayIntentComplete,
  isFutureDay,
  type StayIntent,
  defaultSharingSelection,
  defaultHotelIntent,
  defaultStayIntent,
  type PhotoGroup,
} from '@/components/discovery';
import { errorStates } from '@/constants/copy';
import { useAppState } from '@/context/AppStateContext';
import { useAuth } from '@/context/AuthContext';
import { useOngoing } from '@/hooks/useOngoing';
import { useTheme } from '@/context/ThemeContext';
import { useListing, useListingReviews, useListings, useSaved } from '@/services';
import { addAddress } from '@/services/api/addresses.api';
import { ApiError } from '@/services/api/client';
import { availabilityLabel, isGone } from '@/types/listing';
import { actions } from '@/constants/actions';

/**
 * Listing detail.
 *
 * This is where the deposit leads. It came off the feed card so the feed could
 * be browsable, and the trade was explicit: the moment a student is actually
 * considering a place, the number that decides whether they can take it has to
 * be impossible to miss. So it sits directly under the rent, before the
 * amenities, before the photos of the room — not in a costs section further
 * down where a scroll decides whether it gets read.
 *
 * The screen re-orders itself by category the way the original design did:
 * a PG leads with food and gate timing, a bachelor room with the deposit and
 * independence, a dormitory with tonight's beds. Sections that do not apply are
 * absent rather than greyed.
 */

export default function ListingDetail() {
  const { colors, space, layout, mode, radius } = useTheme();
  const isDark = mode === 'dark';
  /* The same height PhotoHero measures for this device, so the pager's pages
     fill the slot exactly rather than being sized from a constant that is
     wrong on a short screen. */
  const heroHeight = usePhotoHeroHeight();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locality } = useAppState();
  const { user, completeProfile } = useAuth();
  const { confirm } = useAlert();
  /* One booking at a time — the same rule the server enforces and the home
     strip draws. See `useOngoing`. */
  const { blocking } = useOngoing();

  const { listing, isPending, error, notFound, refetch, isFetching } = useListing(id);
  /* Same query key `GuestReviews` reads below, so this is not a second
     request — React Query dedupes on the key and both call sites share the
     one cache entry. Held here too so the pull-to-refresh gesture on the
     outer scroll view can refresh the reviews alongside the listing. */
  const { refetch: refetchReviews, isFetching: reviewsFetching } = useListingReviews(id);
  const { isSaved, toggleSaved } = useSaved();
  const saved = listing ? isSaved(listing.id) : false;

  /* ── The name and address a request needs, asked before it is sent ───────
     There is no separate account-creation step any more — signing in is a
     phone number and a code, nothing else — so the first time this screen
     is what asks for a name at all. `stayRequest.service.js` refuses a
     nameless request with `PROFILE_INCOMPLETE`; this sheet is what stops
     that refusal from ever being what a student sees. It opens on the tap
     that would otherwise send the request, asks once, and the button below
     it does not navigate until it closes with something saved.

     Address is asked here too, though nothing server-side requires it — this
     is the one moment before now this app has ever asked either question, so
     collecting both together is one interruption instead of two. Saved
     through the same calls the reactive fallback on `confirm/[id].tsx` uses
     (`completeProfile`, `addAddress`) — that screen's own form stays in
     place as a safety net, for a request sent some way other than this
     button ever finds one still missing. */
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  /*
   * Nothing is pre-selected on the first render any more.
   *
   * This used to initialise from `listing?.sharingOptions`, which worked when
   * the listing was a synchronous lookup in a fixture array. It is a fetch
   * now: the first render has no listing at all, so a lazy initialiser would
   * settle on `null` and never run again. The effect below picks the default
   * once the response lands, and only when the student has not already
   * chosen — a selection must never be moved under somebody mid-decision.
   */
  const [sharing, setSharing] = useState<string | null>(null);


  /*
   * Neighbours, fetched only for a listing that has filled.
   *
   * Enabled off the listing's own availability so the query never runs for
   * the common case — a live listing has no dead end to rescue, and this
   * screen should not pull a second list on every open. Answered from the
   * feed's cache whenever the student arrived from a feed of the same
   * category.
   */
  const isFilled = Boolean(listing && isGone(listing.availability));
  const { listings: neighbours } = useListings({
    category: listing?.category ?? null,
    city: locality?.city ?? null,
    enabled: isFilled,
  });
  /**
   * PG and hostel price by stay length, so the listing asks how long rather
   * than which bed. Defaults to the monthly rate — this is a monthly-rental
   * product and the short rates are the exception, not the headline.
   */
  const [intent, setIntent] = useState<StayIntent>(() => ({
    /* Null here, then seeded by the effect above once the listing lands —
       monthly rate, smallest count, first available bed. The move-in date is
       NOT seeded: a length the student can see and change is one thing, a date
       they never picked travelling on a request is another. */
    stayType: null,
    units: null,
    sharingId: null,
    joinDate: null,
    flexibleJoin: false,
  }));
  /*
   * A hotel asks for a bed, a rate structure and either two dates or a count
   * — not a track and a duration. Its own state, because none of those fields
   * mean anything on the other categories and folding them into `StayIntent`
   * would put four permanently-null fields on every PG.
   */
  const [hotelIntent, setHotelIntent] = useState<HotelIntent>({
    sharingId: null,
    rateStructure: null,
    checkIn: null,
    checkOut: null,
    rateQuantity: null,
  });

  /*
   * Seed whichever control this listing is going to render.
   *
   * The three branches below mirror the render exactly — a hotel gets
   * `HotelStaySelector`, a property with stay rates gets `StayIntentSelector`,
   * everything else gets `SharingTypeSelector` — so a category cannot end up
   * with a default meant for a different control.
   *
   * Kept as one effect rather than three because the condition that decides
   * WHICH default applies is the same condition that decides which selector is
   * on screen, and splitting them is how the two drift apart. Every helper
   * returns `null` when there is nothing to do, so this runs once per listing
   * and never moves a choice somebody has already made.
   *
   * What each one fills in, and what it deliberately leaves blank, is in
   * `defaultSelection.ts`.
   */
  useEffect(() => {
    if (!listing) return;

    if (listing.category === 'HOTEL' && listing.sharingOptions?.length) {
      const seeded = defaultHotelIntent(listing.sharingOptions, hotelIntent);
      if (seeded) setHotelIntent(seeded);
      return;
    }

    if (listing.stayRates?.length) {
      const seeded = defaultStayIntent(listing.stayRates, listing.sharingOptions, intent);
      if (seeded) setIntent(seeded);
      return;
    }

    if (sharing === null && listing.sharingOptions?.length) {
      setSharing(defaultSharingSelection(listing.sharingOptions));
    }
  }, [listing, sharing, intent, hotelIntent]);

  /** The bar's second gate. Never remembered across listings. */
  const [consented, setConsented] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [ctaHeight, setCtaHeight] = useState(96);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  // Scroll-linked, on the UI thread. A JS round trip per frame tears on the
  // hardware this app targets, so no threshold logic touches component state.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  // Crosses from light (over the photo) to theme-correct dark/light content
  // at the SAME scroll position PhotoHeader itself turns solid at — see the
  // hook for why a static "light" here goes invisible once that happens.
  const heroStatusBarStyle = usePhotoHeaderStatusBarStyle(scrollY);

  /*
   * Three states before there is a listing, and they are three different
   * screens.
   *
   * A single `if (!listing)` returning "not found" was correct against
   * fixtures, where a missing id was the only way to get here. Against the
   * API it would have shown "this listing does not exist" for the whole of
   * every fetch, and again for every dropped connection — telling a student
   * a place is gone when it is merely slow.
   */
  if (isPending) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.bg }, styles.centre]}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StateTemplate
          copy={errorStates.notFound()}
          onPrimary={() => router.replace('/home')}
          onSecondary={() => router.back()}
        />
      </View>
    );
  }

  if (error || !listing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <View style={{ flex: 1, justifyContent: 'center', padding: layout.gutter, gap: space[3] }}>
          <Text variant="title1">We could not open this place</Text>
          <Text variant="bodyLg" color="secondary">
            {error?.displayMessage ?? 'Something went wrong. Please try again.'}
          </Text>
          <Button
            label={isFetching ? 'Trying…' : 'Try again'}
            onPress={() => refetch()}
            disabled={isFetching}
            fullWidth
          />
          <Button label="Back to places" variant="ghost" onPress={() => router.back()} fullWidth />
        </View>
      </View>
    );
  }

  const gone = isGone(listing.availability);

  /**
   * Same category, same locality, still open. Ranked by nothing clever —
   * a filled listing's neighbours are a better answer than an algorithm's
   * guess, and pretending otherwise would be a ranking nobody can explain.
   */
  const similar = gone
    ? neighbours
        .filter(
          (other) =>
            other.id !== listing.id &&
            other.category === listing.category &&
            other.locality === listing.locality &&
            !isGone(other.availability),
        )
        .slice(0, 4)
    : [];

  const selected = listing.sharingOptions?.find((option) => option.id === sharing);

  /** Present means the listing prices by stay length rather than by bed. */
  const isHotel = listing.category === 'HOTEL';
  /* A hotel has stay rates too, but it is not asked about them — it takes the
     dates path instead. */
  const byStay = !isHotel && listing.stayRates?.length ? listing.stayRates : null;
  const totals = byStay ? stayTotals(byStay, intent, listing.sharingOptions) : null;

  /*
   * A hotel request is finished when the bed, the check-in and the amount are
   * all answered — and which field carries the amount depends on the
   * structure. Nights come off a check-out; hours and months are typed.
   */
  const hotelComplete = (() => {
    if (!isHotel) return false;
    if (!hotelIntent.sharingId || !hotelIntent.checkIn) return false;
    /* The picker is bounded to today onwards, so this can only fail on a date
       that arrived from somewhere else — a re-sent request, a screen left open
       overnight. It is checked anyway, because a check-in in the past is a
       request the owner cannot act on and the student finds out about it after
       the owner has been notified. */
    if (!isFutureDay(hotelIntent.checkIn)) return false;
    const bed = listing.sharingOptions?.find((o) => o.id === hotelIntent.sharingId);
    const structure = hotelIntent.rateStructure
      ?? (bed?.rates?.nightly ? 'nightly' : bed?.rates?.monthly ? 'monthly' : 'flexible');
    if (structure === 'nightly') {
      const { checkIn, checkOut } = hotelIntent;
      return Boolean(checkOut) && checkOut! > checkIn!;
    }
    return Boolean(hotelIntent.rateQuantity && hotelIntent.rateQuantity > 0);
  })();

  /*
   * The headline number follows whatever the student is actually choosing.
   *
   * A selected option with no price of its own falls back to the listing's
   * headline rent rather than blanking the display: the rent is a real
   * figure for this place, and `RentDisplay` renders `null` as "the owner
   * has not set a rent" — a different and untrue statement.
   */
  const shownRent = totals
    ? totals.perUnit
    : selected
      ? selected.pricePerPerson ?? listing.rent
      : listing.rent;
  const shownDeposit = totals ? totals.deposit : selected ? selected.deposit : listing.deposit;
  const shownDepositMonths = totals ? undefined : selected ? selected.depositMonths : listing.depositMonths;

  /*
   * One group, holding the photographs the owner actually uploaded.
   *
   * This used to split the count four ways — 40% "The room", 30% "Common
   * areas", 20% "Bathroom", 10% "Building" — and label them. Nothing in the
   * data supports that: the property document carries a flat, unlabelled list
   * of Cloudinary URLs, so those four headings were assigning rooms to
   * photographs nobody had looked at, and a student tapping "Bathroom" got
   * whatever happened to be 70% of the way through the upload.
   *
   * Grouping comes back when the panel asks the field agent which room each
   * photograph is of. Until then the gallery says how many there are and
   * shows them in the order they were taken.
   */
  const photos = listing.photoUris ?? [];
  const groups: readonly PhotoGroup[] = photos.length
    ? [{ id: 'all', label: 'Photos', count: photos.length, uris: photos }]
    : [];



  // No sign-in check: auth is the first gate in the app, so anyone on this
  // screen already has an account.
  /*
   * Straight to the owner. No form in between.
   *
   * The choices travel as params rather than through a store: this screen is
   * the only thing that knows them, the next screen is the only thing that
   * needs them, and a deep link into the confirmation without them would
   * otherwise render a request for nothing.
   */
  /*
   * Whether a request for the chosen bed would be accepted at all.
   *
   * The server refuses one for a room type with no recorded count, one the
   * owner has paused, and one with every bed taken. Leaving the button live
   * for those only moves the refusal to a screen the student cannot fix it
   * from — they have already committed by then, and the error reads as the
   * app being broken rather than the room being full.
   *
   * Ten of the twelve live listings have no counts recorded today, so this is
   * the common case rather than the edge.
   */
  const chosenOption = listing.sharingOptions?.length
    ? listing.sharingOptions.find((option) => option.id === sharing)
      ?? (listing.sharingOptions.length === 1 ? listing.sharingOptions[0] : undefined)
    : undefined;

  /* A listing with no options at all keeps working — those are the ones with
     nothing to choose between, and the server decides. Only a listing that
     DOES offer options and reports none of them requestable is blocked. */
  const bedUnavailable = Boolean(listing.sharingOptions?.length)
    && Boolean(chosenOption)
    && chosenOption?.requestable === false;

  /* `undefined` beds means nobody counted them, which is not the same as
     none — and the two want different sentences. */
  const availabilityNote = !chosenOption ? undefined
    : chosenOption.requestable ? (
      typeof chosenOption.availableBeds === 'number' && chosenOption.availableBeds <= 3
        ? `Only ${chosenOption.availableBeds} left`
        : undefined
    )
      /* The server says which of the three it is. Guessing from the bed count
         told students "availability not confirmed" about a room the owner had
         paused with six beds free — wrong, and nothing they could act on. */
      : chosenOption.unavailableReason === 'NO_BEDS_FREE'
        ? 'Every bed in this room is taken'
        : chosenOption.unavailableReason === 'OWNER_PAUSED'
          ? 'The owner has paused this room type'
          : 'Live availability not confirmed — call the owner';

  const goToConfirm = () =>
    router.push({
      pathname: '/confirm/[id]',
      params: {
        id: listing.id,
        ...(intent.stayType ? { stayType: intent.stayType } : null),
        ...(intent.units !== null ? { units: String(intent.units) } : null),
        /*
         * Whichever selector this listing showed.
         *
         * Stay-priced listings carry the bed choice inside the intent;
         * bed-priced ones (BACHELOR, COLIVE) keep it in `sharing`, from the
         * sharing selector. Only the first was being sent, so a request for a
         * bachelor unit arrived at the server with no sharing at all and was
         * refused with BAD_SHARING — for a choice the page had plainly
         * offered and the student had plainly made.
         */
        ...(intent.sharingId ?? sharing ? { sharingId: (intent.sharingId ?? sharing) as string } : null),
        ...(intent.joinDate ? { joinDate: intent.joinDate } : null),
        flexibleJoin: intent.flexibleJoin ? '1' : '0',
        /*
         * Hotels travel on their own four params.
         *
         * They are separate from `stayType`/`units` rather than squeezed into
         * them because they mean different things: `units` is a length, and a
         * hotel's count is nights, months or hours depending on which
         * structure was picked. The server resolves all four into the same
         * intent a short stay produces.
         */
        ...(isHotel && hotelIntent.sharingId ? { sharingId: hotelIntent.sharingId } : null),
        ...(isHotel && hotelIntent.checkIn ? { checkIn: hotelIntent.checkIn } : null),
        ...(isHotel && hotelIntent.checkOut ? { checkOut: hotelIntent.checkOut } : null),
        ...(isHotel && hotelIntent.rateStructure ? { rateStructure: hotelIntent.rateStructure } : null),
        ...(isHotel && hotelIntent.rateQuantity ? { rateQuantity: String(hotelIntent.rateQuantity) } : null),
        /*
         * The consent tick travels with the request.
         *
         * The server refuses a stay-intent request without it and records the
         * moment it was given, because that record is what says a student
         * agreed before their name and number reached a property owner. It
         * was ticked on this screen, so this screen is what can honestly
         * report it — the next screen asserting `true` on its own behalf
         * would be a signature nobody wrote.
         *
         * Sharing-only listings have no consent gate here and none there.
         */
        /* Sent for every category now. The server requires it on all of
           them, so a bachelor request that omitted it was refused with a 400
           the student could do nothing about. */
        consented: consented ? '1' : '0',
      },
    } as never);

  /* The button's own handler. A name on the account sends straight through,
     exactly as this always has; nothing on THAT path changed. Its absence
     opens the sheet instead of the confirmation screen — the request is not
     sent, and nothing was tried and failed. */
  /*
   * One booking at a time, warned before it is refused.
   *
   * The SERVER is the rule — `stayRequest.service.js` refuses a second
   * request with `BOOKING_IN_PROGRESS`, and it has to, because a client
   * check is a suggestion. This is the same rule read from the same place
   * the home strip reads it (`useOngoing`), so the student is told before
   * they have chosen a room, a length and a date and pressed send, rather
   * than after.
   *
   * A prompt rather than a disabled button: "why can I not book this" is a
   * question a greyed-out control cannot answer, and the useful reply names
   * the property they are already waiting on and offers to open it.
   */
  const openBlocking = () => {
    if (!blocking) return;
    router.push(
      (blocking.key.startsWith('listing-')
        ? `/confirm/${blocking.key.replace('listing-', '')}`
        : `/bookings/${blocking.key.replace('booking-', '')}`) as never,
    );
  };

  const requestBed = () => {
    if (blocking) {
      confirm({
        title: 'You already have a booking going on',
        message: `${blocking.title} — ${blocking.status.toLowerCase()}. `
          + 'Finish or cancel that one, and this place will still be here.',
        confirmLabel: 'Open it',
        cancelLabel: 'Not now',
      }).then((go) => { if (go) openBlocking(); });
      return;
    }
    if (!user?.name) {
      setProfileError(null);
      setProfileSheetOpen(true);
      return;
    }
    goToConfirm();
  };

  const submitProfileAndContinue = async () => {
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
        /* Best-effort. A missing address must not be the reason a request
           never reaches the owner — the name above is the only hard
           requirement, on this screen and on the server. */
        await addAddress({ kind: 'home', label: 'Home', line1: trimmedAddress }).catch(() => {});
      }
      setProfileSheetOpen(false);
      /* Same gate. This path also ends in a new request, and a rule enforced
         on one of two routes to the same call is not a rule. */
      if (blocking) {
        confirm({
          title: 'You already have a booking going on',
          message: `${blocking.title} — ${blocking.status.toLowerCase()}. `
            + 'Finish or cancel that one, and this place will still be here.',
          confirmLabel: 'Open it',
          cancelLabel: 'Not now',
        }).then((go) => { if (go) openBlocking(); });
        return;
      }
      goToConfirm();
    } catch (caught) {
      setProfileError(
        caught instanceof ApiError ? caught.displayMessage : 'We could not save that. Please try again.',
      );
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={heroStatusBarStyle} />

      <PhotoHeader
        title={listing.name}
        scrollY={scrollY}
        onBack={() => router.back()}
        onAction={() => listing && toggleSaved(listing.id)}
        actionIcon="bookmark"
        actionActive={saved}
      />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: ctaHeight + space[6] }}
        refreshControl={
          <RefreshControl
            refreshing={(isFetching || reviewsFetching) && !isPending}
            onRefresh={() => {
              refetch();
              refetchReviews();
            }}
            tintColor={colors.brand}
          />
        }
      >
        <PhotoHero scrollY={scrollY}>
          {/* The tinted block stays as the ground, so a photograph that is
              still downloading has something behind it rather than a white
              gap the header floats over. */}
          <View style={[StyleSheet.absoluteFill, styles.hero]} />

          {/*
            The outer Pressable that used to wrap this is gone.

            A horizontal pager inside a Pressable is a fight over the same
            gesture: on Android the press responder can claim a drag that was
            meant to be a swipe, so the photographs would not move. Each page
            carries its own tap instead, which keeps both — swipe to see the
            next, tap to open it full screen.
          */}
          <HeroCarousel
            photos={photos}
            height={heroHeight}
            onPressPhoto={() => setGalleryOpen(true)}
          />
        </PhotoHero>

        {/*
          The body paints the ground, and that is load bearing rather than
          cosmetic.

          `PhotoHero` parallaxes: it translates DOWN by 35% of the scroll
          offset, so by the time the hero has scrolled away its painted box
          overlaps the top of this block by a third of the distance travelled.
          A transform moves pixels and not layout, so nothing here shifts —
          but with a transparent body the photograph was simply visible
          THROUGH the listing name, the locality and the rent, and it grew
          worse the further down the screen went.

          Painting `colors.bg` here is what makes the body opaque to the hero
          sliding under it. It is the same colour the screen root already
          paints, so nothing changes visually except that the photo stops
          showing through.
        */}
        <View
          style={[
            styles.mainBodySheet,
            {
              paddingHorizontal: layout.gutter,
              paddingTop: space[4],
              paddingBottom: space[6],
              gap: space[5],
              backgroundColor: colors.bg,
            },
          ]}
        >
          {/* Top Sheet Drag Handle Indicator */}
          <View style={[styles.sheetGrabHandle, { backgroundColor: colors.borderSubtle }]} />

          {/* Status Badge Row */}
          {listing.gender ? (
            <View style={styles.statusBadgeRow}>
              <GenderBadge gender={listing.gender} />
            </View>
          ) : null}

          {/* Identity & Locality */}
          <View style={styles.propertyTitleBlock}>
            <Text
              variant="title1"
              style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 24, lineHeight: 30 }}
            >
              {listing.name}
            </Text>
            <View style={[styles.row, { gap: 6, alignItems: 'center' }]}>
              <Icon name="mapPin" size={16} color={colors.brand} />
              <Text variant="body" color="secondary" style={{ fontWeight: '500' }}>
                {listing.locality}
                {listing.localityNote ? ` · ${listing.localityNote}` : ''}
              </Text>
            </View>
          </View>

          {/* Hero Pricing & Value Studio Card */}
          <View
            style={[
              styles.priceStudioCard,
              {
                backgroundColor: isDark ? 'rgba(15, 118, 110, 0.18)' : '#F0FDF4',
                borderColor: colors.brand,
              },
            ]}
          >
            <View style={styles.priceStudioTop}>
              <View style={{ flex: 1 }}>
                <Text
                  variant="caption"
                  color="secondary"
                  style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' }}
                >
                  Starting Rent
                </Text>
                <Text
                  variant="title1"
                  style={{ color: colors.brand, fontWeight: '800', fontSize: 28, marginTop: 2 }}
                >
                  ₹{shownRent ? shownRent.toLocaleString('en-IN') : '—'}
                  <Text variant="body" color="secondary" style={{ fontWeight: '500' }}>
                    {totals && totals.rate.id === 'DAILY' ? ' / night' : ' / month'}
                  </Text>
                </Text>
              </View>

              <View style={[styles.zeroBrokeragePill, { backgroundColor: colors.brand }]}>
                <Icon name="check" size={12} color="#FFFFFF" />
                <Text variant="caption" style={{ color: '#FFFFFF', fontWeight: '700', marginLeft: 4 }}>
                  Zero Brokerage
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.priceStudioDivider,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)' },
              ]}
            />

            <View style={styles.priceStudioBottom}>
              <View style={styles.priceMetaItem}>
                <Icon name="security" size={14} color={colors.brand} />
                <Text variant="caption" color="secondary" style={{ marginLeft: 6 }}>
                  Deposit:{' '}
                  <Text variant="caption" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                    {shownDeposit ? `₹${shownDeposit.toLocaleString('en-IN')}` : 'Nil'}
                  </Text>
                  {shownDepositMonths ? ` (${shownDepositMonths} mo)` : ''}
                </Text>
              </View>
            </View>
          </View>

          {/* Unavailable Notice & Similar Stays */}
          {gone ? (
            <View style={{ gap: space[4] }}>
              <View
                style={{
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: radius.card,
                  padding: space[4],
                  gap: space[2],
                }}
              >
                <Text variant="bodyStrong">No longer available</Text>
                <Text variant="caption" color="secondary">
                  {availabilityLabel(listing.availability)}. We keep this page so a saved link still
                  works, but you cannot request it right now.
                </Text>
                <Button label="Notify me if a bed opens" variant="secondary" onPress={() => {}} />
              </View>

              {similar.length > 0 ? (
                <View style={{ gap: space[3] }}>
                  <Text variant="bodyStrong">
                    {similar.length} similar {similar.length === 1 ? 'place' : 'places'} nearby
                  </Text>
                  {similar.map((other) => (
                    <ListingCard
                      key={other.id}
                      listing={other}
                      variant="list"
                      onPress={() => router.replace(`/listing/${other.id}`)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Stay & Room Configuration Studio */}
          {isHotel && listing.sharingOptions?.length ? (
            <View
              style={[
                styles.stayConfigSection,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.surface,
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <View style={styles.stayConfigHeader}>
                <View style={[styles.stayConfigIconWrap, { backgroundColor: colors.brandTint }]}>
                  <Icon name="calendar" size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                    Hotel Stay Dates & Room
                  </Text>
                  <Text variant="caption" color="secondary">
                    Select check-in, duration and room structure.
                  </Text>
                </View>
              </View>
              <HotelStaySelector
                options={listing.sharingOptions}
                value={hotelIntent}
                onChange={setHotelIntent}
              />
            </View>
          ) : byStay ? (
            <View
              style={[
                styles.stayConfigSection,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.surface,
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <StayIntentSelector
                rates={byStay}
                sharingOptions={listing.sharingOptions}
                mess={listing.mess}
                value={intent}
                onChange={setIntent}
              />
            </View>
          ) : listing.sharingOptions?.length ? (
            <View
              style={[
                styles.stayConfigSection,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.surface,
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <View style={styles.stayConfigHeader}>
                <View style={[styles.stayConfigIconWrap, { backgroundColor: colors.brandTint }]}>
                  <Icon name="bed" size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                    Room & Sharing Type
                  </Text>
                  <Text variant="caption" color="secondary">
                    Every price is per person, per month.
                  </Text>
                </View>
              </View>
              <SharingTypeSelector
                options={listing.sharingOptions}
                value={sharing}
                onChange={setSharing}
                note="Every price is per person, per month."
              />
            </View>
          ) : null}

          {/* Verified Host / Property Management Card */}
          <View
            style={[
              styles.hostCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : colors.surface,
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            <View style={[styles.hostAvatar, { backgroundColor: colors.brand }]}>
              <Text variant="title3" style={{ color: '#FFFFFF', fontWeight: '700' }}>
                {(listing.ownerName ? listing.ownerName.charAt(0) : 'L').toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text variant="bodyStrong" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                  {listing.ownerName ?? 'Lampose Stay Partner'}
                </Text>
                {listing.isVerified ? <Icon name="verified" size={14} color={colors.brand} /> : null}
              </View>
              <Text variant="caption" color="secondary" style={{ marginTop: 2 }}>
                {listing.isVerified ? 'Verified Property Partner' : 'Property Partner'}
              </Text>
            </View>
          </View>

          {/* About this place (Expandable) */}
          {listing.description ? (
            <View style={{ gap: space[2] }}>
              <SectionHeading
                icon="home"
                title="About this place"
                tint={colors.surfaceRaised}
                ink={colors.textPrimary}
              />
              <Text
                variant="body"
                color="secondary"
                numberOfLines={descriptionExpanded ? undefined : 4}
                style={{ lineHeight: 22 }}
              >
                {listing.description}
              </Text>
              {listing.description.length > 180 ? (
                <Pressable
                  onPress={() => setDescriptionExpanded(!descriptionExpanded)}
                  style={styles.readMoreBtn}
                >
                  <Text variant="bodyStrong" style={{ color: colors.brand, fontWeight: '600' }}>
                    {descriptionExpanded ? 'Show less ⌃' : 'Read more ⌄'}
                  </Text>
                </Pressable>
              ) : null}
              <Text variant="caption" color="tertiary" style={{ marginTop: 2 }}>
                Written by the property owner.
              </Text>
            </View>
          ) : null}

          {/* Meal Plan */}
          {listing.meals ? <MealPlanCard plan={listing.meals} /> : null}

          {/* Guest Reviews & Ratings */}
          <GuestReviews listingId={listing.id} />

          {/* Amenities & Facilities Showcase (Single dedicated place) */}
          {listing.amenities?.length ? (
            <View
              style={[
                styles.amenitiesCardWrapper,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.surface,
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <View style={styles.amenitiesHeaderRow}>
                <SectionHeading
                  icon="security"
                  title="Amenities & Facilities"
                  tint={colors.brandTint}
                  ink={colors.brand}
                />
                <View style={[styles.amenitiesCountPill, { backgroundColor: colors.brandTint }]}>
                  <Text variant="caption" style={{ color: colors.brand, fontWeight: '700' }}>
                    {listing.amenities.length} {listing.amenities.length === 1 ? 'amenity' : 'amenities'}
                  </Text>
                </View>
              </View>
              <AmenityGrid amenities={listing.amenities} category={listing.category} />
            </View>
          ) : null}

          {/* Legal Consent Gate */}
          <View
            style={{
              backgroundColor: consented ? colors.brandTint : colors.surface,
              borderColor: consented ? colors.brand : colors.border,
              borderWidth: consented ? 1.5 : StyleSheet.hairlineWidth,
              borderRadius: radius.card,
              paddingHorizontal: space[4],
              paddingVertical: space[3],
              gap: space[1],
            }}
          >
            <Checkbox
              label="I accept the Privacy Policy and Terms and Conditions"
              checked={consented}
              onChange={setConsented}
            />
            <View style={[styles.legalRow, { gap: space[3], paddingLeft: space[6] }]}>
              {[
                { label: 'Privacy Policy', url: 'https://lampose.com/privacy' },
                { label: 'Terms and Conditions', url: 'https://lampose.com/terms' },
              ].map((doc) => (
                <Pressable
                  key={doc.url}
                  onPress={() => {
                    Linking.openURL(doc.url).catch(() => {});
                  }}
                  hitSlop={8}
                  accessibilityRole="link"
                  accessibilityLabel={`Read the ${doc.label}`}
                >
                  <Text variant="caption" color="brand" style={styles.underline}>
                    {doc.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Animated.ScrollView>

      {!gone ? (
        <StickyCtaBar
          label={actions.requestBed}
          onPress={requestBed}
          // The rate, and the count beside it — not one pre-multiplied total.
          // A student comparing three places is comparing rates; folding the
          // length in makes two listings at the same rate look different
          // because one was viewed at 3 months and the other at 6.
          rent={totals ? totals.perUnit : (shownRent ?? undefined)}
          multiplier={
            totals && intent.units !== null
              ? `× ${intent.units} ${totals.rate.unit}${intent.units === 1 ? '' : 's'}`
              : undefined
          }
          // The deposit has left the bar. On a stay-priced listing it belongs
          // to the quote, where it is one line among the money being agreed —
          // not a second figure competing with the rate at the moment of tap.
          deposit={byStay ? undefined : shownDeposit}
          depositMonths={byStay ? undefined : shownDepositMonths}
          // Both dropdowns answered, and the box ticked in the block above.
          // Anything less and the owner would receive a request nobody
          // finished making.
          disabled={
            /* A room with no free bed is refused by the server, so the button
               is off here rather than live-and-doomed. */
            bedUnavailable
            || (isHotel
              /* A hotel needs the bed, a check-in, and then either a check-out
                 or a count — whichever its chosen structure is bought in. */
              ? !hotelComplete || !consented
              : byStay
              ? !stayIntentComplete(intent, Boolean(listing.sharingOptions?.length)) || !consented
              : /* A listing that offers a choice of bed must have one picked.
                   The server validates the sharing label against the
                   property's own list and refuses a request without it, so
                   leaving the button live here only moved the refusal to a
                   screen where the student can no longer fix it.

                   And the tick, which this branch used to skip — the server
                   requires consent on every category now, so a live button
                   here only moved a 400 to the next screen. */
                (Boolean(listing.sharingOptions?.length) && !sharing) || !consented)
          }
          /*
            What happens after the tap, said before it.
            
            A hotel is paid for IN FULL once the owner confirms the room is
            free — it is the one category where the request leads to the whole
            cost of the stay rather than to a fee or to nothing. "5 free
            requests per week" was true of the request and silent about that,
            which is the wrong thing to be silent about on the button that
            starts it.
            
            Bachelor and co-live keep "you pay only after the owner accepts",
            which is exactly what their ₹199 does.
          */
          note={availabilityNote
            ?? (isHotel
              ? 'Free to ask · you pay for the stay once the owner confirms'
              : byStay
                ? '5 free requests per week'
                : 'Free to request · you pay only after the owner accepts')}
          onMeasure={setCtaHeight}
        />
      ) : null}

      <PhotoGallery
        visible={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        groups={groups}
        provenance="Uploaded by the owner."
      />

      {/* Opened by `requestBed`, in place of the confirmation screen, the
          first time this account has no name on file. The request is not
          sent until this closes with one — see the note where it opens. */}
      <BottomSheet
        visible={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
        title="One more thing before we send this"
        footer={(
          <Button
            label="Save and send request"
            loadingLabel="Sending"
            loading={savingProfile}
            disabled={savingProfile || profileName.trim().length === 0}
            onPress={submitProfileAndContinue}
            fullWidth
          />
        )}
      >
        <View style={{ gap: space[4] }}>
          <Text variant="body" color="secondary">
            {listing.ownerName ?? 'The owner'} sees this on your request. Saved to your account — you
            will not be asked again.
          </Text>

          <TextField
            label="Your name"
            value={profileName}
            onChangeText={setProfileName}
            placeholder="Anjali Reddy"
            autoCapitalize="words"
            textContentType="name"
            helper="As on the ID you'll show at move-in."
            autoFocus
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
        </View>
      </BottomSheet>
    </View>
  );
}

/* ── Section headings ──────────────────────────────────────────────────── */

/**
 * A heading that gives its section a colour of its own.
 *
 * The page used to run every block as `title3` in ink on the same ground,
 * separated by nothing but space — five sections that looked like one long
 * document, which is what "it all reads the same" meant. Each now carries a
 * tinted glyph and a rule in its own hue, so the eye can find "what's here"
 * without reading the words.
 *
 * The hues are the palette's own semantic families, not new colours: accent
 * for the thing being chosen, caution for meals and ratings (the warm pair),
 * ink for the owner's own words. Every text/tint pairing here is one the
 * token file already documents a contrast ratio for — see `constants/tokens`.
 * Colour is never the only signal: the glyph and the words carry it too, which
 * is the rule the palette's own header sets out.
 */
function SectionHeading({
  icon,
  title,
  tint,
  ink,
}: {
  icon: IconName;
  title: string;
  tint: string;
  ink: string;
}) {
  const { space, radius } = useTheme();
  return (
    <View style={[styles.sectionHead, { gap: space[2] }]}>
      <View style={[styles.sectionRule, { backgroundColor: ink }]} />
      <View
        style={[
          styles.glyphChip,
          {
            width: 30, height: 30, borderRadius: radius.chip, backgroundColor: tint,
          },
        ]}
      >
        <Icon name={icon} size={16} color={ink} />
      </View>
      <Text variant="title3" style={{ color: ink }}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: '#4A463E' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  legalRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  underline: { textDecorationLine: 'underline' },
  /* A section's own colour, carried by a rule down its left edge and a tinted
     glyph beside the title — see `SectionHeading`. */
  sectionHead: { flexDirection: 'row', alignItems: 'center' },
  sectionRule: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  glyphChip: { alignItems: 'center', justifyContent: 'center' },

  // Luxury Layout Styles
  mainBodySheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -22,
  },
  sheetGrabHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  propertyTitleBlock: {
    gap: 6,
  },
  priceStudioCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  priceStudioTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  zeroBrokeragePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  priceStudioDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  priceStudioBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  priceMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stayConfigSection: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  stayConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stayConfigIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  hostAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingVertical: 4,
  },
  amenitiesCardWrapper: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  amenitiesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amenitiesCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
});


/* ── Guest reviews ─────────────────────────────────────────────────────── */

function Stars({ rating }: { rating: number }) {
  const { colors } = useTheme();
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <Text
      variant="numMeta"
      style={{ color: colors.warning.base, letterSpacing: 1 }}
      accessibilityLabel={`${full} out of 5`}
    >
      {'★'.repeat(full)}
      <Text variant="numMeta" style={{ color: colors.borderSubtle, letterSpacing: 1 }}>
        {'★'.repeat(5 - full)}
      </Text>
    </Text>
  );
}

function GuestReviews({ listingId }: { listingId: string }) {
  const { colors, space, radius } = useTheme();
  const { reviews, averageRating, count, isPending } = useListingReviews(listingId);

  /* Nothing to say yet, and still loading is not "nothing". */
  if (isPending) return null;

  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <SectionHeading
          icon="star"
          title="What guests say"
          tint={colors.warning.tint}
          ink={colors.warning.ink}
        />
        {count > 0 && averageRating != null ? (
          <Text variant="numMeta" style={{ color: colors.warning.ink }}>
            {averageRating.toFixed(1)} · {count === 1 ? '1 review' : `${count} reviews`}
          </Text>
        ) : null}
      </View>

      {count === 0 ? (
        <Text variant="body" color="secondary">
          No reviews yet. Guests can rate a stay once it is over.
        </Text>
      ) : (
        reviews.slice(0, 10).map((r) => (
          <View
            key={r.id}
            style={{
              backgroundColor: colors.warning.tint,
              borderLeftColor: colors.warning.base,
              borderLeftWidth: 3,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[2],
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
              <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                {r.author}
              </Text>
              <Stars rating={r.rating} />
            </View>
            <Text variant="body" color="secondary">
              {r.comment}
            </Text>
            <Text variant="caption" color="tertiary">
              {r.date}
            </Text>

            {r.reply ? (
              <View
                style={{
                  marginTop: space[1],
                  paddingLeft: space[3],
                  borderLeftWidth: 2,
                  borderLeftColor: colors.brand,
                  gap: space[1],
                }}
              >
                <Text variant="label" color="brand">
                  Owner replied
                </Text>
                <Text variant="body" color="secondary">
                  {r.reply.text}
                </Text>
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}
