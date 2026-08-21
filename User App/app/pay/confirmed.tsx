import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { StateTemplate } from '@/components/shell';
import { DirectionsButton } from '@/components/discovery';
import { VerificationCodeDisplay } from '@/components/booking';
import { errorStates } from '@/constants/copy';
import { signature } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { findListing } from '@/data/listings';
import { formatRupees } from '@/utils/money';
import { useDepositMark } from '@/components/ui/DepositMark';
import { findBooking } from '@/data/bookings';

/**
 * "It's yours."
 *
 * Two words, and the only genuine celebration in the product. One accent disc
 * at 320ms, then straight into what to do on move-in day.
 *
 * No confetti. The payoff here is certainty, not a party — and a screen that
 * cheers over a student's ₹26,499 reads as a sales screen rather than a receipt.
 *
 * ## The band went, the disc stayed
 *
 * This opened on a full-bleed accent band with white type on it until the Dock
 * repaint, which draws this screen — it is the reference's own sixth frame,
 * down to the words — as a filled accent disc standing on the ordinary page
 * ground, with the headline in ink underneath it.
 *
 * That is the better read of what the screen is for, not just the reference's
 * preference. A coloured band is the app announcing something. Everything below
 * the fold here is a document the student will come back to and show to
 * somebody at a gate — a code, a rent, a move-in date, an address — and a
 * celebration banner stapled to the top of it makes the document look like
 * marketing. On the page ground the disc still lands as the one saturated mark
 * on the screen, and the eye goes to it precisely because nothing else is
 * competing.
 *
 * It also removes an inversion. The band was the only place in the app where
 * body copy was set in `onBrand`, which meant this screen's text ran white in
 * light mode and near-black in dark — the opposite of every other screen — and
 * every string added here had to remember to opt into it.
 */
export default function PaymentConfirmed() {
  const { colors, space, layout, mode, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const { id } = useLocalSearchParams<{ id: string }>();

  const listing = useMemo(() => (id ? findListing(id) : undefined), [id]);

  /** The paid booking carries the address; the listing no longer does. */

  const paidBooking = findBooking('bkg-4192');

  if (!listing || listing.rent === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StateTemplate copy={errorStates.notFound()} onPrimary={() => router.replace('/home')} />
      </View>
    );
  }

  const rent = listing.rent;
  const deposit = listing.deposit ?? 0;
  const total = rent + deposit + 1000 + 499 - 500;
  const owner = listing.name.split(' ')[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: space[8] }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            paddingTop: insets.top + space[6],
            paddingBottom: space[6],
            paddingHorizontal: layout.gutter,
            alignItems: 'center',
            gap: space[3],
          }}
        >
          {/* The one saturated mark on the screen. Filled rather than outlined,
              because this is the only place in the product where a tick means
              "done, and it cost money" rather than "selected". */}
          <Animated.View
            entering={
              reduceMotion ? FadeIn.duration(120) : FadeIn.duration(signature.successConfirm.duration)
            }
            style={[styles.disc, { borderRadius: radius.pill, backgroundColor: colors.success.base }]}
          >
            <Icon name="check" size={28} color={colors.success.on} />
          </Animated.View>
          <Text variant="display1">It&apos;s yours</Text>
          <Text variant="bodyLg" color="secondary" style={styles.centred}>
            {listing.sharingLabel ?? 'Your bed'} at {listing.name}, from 5 September. {owner} is expecting
            you by 7 pm.
          </Text>
        </View>

        <Animated.View
          entering={reduceMotion ? FadeIn.duration(120) : FadeInDown.duration(220).delay(280)}
          style={{ padding: layout.gutter, gap: space[5] }}
        >
          {/* Cached at this moment, because PG stairwells have no signal. */}
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
            <VerificationCodeDisplay
              code="4192"
              bookingReference="LAM-4192"
              ownerName={owner}
              validLabel="Show this at move-in · works offline"
              variant="embedded"
            />
          </View>

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
            <Text variant="title3">Paid today</Text>
            <Row label="First month's rent" value={formatRupees(rent)} />
            <Row label="Security deposit · refundable" value={formatRupees(deposit)} refundable />
            <Row label="Joining + LAMPOSE fee, less discount" value={formatRupees(999)} />
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
            <Row label="Total paid · UPI · TXN 8841027" value={formatRupees(total)} strong />

            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />

            {/* Separate block, separate header. Never summed with the above. */}
            <Text variant="title3">Still to pay, at move-in, to {owner}</Text>
            <Row label="Maintenance · monthly" value="₹500/mo" />
            <Row label="Electricity · metered estimate" value="₹600–900/mo" />
          </View>

          <View style={{ gap: space[3] }}>
            <Text variant="title2">Move-in day · 5 September</Text>
            {/* Payment is what unlocks this, so it comes from the booking the
                payment created — not from the listing, which no longer carries
                an address at all. */}
            {paidBooking ? (
              <DirectionsButton
                place={{
                  coords: paidBooking.coords,
                  address: paidBooking.address,
                  label: listing.name,
                }}
                address={paidBooking.address}
                landmark={paidBooking.landmark}
              />
            ) : null}
            <Row label="Reach by" value="7:00 pm" />
            <Row label="Bring" value="Photo ID + this code" />
          </View>

          <View style={{ gap: space[2] }}>
            <Button label="View booking" onPress={() => router.replace('/home')} fullWidth />
            {/* Somebody else usually paid, and they will ask. */}
            <Button label="Send the receipt to a parent" variant="secondary" onPress={() => {}} fullWidth />
            <Button label="Agreement PDF" variant="ghost" onPress={() => {}} fullWidth />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function Row({
  label,
  value,
  refundable = false,
  strong = false,
}: {
  label: string;
  value: string;
  refundable?: boolean;
  strong?: boolean;
}) {
  const { colors } = useTheme();
  const depositMark = useDepositMark();
  return (
    <View style={styles.row}>
      <Text variant="caption" color="secondary" style={styles.flex}>
        {label}
      </Text>
      <Text
        variant={strong ? 'priceMd' : 'priceSm'}
        style={
          refundable
            ? depositMark
            : undefined
        }
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  flex: { flex: 1 },
});
