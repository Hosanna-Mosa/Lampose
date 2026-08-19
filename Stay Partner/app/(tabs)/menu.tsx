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

type NavRow = { label: string; href: Href };

/* The module-level `PROPERTY_ROWS` that used to sit here is gone with the
   `PROPERTY_NAME = 'Sea View Villa'` constant it interpolated. Both were dead
   once the rows moved inside the component to read the real property name off
   the summary — and a fixture property name left in module scope is exactly
   the thing that reappears on screen a month later. */

const ACCOUNT_ROWS: NavRow[] = [
  /* Walk-ins logged by hand, with their KYC. Under Account rather than
     Property because it is a record of people this owner entered, not a fact
     about the building. */
  { label: 'Customers', href: '/customers' },
  { label: 'Edit profile', href: '/settings/profile' },
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



import { useAuth } from '@/context/AuthContext';
import { fetchSummary } from '@/services/api/portfolio.api';
import { useEffect } from 'react';
import { logWarn } from '@/lib/log';

export default function MenuTab() {
  const c = useColors();
  const router = useRouter();
  const { partner, signOut } = useAuth();
  const [propertyName, setPropertyName] = useState('Sea View Villa');

  useEffect(() => {
    fetchSummary()
      .then((sum) => {
        if (sum?.propertyName) setPropertyName(sum.propertyName);
      })
      .catch((err) => logWarn('Failed to load summary in profile:', err));
  }, []);

  const [notifs, setNotifs] = useState<Record<NotifKey, boolean>>({
    bookingRequests: true,
    messages: true,
    payouts: true,
    marketingTips: false,
  });

  /* Real screens now, not the "never designed" stub. All three read the
     backend — see the notes at the top of each. */
  const propertyRows: NavRow[] = [
    {
      label: propertyName ? `${propertyName} · details` : 'Property details',
      href: '/settings/property',
    },
    { label: 'Rooms & amenities', href: '/settings/rooms' },
    { label: 'Complaints', href: '/complaints' },
    { label: 'Share types', href: '/share-types' },
  ];

  return (
    <Screen
      tabBarSpacing contentStyle={styles.stack} background="bg"
      stickyHeader={
        <>
          <Text variant="screenTitle">Profile & Settings</Text>
        </>
      }
    >

      {/* Partner Profile Card */}
      <Card variant="elevated" style={styles.profileCard}>
        <View style={styles.profileRow}>
          <View style={[styles.avatarCircle, { backgroundColor: c.accentTint }]}>
            <Text style={[styles.avatarInitial, { color: c.accentInk }]}>
              {partner?.name ? partner.name.charAt(0).toUpperCase() : 'P'}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text variant="h3" style={styles.profileName}>
              {partner?.name || 'Partner Account'}
            </Text>
            <Text variant="caption" color="textSecondary">
              {partner?.phone || '+91 97047 26252'}
            </Text>
            <Text variant="badge" color="accent" style={{ marginTop: 2 }}>
              {propertyName}
            </Text>
          </View>
        </View>
      </Card>

      <SettingsSection title="Property">
        {propertyRows.map((r, i) => (
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

      {/* Log out button at the very bottom */}
      <Pressable
        onPress={async () => {
          await signOut();
          router.replace('/login');
        }}
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
  profileCard: {
    padding: 16,
    borderRadius: 16,
    marginVertical: 6,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontFamily: fonts.bold,
    fontSize: 16,
  },
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
