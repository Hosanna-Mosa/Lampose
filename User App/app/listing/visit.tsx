import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { VisitScheduler } from '@/components/booking';
import { visitDays } from '@/data/bookings';
import { findListing } from '@/data/listings';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { actions } from '@/constants/actions';

/**
 * Screen 31 — booking a visit.
 *
 * The title is `actions.bookVisit` — "Book a free visit" — and the word free is
 * load-bearing rather than promotional. The most common reason a student does
 * not book a visit is assuming it costs something, or that it commits them to
 * something. So the word is in the title, and the note under the button says
 * what free actually means: no charge, cancel until two hours before, no
 * obligation to request afterwards.
 *
 * **The phone-sharing block is not fine print.** A number is about to be given
 * to a stranger who owns a building, and for a young woman booking a visit
 * alone that is the decision on this screen — not the time slot. So it states
 * exactly what is shared, with whom, for how long, and why. It sits above the
 * button, because consent that appears after the commitment is not consent.
 */
export default function BookVisit() {
  const { colors, space, layout, mode, radius } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const listing = id ? findListing(id) : undefined;

  const [dayId, setDayId] = useState(visitDays[0].id);
  const [slotId, setSlotId] = useState<string | null>(null);

  const day = visitDays.find((item) => item.id === dayId);
  const slot = day?.slots.find((item) => item.id === slotId);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title={actions.bookVisit}
        subtitle={
          listing ? `${listing.name} · ${listing.locality}` : 'Pick a day and a time'
        }
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[5], paddingBottom: space[8] }}
      >
        <VisitScheduler
          days={visitDays}
          dayId={dayId}
          onSelectDay={(next) => {
            setDayId(next);
            // A slot id belongs to a day. Keeping it across a day change would
            // submit a time the owner never offered.
            setSlotId(null);
          }}
          slotId={slotId}
          onSelectSlot={setSlotId}
          onConfirm={() => router.replace(`/listing/visit-confirmed?id=${id ?? ''}`)}
        />

        {/* Above the button. Consent that appears after the commitment is not
            consent. */}
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
            <Icon name="phone" size={20} color={colors.textSecondary} />
            <View style={[styles.flex, { gap: 2 }]}>
              <Text variant="bodyStrong">
                We’ll share your number with {listing?.ownerName ?? 'the owner'}
              </Text>
              <Text variant="priceSm">{user?.phone ?? '+91 98490 12345'}</Text>
            </View>
          </View>
          <Text variant="caption" color="secondary">
            Only for this visit, so you can call each other to find the place. It is not added to any
            list, and it stops being shared once the visit is done or cancelled.
          </Text>
        </View>

        {/* What "free" actually means. */}
        <Text variant="caption" color="tertiary" style={styles.centred}>
          {slot
            ? `${day?.weekday} ${day?.date} ${day?.month}, ${slot.label} · free · cancel until 2 hours before · ${listing?.ownerName ?? 'the owner'} confirms within about an hour`
            : 'Free, and booking one does not commit you to requesting a bed.'}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  centred: { textAlign: 'center' },
  flex: { flex: 1 },
});
