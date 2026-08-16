import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { TicketRow } from '@/components/lifecycle';
import { SUPPORT_HOURS_NOTE, tickets } from '@/data/support';
import { useTheme } from '@/context/ThemeContext';

/**
 * Screen 59 — the ticket list.
 *
 * Every closed ticket answers "so what happened" **from the list**, without
 * being opened: "Refunded ₹1,000", "Resolved · refund arrived 19 Mar". A list
 * of rows all reading "Resolved" is a list a student has to open one by one to
 * learn anything from, and they will not — they will open a new ticket instead.
 *
 * The reply-time promise sits under the button rather than above the list,
 * because it is a claim about what happens *after* tapping it.
 */
export default function SupportList() {
  const { colors, space, layout, mode } = useTheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Support" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[3], paddingBottom: space[8] }}
      >
        {tickets.map((ticket) => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            onPress={() => router.push(`/support/${ticket.id}` as never)}
          />
        ))}

        <View style={{ gap: space[2], paddingTop: space[4] }}>
          <Button
            label="New support request"
            fullWidth
            onPress={() => router.push('/support/new')}
          />
          <Text variant="caption" color="tertiary" style={styles.centred}>
            {SUPPORT_HOURS_NOTE}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
});
