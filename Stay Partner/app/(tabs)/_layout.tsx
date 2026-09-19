import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/common';
import { layout } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { useStayRequests } from '@/services/hooks/useStayRequests';

/**
 * Four tabs: Today · Requests · Bookings · Profile. The design system
 * originally specced five, with Calendar between Bookings and Payouts, and
 * named the last tab "Menu" with a hamburger icon — both changed at the
 * user's request; see the build record's scope-changes panel. The screen
 * behind the last tab is still Settings, unchanged; only the tab's own icon
 * and label read differently now. The header stays white and flat and is
 * never coloured; the active tab is the only place the accent appears in
 * this bar.
 */
export default function TabsLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();

  /*
   * The badge, and the reason Requests is a tab at all.
   *
   * A booking request gives this owner THREE MINUTES. Until now the only
   * places it appeared were a card on the dashboard and a row in an inbox two
   * taps down, so an owner on Bookings or Profile had no standing indication
   * that anybody was waiting — the request simply expired and told the student
   * nobody answered.
   *
   * `unread` is the server's own count (requests still waiting on this owner,
   * newer than their read watermark), so the number here and the number the
   * inbox clears are the same fact rather than two that can drift.
   *
   * Same query key as every other caller, so this is not an extra poll —
   * react-query dedupes them onto the one `IncomingRequestAlert` already runs.
   */
  const { unread, groups } = useStayRequests();
  /* Fall back to what is actually pending. `unread` goes to zero the moment
     the inbox is opened, and a request still counting down after that is
     still somebody waiting — the dot has to outlast the badge. */
  const waiting = unread || groups.pending.length;

  const tab = (name: IconName) =>
    ({ color, focused }: { color: string; focused: boolean }) => (
      <Icon name={name} size={22} color={color} strokeWidth={focused ? 2.1 : 1.75} />
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FF5200',
        tabBarInactiveTintColor: c.textTertiary,
        tabBarStyle: {
          height: layout.tabBarHeight + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.borderSubtle,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.bold,
          fontSize: 10,
          lineHeight: 13,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tab('home') }} />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
          tabBarIcon: tab('bell'),
          /* Undefined rather than 0 — react-navigation renders a badge for any
             defined value, and an empty grey pill on a quiet inbox is a thing
             owners learn to ignore. */
          tabBarBadge: waiting > 0 ? (waiting > 9 ? '9+' : waiting) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: c.error,
            color: '#FFFFFF',
            fontFamily: fonts.bold,
            fontSize: 10,
            lineHeight: 13,
          },
        }}
      />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: tab('bookings') }} />
      {/* The Payouts tab is gone with the screens behind it — the app does not
          display payouts. Payout METHODS survive as a Profile row: a bank
          account is where referral money lands, which is a different thing from
          a payout history. */}
      <Tabs.Screen name="menu" options={{ title: 'Profile', tabBarIcon: tab('user') }} />
    </Tabs>
  );
}
