import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { PastStayCard } from '@/components/lifecycle';
import { pastStays } from '@/data/bookings';
import { useTheme } from '@/context/ThemeContext';

/**
 * Screen 54 — past stays.
 *
 * This screen exists for one question, and it is not "what did I pay". A
 * student remembers what they paid. The question is **"can I go back, and what
 * does it cost now"** — so every card carries today's rent and today's
 * availability alongside the historical figures. See `PastStayCard`.
 *
 * A delisted place keeps its card rather than disappearing. Removing it would
 * silently rewrite someone's history, and the receipts hanging off it still
 * have to be reachable years later.
 */
export default function StayHistory() {
  const { colors, space, layout, mode } = useTheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Past stays" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[4], paddingBottom: space[8] }}
      >
        {pastStays.map((stay) => (
          <PastStayCard
            key={stay.bookingId}
            stay={stay}
            onRebook={() => router.push('/home')}
            onReceipts={() => router.push('/bookings/receipts')}
          />
        ))}

        <Text variant="caption" color="tertiary">
          Stays stay here for as long as your account does, including ones at places that have since
          closed.
        </Text>
      </ScrollView>
    </View>
  );
}
