import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { NotificationRow } from '@/components/lifecycle';
import { notificationDays, unreadCount } from '@/data/support';
import { emptyStates } from '@/constants/copy';
import { useTheme } from '@/context/ThemeContext';

/**
 * Screen 63 — the alerts inbox.
 *
 * Grouped by day, because the question asked of this screen is almost always
 * temporal: "when did that refund land", "did she reply today". A flat
 * reverse-chronological list answers it only by making the reader count.
 *
 * Money items are typeset differently from activity ones — see
 * `NotificationRow`. That distinction is the whole reason this screen is worth
 * more than the OS notification tray, which loses everything after a week.
 *
 * "Mark all read" is a header action rather than a button in the flow, and it
 * is the only bulk action offered. Bulk *delete* is deliberately absent: these
 * are the receipts of a tenancy, and a student who clears them on a bad day
 * loses the record of when they were told the rent was due.
 */
export default function Notifications() {
  const { colors, space, layout, mode } = useTheme();
  const router = useRouter();

  const [days, setDays] = useState(notificationDays);
  const unread = unreadCount(days);

  const markAllRead = () =>
    setDays((current) =>
      current.map((day) => ({
        ...day,
        items: day.items.map((item) => ({ ...item, unread: false })),
      })),
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Alerts"
        subtitle={unread > 0 ? `${unread} unread` : undefined}
        onBack={() => router.back()}
        actionLabel={unread > 0 ? 'Mark all read' : undefined}
        onAction={unread > 0 ? markAllRead : undefined}
      />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: layout.gutter,
          gap: space[5],
          paddingBottom: space[8],
        }}
      >
        {days.length === 0 ? (
          <StateTemplate
            copy={emptyStates.noSaved()}
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
                  notification={item}
                  onPress={() => {
                    // Reading one marks only that one. A tap is not consent to
                    // clear the rest.
                    setDays((current) =>
                      current.map((d) => ({
                        ...d,
                        items: d.items.map((n) =>
                          n.id === item.id ? { ...n, unread: false } : n,
                        ),
                      })),
                    );
                    if (item.kind === 'support') router.push('/support');
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
