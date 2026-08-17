import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { NotificationRow } from '@/components/lifecycle';
import { emptyStates } from '@/constants/copy';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useNotifications } from '@/services';
import type { AppNotification } from '@/types/support';

/**
 * The alerts inbox.
 *
 * Grouped by day, because the question asked of this screen is almost always
 * temporal: "when did she reply", "did that come through today". A flat
 * reverse-chronological list answers it only by making the reader count.
 * Grouping happens on the device rather than the server — "today" is a fact
 * about where the reader is standing, and a server in UTC would file an 11pm
 * alert under tomorrow.
 *
 * ## Every row is now something that actually happened
 *
 * This screen used to render fixtures: rent falling due, a deposit refunded,
 * a support agent replying, all with a "mark all read" that lived for as long
 * as the component was mounted. None of those events exist — there is no rent
 * ledger, no refund and no ticketing system — so the alerts are derived from
 * the one thing that does happen to a customer, their visit requests, and
 * nothing else is invented to fill the screen out.
 *
 * That is why an inbox here is often short or empty. An empty alerts screen
 * for somebody who has not requested a visit yet is the correct screen.
 *
 * ## Read is a watermark, and the screen says only what it can keep
 *
 * "Mark all read" moves a timestamp on the account, so it holds across
 * devices and across launches. There is no per-item read state to move,
 * because there is no per-item row to move it on — tapping an alert opens
 * what it is about and does not pretend to mark it read. The previous version
 * did pretend, in component state that reset on the next visit.
 */
export default function Notifications() {
  const { colors, space, layout, mode } = useTheme();
  const router = useRouter();
  const { status } = useAuth();

  const signedIn = status === 'signedIn';

  const {
    days,
    unread,
    isPending,
    error,
    refetch,
    isFetching,
    markAllRead,
    isMarkingRead,
  } = useNotifications(signedIn);

  /**
   * The server's alert, in the shape `NotificationRow` draws.
   *
   * `money` is never set. The row typesets money items differently — a tinted
   * glyph tile, so a payment can be found by shape in a list of forty — and
   * there is not one honest money event in this system to put in it. Setting
   * it would make the distinction meaningless the first time it was wrong.
   */
  const toRow = (item: (typeof days)[number]['items'][number]): AppNotification => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    body: item.body,
    timeLabel: new Date(item.at).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    unread: item.unread,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Alerts"
        subtitle={unread > 0 ? `${unread} unread` : undefined}
        onBack={() => router.back()}
        actionLabel={unread > 0 && !isMarkingRead ? 'Mark all read' : undefined}
        onAction={unread > 0 && !isMarkingRead ? () => markAllRead() : undefined}
      />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: layout.gutter,
          gap: space[5],
          paddingBottom: space[8],
        }}
      >
        {!signedIn ? (
          /* Alerts are about this person's own requests, so there is nothing
             to show a guest — and nothing to fetch, since the endpoint is
             behind a session. */
          <View style={{ flex: 1, justifyContent: 'center', gap: space[3] }}>
            <Text variant="title1">Sign in to see your alerts</Text>
            <Text variant="bodyLg" color="secondary">
              Owner replies to your visit requests land here.
            </Text>
            <Button label="Sign in" onPress={() => router.push('/(entry)/auth')} fullWidth />
          </View>
        ) : isPending ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : error ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: space[3] }}>
            <Text variant="title1">We could not load your alerts</Text>
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
        ) : days.length === 0 ? (
          <StateTemplate
            copy={emptyStates.noNotifications()}
            onPrimary={() => router.replace('/home')}
          />
        ) : (
          days.map((day) => (
            <View key={day.label} style={{ gap: space[2] }}>
              <Text variant="caption" color="tertiary">
                {day.label.toUpperCase()}
              </Text>
              {day.items.map((item) => (
                <NotificationRow
                  key={item.id}
                  notification={toRow(item)}
                  /* Opens the request it is about. The listing is the
                     fallback for an alert whose request has aged out of the
                     window the server returns. */
                  onPress={() =>
                    router.push(
                      (item.requestId
                        ? `/confirm/${item.listingId}`
                        : `/listing/${item.listingId}`) as never,
                    )
                  }
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
