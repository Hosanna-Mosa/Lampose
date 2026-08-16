import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { Button, Checkbox, RentDisplay, Text } from '@/components/ui';
import { PHOTO_HERO_HEIGHT, PhotoHeader, PhotoHero, StateTemplate, StickyCtaBar } from '@/components/shell';
import {
  AmenityGrid,
  GenderBadge,
  MealPlanCard,
  PhotoGallery,
  ListingCard,
  SharingTypeSelector,
  StayIntentSelector,
  stayTotals,
  stayIntentComplete,
  type StayIntent,
  defaultSharingSelection,
  type PhotoGroup,
} from '@/components/discovery';
import { errorStates } from '@/constants/copy';
import { useTheme } from '@/context/ThemeContext';
import { feedListings, findListing } from '@/data/listings';
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
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const listing = useMemo(() => (id ? findListing(id) : undefined), [id]);

  const [sharing, setSharing] = useState<string | null>(() =>
    listing?.sharingOptions ? defaultSharingSelection(listing.sharingOptions) : null,
  );
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

  if (!listing) {
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

  const gone = isGone(listing.availability);

  /**
   * Same category, same locality, still open. Ranked by nothing clever —
   * a filled listing's neighbours are a better answer than an algorithm's
   * guess, and pretending otherwise would be a ranking nobody can explain.
   */
  const similar = gone
    ? feedListings
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
  const byStay = listing.stayRates?.length ? listing.stayRates : null;
  const totals = byStay ? stayTotals(byStay, intent, listing.sharingOptions) : null;

  // The headline number follows whatever the student is actually choosing.
  const shownRent = totals ? totals.perUnit : selected ? selected.pricePerPerson : listing.rent;
  const shownDeposit = totals ? totals.deposit : selected ? selected.deposit : listing.deposit;
  const shownDepositMonths = totals ? undefined : selected ? selected.depositMonths : listing.depositMonths;

  const groups: readonly PhotoGroup[] = [
    { id: 'room', label: listing.sharingLabel ?? 'The room', count: Math.max(2, Math.round(listing.photoCount * 0.4)) },
    { id: 'common', label: 'Common areas', count: Math.max(1, Math.round(listing.photoCount * 0.3)) },
    { id: 'bath', label: 'Bathroom', count: Math.max(1, Math.round(listing.photoCount * 0.2)) },
    { id: 'outside', label: 'Building', count: Math.max(1, Math.round(listing.photoCount * 0.1)) },
  ];

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
  const requestBed = () =>
    router.push({
      pathname: '/confirm/[id]',
      params: {
        id: listing.id,
        ...(intent.stayType ? { stayType: intent.stayType } : null),
        ...(intent.units !== null ? { units: String(intent.units) } : null),
        ...(intent.sharingId ? { sharingId: intent.sharingId } : null),
        ...(intent.joinDate ? { joinDate: intent.joinDate } : null),
        flexibleJoin: intent.flexibleJoin ? '1' : '0',
      },
    } as never);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />

      <PhotoHeader
        title={listing.name}
        scrollY={scrollY}
        onBack={() => router.back()}
        onAction={() => {}}
        actionIcon="bookmark"
      />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: ctaHeight + space[6] }}
      >
        <Pressable onPress={() => setGalleryOpen(true)} accessibilityRole="button" accessibilityLabel={`${listing.photoCount} photos`}>
          <PhotoHero scrollY={scrollY}>
            <View style={[StyleSheet.absoluteFill, styles.hero]} />
            <View style={[styles.photoCount, { bottom: space[3], right: space[3] }]}>
              <Text variant="numMeta" style={{ color: '#FFFFFF' }}>
                1 / {listing.photoCount}
              </Text>
            </View>
          </PhotoHero>
        </Pressable>

        <View style={{ padding: layout.gutter, gap: space[5] }}>
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
          {byStay ? (
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
          */}
          {byStay ? (
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
            byStay
              ? !stayIntentComplete(intent, Boolean(listing.sharingOptions?.length)) || !consented
              : false
          }
          note={byStay ? '5 free requests per week' : 'Free to request · you pay only after the owner accepts'}
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
  hero: { backgroundColor: '#3a4553' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  photoCount: {
    position: 'absolute',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(16,21,28,0.55)',
  },
});
