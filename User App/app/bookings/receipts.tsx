import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { ReceiptRow } from '@/components/lifecycle';
import { receipts, RECEIPTS_RETENTION_NOTE } from '@/data/bookings';
import { useTheme } from '@/context/ThemeContext';

/**
 * Screen 55 — receipts and the agreement.
 *
 * The retention promise at the bottom is not filler. A student needs these for
 * a rent-allowance claim, a visa file, or a future landlord asking for a
 * reference — sometimes years after the stay ended and long after they last
 * opened the app. Saying how long they last is what makes it safe not to
 * screenshot everything.
 *
 * The not-yet-generated settlement statement is shown rather than hidden, with
 * its own deadline. See `ReceiptRow` for why.
 */
export default function Receipts() {
  const { colors, space, layout, mode, radius } = useTheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Receipts & agreement"
        subtitle="LAM-4192 · Bhavana Girls PG"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[5], paddingBottom: space[8] }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.card,
            paddingHorizontal: space[4],
          }}
        >
          {receipts.map((receipt, index) => (
            <ReceiptRow
              key={receipt.id}
              receipt={receipt}
              last={index === receipts.length - 1}
            />
          ))}
        </View>

        <Text variant="caption" color="secondary">
          {RECEIPTS_RETENTION_NOTE}
        </Text>
      </ScrollView>
    </View>
  );
}
