import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { Button, Checkbox, RentDisplay, Text } from '@/components/ui';
import {
  PhotoHeader,
  PhotoHero,
  StateTemplate,
  StickyCtaBar,
  usePhotoHeroHeight,
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
  type StayIntent,
  defaultSharingSelection,
  type PhotoGroup,
} from '@/components/discovery';
import { errorStates } from '@/constants/copy';
import { useAppState } from '@/context/AppStateContext';
import { useTheme } from '@/context/ThemeContext';
import { useListing, useListings, useSaved } from '@/services';
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
  /* The same height PhotoHero measures for this device, so the pager's pages
     fill the slot exactly rather than being sized from a constant that is
     wrong on a short screen. */
  const heroHeight = usePhotoHeroHeight();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { locality } = useAppState();

  const { listing, isPending, error, notFound, refetch, isFetching } = useListing(id);
  const { isSaved, toggleSaved } = useSaved();
  const saved = listing ? isSaved(listing.id) : false;

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

  useEffect(() => {
    if (sharing !== null) return;
    if (!listing?.sharingOptions?.length) return;
    setSharing(defaultSharingSelection(listing.sharingOptions));
  }, [listing, sharing]);

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
    // Neither dropdown is preselected. A default stay type means the student
    // sends a request for a length they never chose, and the owner receives it
    // as though they had — so the action stays disabled until both are answered.
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

  /** The bar's second gate. Never remembered across listings. */
  const [consented, setConsented] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [ctaHeight, setCtaHeight] = useState(96);

  // Scroll-linked, on the UI thread. A JS round trip per frame tears on the
  // hardware this app targets, so no threshold logic touches component state.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

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

  const requestBed = () =>
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />

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
        <View style={{ padding: layout.gutter, gap: space[5], backgroundColor: colors.bg }}>
          {/* Identity */}
          <View style={{ gap: space[2] }}>
            <GenderBadge gender={listing.gender} />
            <Text variant="title1">{listing.name}</Text>
            <View style={[styles.row, { gap: space[2] }]}>
              <Text variant="body" color="secondary">
                {listing.locality}
                {listing.localityNote ? ` · ${listing.localityNote}` : ''}
              </Text>
            </View>
          </View>

          {/* Money, and the deposit immediately under it — the whole reason
              this screen can afford a sparse card. */}
          <View style={{ gap: space[3] }}>
            <RentDisplay
              rent={shownRent}
              deposit={undefined}
              perBed={listing.perBed}
              perNight={totals ? totals.rate.id === 'DAILY' : listing.perNight}
              size="detail"
              sharedTag={`rent-${listing.id}`}
            />

            {/* The one thing the screen cannot otherwise tell you: whether
                anybody else is looking. The window travels with the number —
                128 views is a lot this week and nothing at all since March. */}
            {listing.viewCount !== undefined ? (
              <Text variant="numMeta" color="tertiary">
                {listing.viewCount.toLocaleString('en-IN')} viewed
                {listing.viewWindow ? ` in ${listing.viewWindow}` : ''}
              </Text>
            ) : null}
          </View>

          {/* Screen 33. Not a 404: the page still resolves, because a saved
              link a student sent their parent must not break. It states plainly
              why and when it filled, and then turns the dead end into live
              matches — an unavailable screen with no way forward is where a
              session ends. */}
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
                {/* The demand signal, and the only useful thing to offer for
                    this particular place. */}
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

          {/* PG and hostel: how long, not which bed.
              Bed choice moves to the request, where it is being committed to
              rather than browsed — and where the owner needs it. Bachelor and
              dormitory keep the sharing selector, because a whole unit and a
              dormitory bed are chosen, not scheduled. */}
          {isHotel && listing.sharingOptions?.length ? (
            <HotelStaySelector
              options={listing.sharingOptions}
              value={hotelIntent}
              onChange={setHotelIntent}
            />
          ) : byStay ? (
            <StayIntentSelector
              rates={byStay}
              sharingOptions={listing.sharingOptions}
              mess={listing.mess}
              value={intent}
              onChange={setIntent}
            />
          ) : listing.sharingOptions?.length ? (
            <SharingTypeSelector
              options={listing.sharingOptions}
              value={sharing}
              onChange={setSharing}
              note="Every price is per person, per month."
            />
          ) : null}

          {/* What the owner wrote, where they wrote one. It sits under the
              choice and above the facilities: a student who has decided how
              long they want reads the description to decide whether to keep
              reading at all. */}
          {listing.description ? (
            <View style={{ gap: space[2] }}>
              <Text variant="title3">About this place</Text>
              <Text variant="body" color="secondary">
                {listing.description}
              </Text>
              <Text variant="caption" color="tertiary">
                Written by the owner.
              </Text>
            </View>
          ) : null}

          {/* The meal plan, whenever there is one. It used to be hidden when
              "without mess" was selected; there is no selection any more, so
              the serving windows are simply a fact about the place. */}
          {listing.meals ? <MealPlanCard plan={listing.meals} /> : null}

          {listing.amenities?.length ? (
            <View style={{ gap: space[3] }}>
              <Text variant="title3">What&apos;s here</Text>
              <AmenityGrid amenities={listing.amenities} category={listing.category} />
              <Text variant="caption" color="tertiary">
                What is missing is listed as plainly as what is present — you find out here, not on the
                visit.
              </Text>
            </View>
          ) : null}

          {/*
            The consent gate, on the last block before the action.

            It moved out of the sticky bar: a bar carrying a checkbox, a rate, a
            multiplier, a button and a note is five things in a strip sized for
            one thumb, and the checkbox was the one being tapped by accident.
            Here it is full width, at the end of the reading order, and still on
            screen when the thumb reaches the button below it.

            The button stays gated on it — see `disabled` on the bar.

            Shown for EVERY category. It used to be gated on `byStay`, which
            meant a bachelor, co-live or hotel request went to an owner with no
            record that the person agreed to anything — the same name and
            number, the same stranger, and nothing behind it. The gate was
            about the pricing path and had spread to the consent by proximity.
          */}
          {true ? (
            <View
              style={{
                backgroundColor: colors.surface,
                borderColor: consented ? colors.brand : colors.border,
                borderWidth: consented ? 1.5 : StyleSheet.hairlineWidth,
                borderRadius: radius.card,
                paddingHorizontal: space[4],
                paddingVertical: space[2],
              }}
            >
              <Checkbox
                label="I accept the Privacy Policy and Terms and Conditions"
                checked={consented}
                onChange={setConsented}
              />
            </View>
          ) : null}
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
          note={availabilityNote
            ?? (byStay || isHotel ? '5 free requests per week' : 'Free to request · you pay only after the owner accepts')}
          onMeasure={setCtaHeight}
        />
      ) : null}

      <PhotoGallery
        visible={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        groups={groups}
        provenance="Uploaded by the owner."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: '#3a4553' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
