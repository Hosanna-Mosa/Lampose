import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { TicketRow } from '@/components/lifecycle';
import { emptyStates } from '@/constants/copy';
import { SUPPORT_HOURS_NOTE } from '@/data/support';
import { useTheme } from '@/context/ThemeContext';
import { useTickets } from '@/services';

/**
 * Screen 59 — the ticket list.
 *
 * Every closed ticket answers "so what happened" **from the list**, without
 * being opened: "Refunded ₹1,000", "Resolved · refund arrived 19 Mar". A list
 * of rows all reading "Resolved" is a list a student has to open one by one to
 * learn anything from, and they will not — they will open a new ticket instead.
 * That sentence is the server's `outcome` field; where nobody has written one,
 * the adapter falls back to a plain word and the row is worse for it, which is
 * the intended pressure on whoever works the queue.
 *
 * The reply-time promise sits under the button rather than above the list,
 * because it is a claim about what happens *after* tapping it.
 *
 * ## Reports appear here too
 *
 * A student who filed a safety report is owed sight of it — the screen that
 * sent it says "you will hear from us either way" — and a list that hid it
 * would look like the report had been thrown away. What the two kinds do not
 * share is the queue that reads them, and that separation lives on the server.
 */
export default function SupportList() {
  const { colors, space, layout, mode } = useTheme();
  const router = useRouter();

  const { tickets, isPending, error, refetch, isFetching } = useTickets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Support" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: layout.gutter,
          gap: space[3],
          paddingBottom: space[8],
        }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isPending}
            onRefresh={() => refetch()}
            tintColor={colors.brand}
          />
        }
      >
        {isPending ? (
          <View style={styles.centre}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : error ? (
          /* A failed fetch is not an empty queue. Offering "New support
             request" as the only action under a load failure would send
             somebody to file a second copy of a ticket they already have. */
          <View style={{ flex: 1, justifyContent: 'center', gap: space[3] }}>
            <Text variant="title1">We could not load your requests</Text>
            <Text variant="bodyLg" color="secondary">
              {error.displayMessage}
            </Text>
            <Button
              label={isFetching ? 'Trying…' : 'Try again'}
              onPress={() => refetch()}
              disabled={isFetching}
              fullWidth
            />
          </View>
        ) : tickets.length === 0 ? (
          <StateTemplate
            copy={emptyStates.noTickets({ replyNote: SUPPORT_HOURS_NOTE })}
            onPrimary={() => router.push('/support/new')}
          />
        ) : (
          <>
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
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
