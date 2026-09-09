import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
 * ## Two read marks, and they are different things
 *
 * "Mark all read" moves a TIMESTAMP on the account, so it holds across
 * devices and across launches. Opening one alert cannot use that: the server
 * derives every alert from a visit request rather than storing rows, so there
 * is no per-alert record to mark — see `useNotifications`.
 *
 * So opening one is recorded on the DEVICE, and it is honest about being a
 * device record: it survives relaunches and does not follow anybody to a
 * second phone. Both marks feed one merged answer, which is why the dot on a
 * row and the number on the bell cannot disagree.
 *
 * The earlier version of this screen did not mark a tapped alert at all, and
 * the version before that pretended to in component state that reset on the
 * next visit.
 */
export default function Notifications() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
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
    markOneRead,
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
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
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
        refreshControl={
          signedIn ? (
            <RefreshControl
              refreshing={isFetching && !isPending}
              onRefresh={() => refetch()}
              tintColor={colors.brand}
            />
          ) : undefined
        }
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
                  /* Opens the request it is about, and marks this one read on
                     the way. The listing is the fallback for an alert whose
                     request has aged out of the window the server returns.

                     Read is recorded BEFORE the push so the dot and the bell
                     count have already dropped by the time this screen is
                     returned to — see `markOneRead` for why a device-local
                     record is the only per-alert mark available. */
                  onPress={() => {
                    markOneRead(item.id);
                    router.push(
                      (item.requestId
                        ? `/confirm/${item.listingId}`
                        : `/listing/${item.listingId}`) as never,
                    );
                  }}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
