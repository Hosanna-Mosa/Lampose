import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { VerificationCodeDisplay } from '@/components/booking';
import { DirectionsButton } from '@/components/discovery';
import { errorStates } from '@/constants/copy';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { addressVisible, confirmedBookingFor } from '@/data/bookings';
import { findListing } from '@/data/listings';

/**
 * Screen two of two: it is yours.
 *
 * The last thing in the flow, and the first moment the student has something
 * concrete rather than a hope. Four blocks, in the order somebody actually
 * needs them:
 *
 *   1. it is confirmed
 *   2. where it is, and a way to get there
 *   3. the code that gets them in the door
 *   4. where this lives from now on
 *
 * ## The address appears here for the first time
 *
 * Not because this screen decided to show it — because this is the first
 * object in the system that *has* one. `Listing` carries a locality and a
 * landmark and nothing more, so no discovery screen is capable of leaking an
 * address it was never given. The full address, the landmark and the map pin
 * are attached to the booking at confirmation, and `addressVisible()` is the
 * single place that decides which booking states may render them.
 *
 * ## Nothing was paid
 *
 * This category is free while it is being seeded, so there is no payment step
 * between the owner accepting and the bed being held. That makes the code the
 * only thing standing between a confirmation and a stranger walking in, which
 * is why it is on this screen and not buried in the booking detail.
 *
 * ## The screen is a receipt, not a destination
 *
 * Everything on it is repeated in the booking detail, permanently. A student
 * arriving at the gate three weeks later goes to Bookings, not back here — so
 * the last block's job is to say that out loud, and the primary action takes
 * them there rather than dumping them on the feed.
 */
/** "5 September 2026" from a `YYYY-MM-DD` calendar day. */
function prettyDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${day} ${names[month - 1]} ${year}`;
}

export default function Booked() {
  const { colors, space, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const { id, sharingId, joinDate } = useLocalSearchParams<{
    id: string;
    sharingId?: string;
    joinDate?: string;
  }>();

  const { clear } = usePendingRequest();
  const listing = useMemo(() => (id ? findListing(id) : undefined), [id]);

  /*
   * The booking the confirmed request became.
   *
   * Created once and then found on every later visit, so re-entering this
   * screen does not mint a second booking or a second move-in code.
   */
  const booking = useMemo(
    () =>
      listing
        ? confirmedBookingFor({
            listingId: listing.id,
            propertyName: listing.name,
            sharingLabel:
              listing.sharingOptions?.find((option) => option.id === sharingId)?.label ??
              listing.sharingLabel ??
              'Your room',
            ownerName: listing.ownerName,
            rent: listing.rent ?? 0,
            moveInLabel: joinDate ? prettyDate(joinDate) : undefined,
          })
        : undefined,
    [listing, sharingId, joinDate],
  );

  if (!listing || !booking) {
    return <StateTemplate copy={errorStates.notFound()} onPrimary={() => router.replace('/home')} />;
  }

  const owner = listing.ownerName ?? 'the owner';
  const showAddress = addressVisible(booking.status) && Boolean(booking.address);

  const goToBooking = () => {
    // The request is over and its outcome has been read, so the pill that was
    // following the student around has nothing left to tell them.
    clear();
    router.replace(`/bookings/${booking.id}` as never);
  };

  return (
    <View style={styles.flex}>
      <StatusBar style="auto" />
      {/* No back arrow. Back would be the wait, which no longer exists. */}
      <StandardHeader title="Confirmed" subtitle={listing.name} />

      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: space[5],
          paddingBottom: insets.bottom + space[6],
          gap: space[6],
        }}
      >
        {/* 1 — it is confirmed. */}
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(160) : FadeInDown.duration(320)}
          style={[styles.centre, { gap: space[3] }]}
        >
          <View
            style={[
              styles.seal,
              { backgroundColor: colors.success.tint, borderRadius: radius.pill },
            ]}
          >
            <Icon name="check" size={28} color={colors.brandInk} />
          </View>
          <Text variant="title1" style={styles.centred}>
            {owner} has your booking
          </Text>
          <Text variant="bodyLg" color="secondary" style={styles.centred}>
            {booking.sharingLabel} at {listing.name}, from {booking.moveInLabel}. Nothing was
            charged, and nothing is owed before you move in.
          </Text>
          <Text variant="priceSm" color="tertiary">
            {booking.reference}
          </Text>
        </Animated.View>

        {/* 2 — where it is. The first screen in the product allowed to say. */}
        {showAddress ? (
          <View style={{ gap: space[3] }}>
            <Text variant="title3">Where to go</Text>
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
              <View style={[styles.row, { gap: space[3] }]}>
                <Icon name="mapPin" size={20} color={colors.textSecondary} />
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{booking.address}</Text>
                  {/* How people here actually navigate the last 200 metres. A
                      pin gets you to the street; a shop gets you to the gate. */}
                  {booking.landmark ? (
                    <Text variant="caption" color="secondary">
                      {booking.landmark}
                    </Text>
                  ) : null}
                </View>
              </View>

              {owner !== 'the owner' ? (
                <Text variant="caption" color="tertiary">
                  Ask for {owner} at the gate.
                </Text>
              ) : null}

              {/* The button sits under the address rather than replacing it —
                  somebody comparing two places, or reading it out over a phone
                  call, needs the text itself and not just a link. */}
              <DirectionsButton
                place={{
                  coords: booking.coords,
                  address: booking.address,
                  label: `${listing.name}, ${listing.locality}`,
                }}
                variant="secondary"
                label="Open in Google Maps"
              />
            </View>
          </View>
        ) : null}

        {/* 3 — the code, and the thanks. */}
        {booking.verificationCode ? (
          <View style={{ gap: space[4] }}>
            <VerificationCodeDisplay
              code={booking.verificationCode}
              bookingReference={booking.reference}
              ownerName={listing.ownerName}
              validLabel={booking.codeValidLabel ?? 'Valid on your move-in day'}
              variant="embedded"
            />
            <Text variant="body" color="secondary" style={styles.centred}>
              Thanks for booking with LAMPOSE. We hope it feels like home.
            </Text>
          </View>
        ) : null}

        {/* 4 — where this lives from now on. */}
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.card,
            padding: space[4],
            gap: space[2],
          }}
        >
          <Text variant="bodyStrong">This is saved in Bookings</Text>
          <Text variant="caption" color="secondary">
            The address, the code and everything you agreed to stay there. Open it from Bookings on
            the day you move in — you do not need to keep this screen or take a screenshot.
          </Text>
        </View>

        <View style={{ gap: space[3] }}>
          <Button label="View my booking" onPress={goToBooking} fullWidth />
          <Button
            label="Keep looking"
            variant="secondary"
            onPress={() => {
              clear();
              router.replace('/home');
            }}
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  centre: { alignItems: 'center' },
  centred: { textAlign: 'center' },
  seal: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});
