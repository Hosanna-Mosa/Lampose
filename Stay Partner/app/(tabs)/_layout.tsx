import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui';
import { layout } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Four tabs: Today · Bookings · Payouts · Profile. The design system
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

  const tab = (name: IconName) =>
    ({ color, focused }: { color: string; focused: boolean }) => (
      <Icon name={name} size={22} color={color} strokeWidth={focused ? 2.1 : 1.75} />
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
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
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: tab('bookings') }} />
      {/* The Payouts tab is gone with the screens behind it — the app does not
          display payouts. Payout METHODS survive as a Profile row: a bank
          account is where referral money lands, which is a different thing from
          a payout history. */}
      <Tabs.Screen name="menu" options={{ title: 'Profile', tabBarIcon: tab('user') }} />
    </Tabs>
  );
}
