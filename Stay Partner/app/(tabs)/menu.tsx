import { Fragment, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Screen, Text, Card, Divider, Icon, Switch } from '@/components/ui';
import { layout } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Settings — the Menu tab's real root as of checkpoint 35. The dev
 * scaffolding that used to live here (a flat list of every built route) moved
 * below the real screen rather than disappearing outright — still useful for
 * jumping around to verify the finished build. It's labelled and comes out
 * before ship.
 */

const PROPERTY_NAME = 'Sea View Villa';

type NavRow = { label: string; href: Href };

const PROPERTY_ROWS: NavRow[] = [
  { label: `${PROPERTY_NAME} · details`, href: { pathname: '/settings/stub', params: { key: 'property' } } },
  { label: 'Rooms & amenities', href: { pathname: '/settings/stub', params: { key: 'rooms' } } },
  { label: 'Complaints', href: '/complaints' },
  { label: 'Share types', href: '/share-types' },
];

const ACCOUNT_ROWS: NavRow[] = [
  { label: 'Edit profile', href: { pathname: '/settings/stub', params: { key: 'profile' } } },
  { label: 'Payout methods', href: '/earnings/methods' },
  { label: 'Staff & permissions', href: '/staff' },
  { label: 'Refer & earn', href: '/referrals' },
];

type NotifKey = 'bookingRequests' | 'messages' | 'payouts' | 'marketingTips';

const NOTIF_ROWS: { key: NotifKey; label: string }[] = [
  { key: 'bookingRequests', label: 'Booking requests' },
  { key: 'messages', label: 'Messages' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'marketingTips', label: 'Marketing tips' },
];

// ── Dev scaffolding — nothing below this line is in the design set. ────────
// All 38 checkpoints are built as of this screen; nothing is pending anymore.

const QUICK_ACCESS: NavRow[] = [
  { label: 'Pricing', href: '/inventory/pricing' },
  { label: 'Reviews', href: '/reviews' },
  { label: 'Notifications', href: '/notifications' },
  { label: 'Support', href: '/support' },
  { label: 'Raise a dispute', href: '/support/dispute' },
];

const REFERENCES: NavRow[] = [
  { label: 'Design system', href: '/design-system' },
  { label: 'Splash', href: '/splash' },
  { label: 'Login', href: '/login' },
  { label: 'OTP verification', href: '/otp' },
  { label: 'Profile setup', href: '/profile-setup' },
  { label: 'Dashboard · empty', href: { pathname: '/', params: { state: 'empty' } } },
  { label: 'Dashboard · error', href: { pathname: '/', params: { state: 'error' } } },
  { label: 'Check-in · expired', href: { pathname: '/booking/checkin', params: { id: 'LB-1189', state: 'expired' } } },
  { label: 'Check-in · lockout', href: { pathname: '/booking/checkin', params: { id: 'LB-1189', state: 'lockout' } } },
  // Orphaned when the Payouts tab lost its "Total earnings" card and Recent
  // bookings list — the screen itself wasn't asked to go, so it stays reachable here.
  { label: 'Earnings breakdown', href: { pathname: '/earnings/breakdown', params: { period: 'week' } } },
];

export default function MenuTab() {
  const c = useColors();
  const router = useRouter();

  // Local and unread by any other screen — nothing else in the app reads a
  // notification preference, so there's nothing to subscribe.
  const [notifs, setNotifs] = useState<Record<NotifKey, boolean>>({
    bookingRequests: true,
    messages: true,
    payouts: true,
    marketingTips: false,
  });

  return (
    <Screen tabBarSpacing contentStyle={styles.stack} background="bg">
      <Text variant="screenTitle">Settings</Text>

      <SettingsSection title="Property">
        {PROPERTY_ROWS.map((r, i) => (
          <Fragment key={r.label}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => router.push(r.href)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text variant="bodySm">{r.label}</Text>
              <Icon name="chevron-right" size={16} color={c.textTertiary} />
            </Pressable>
          </Fragment>
        ))}
      </SettingsSection>

      <SettingsSection title="Notifications">
        {NOTIF_ROWS.map((r, i) => (
          <Fragment key={r.key}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.row}>
              <Text variant="bodySm">{r.label}</Text>
              <Switch
                value={notifs[r.key]}
                onChange={(next) => setNotifs((s) => ({ ...s, [r.key]: next }))}
                accessibilityLabel={r.label}
              />
            </View>
          </Fragment>
        ))}
      </SettingsSection>

      <SettingsSection title="Account">
        {ACCOUNT_ROWS.map((r, i) => (
          <Fragment key={r.label}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => router.push(r.href)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text variant="bodySm">{r.label}</Text>
              <Icon name="chevron-right" size={16} color={c.textTertiary} />
            </Pressable>
          </Fragment>
        ))}
      </SettingsSection>

      <Pressable
        onPress={() => router.replace('/login')}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.logout,
          { backgroundColor: c.surface, borderColor: c.borderCard, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text variant="bodySm" color="error" style={styles.logoutLabel}>
          Log out
        </Text>
      </Pressable>

      <Text variant="overline" color="textTertiary" style={styles.overline}>
        Quick access (dev)
      </Text>
      <Card padded={false}>
        {QUICK_ACCESS.map((r, i) => (
          <Fragment key={r.label}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => router.push(r.href)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text variant="bodySm">{r.label}</Text>
              <Icon name="chevron-right" size={16} color={c.textTertiary} />
            </Pressable>
          </Fragment>
        ))}
      </Card>

      <Text variant="overline" color="textTertiary" style={styles.overline}>
        Build reference
      </Text>
      <Card padded={false}>
        {REFERENCES.map((r, i) => (
          <Fragment key={r.label}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => router.push(r.href)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text variant="bodySm">{r.label}</Text>
              <Icon name="chevron-right" size={16} color={c.textTertiary} />
            </Pressable>
          </Fragment>
        ))}
      </Card>
      <Text variant="caption" color="textTertiary" style={styles.note}>
        Scaffolding for review. All of it comes out before ship.
      </Text>
    </Screen>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text variant="overline" color="textTertiary" style={styles.overline}>
        {title}
      </Text>
      <Card padded={false}>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 4 },
  overline: {
    marginTop: 8,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: layout.touchMin,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logout: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  logoutLabel: { fontFamily: fonts.semibold },
  note: {
    marginTop: 8,
  },
});
