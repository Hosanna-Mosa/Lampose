import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { VisitChecklist, VisitStatusCard } from '@/components/booking';
import { DirectionsButton } from '@/components/discovery';
import { visitConfirmed } from '@/data/bookings';
import { findListing } from '@/data/listings';
import { useTheme } from '@/context/ThemeContext';

/**
 * Screen 32 — the visit is confirmed.
 *
 * Not a receipt. **A checklist for a nervous first-timer**, and the order is
 * the order of the walk: who to ask for at the gate, what to bring, how to get
 * there — then what to ask once you are inside.
 *
 * A confirmation screen that only says "confirmed, see you Thursday" is a
 * wasted screen. The student already knows the visit is confirmed; they tapped
 * the button. What they do not know is what happens when they arrive, and that
 * is the anxiety the screen can actually remove.
 */
export default function VisitConfirmed() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const listing = id ? findListing(id) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Visit confirmed"
        subtitle={listing ? `${listing.name} · ${listing.locality}` : undefined}
        onBack={() => router.replace(`/listing/${id ?? ''}`)}
      />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[5], paddingBottom: space[8] }}
      >
        <VisitStatusCard
          visit={{
            ...visitConfirmed,
            propertyName: listing?.name ?? visitConfirmed.propertyName,
            ownerName: listing?.ownerName ?? visitConfirmed.ownerName,
            landmark: listing?.landmark ?? visitConfirmed.landmark,
          }}
          onCancel={() => router.replace(`/listing/${id ?? ''}`)}
          onPickNewSlot={() => router.replace(`/listing/visit?id=${id ?? ''}`)}
          onCallOwner={() => {}}
        />

        {/* The landmark, and only the landmark.
            A visit is free and happens before any payment, so it may not hand
            out the street address — otherwise the whole address-after-booking
            rule is one free tap away from being pointless.
            What it can give is genuinely enough: the landmark is a public shop,
            so Google Maps navigates to *that*, and the owner covers the last
            fifty metres by phone. No coords and no address are passed here —
            the button cannot leak what it was never given. */}
        {listing?.landmark ? (
          <View style={{ gap: space[2] }}>
            <DirectionsButton
              place={{ label: `${listing.landmark}, ${listing.locality}` }}
              landmark={`${listing.landmark} · ${listing.locality}`}
              label="Directions to the landmark"
              variant="secondary"
            />
            <Text variant="caption" color="secondary">
              This takes you to the landmark, not the door. Call{' '}
              {listing.ownerName ?? 'the owner'} when you are close — the exact address is shared
              once you book.
            </Text>
          </View>
        ) : null}

        <VisitChecklist />

        <Text variant="caption" color="tertiary">
          Free to cancel until 2 hours before. If you cannot make it, cancelling costs nothing and
          does not affect any request you send later.
        </Text>

        <Button
          label="Back to the listing"
          variant="ghost"
          fullWidth
          onPress={() => router.replace(`/listing/${id ?? ''}`)}
        />
      </ScrollView>
    </View>
  );
}
