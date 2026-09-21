import { Fragment, useState, type ReactNode } from 'react';
import { Box, Tappable } from '@/components/common';
import { useRouter, type Href } from 'expo-router';
import { Screen, Text, Card, Divider, Icon } from '@/components/common';
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

import { useAuth } from '@/context/AuthContext';
import { fetchSummary } from '@/services/api/portfolio.api';
import { useEffect } from 'react';
import { logWarn } from '@/lib/log';
import { SettingsSection } from '@/components/tabs-menu/molecules/SettingsSection/SettingsSection';
import { styles } from '@/components/tabs-menu/styles';

export function MenuTabScreen() {
  const c = useColors();
  const router = useRouter();
  const { partner, signOut } = useAuth();
  /* Null until the summary answers. This was seeded with 'Sea View Villa' —
     the fixture property — so every owner opened Profile & Settings and saw
     somebody else's listing named as theirs for as long as the request took,
     and permanently if it failed. */
  const [propertyName, setPropertyName] = useState<string | null>(null);

  useEffect(() => {
    fetchSummary()
      .then((sum) => {
        if (sum?.propertyName) setPropertyName(sum.propertyName);
      })
      .catch((err) => logWarn('Failed to load summary in profile:', err));
  }, []);

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
        <Box style={styles.profileRow}>
          <Box style={[styles.avatarCircle, { backgroundColor: c.accentTint }]}>
            <Text style={[styles.avatarInitial, { color: c.accentInk }]}>
              {partner?.name ? partner.name.charAt(0).toUpperCase() : 'P'}
            </Text>
          </Box>
          <Box style={styles.profileInfo}>
            <Text variant="h3" style={styles.profileName}>
              {partner?.name || 'Partner Account'}
            </Text>
            {/* No fallback number. This read '+91 97047 26252' — a real
                developer's phone, baked in — so an owner whose profile had not
                loaded was shown somebody else's number as their own. */}
            {partner?.phone ? (
              <Text variant="caption" color="textSecondary">
                {partner.phone}
              </Text>
            ) : null}
            {propertyName ? (
              <Text variant="badge" color="accent" style={{ marginTop: 2 }}>
                {propertyName}
              </Text>
            ) : null}
          </Box>
        </Box>
      </Card>

      <SettingsSection title="Property">
        {propertyRows.map((r, i) => (
          <Fragment key={r.label}>
            {i > 0 ? <Divider /> : null}
            <Tappable
              onPress={() => router.push(r.href)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text variant="bodySm" style={styles.rowLabel}>{r.label}</Text>
              <Icon name="chevron-right" size={16} color={c.textTertiary} />
            </Tappable>
          </Fragment>
        ))}
      </SettingsSection>

      <SettingsSection title="Account">
        {ACCOUNT_ROWS.map((r, i) => (
          <Fragment key={r.label}>
            {i > 0 ? <Divider /> : null}
            <Tappable
              onPress={() => router.push(r.href)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text variant="bodySm" style={styles.rowLabel}>{r.label}</Text>
              <Icon name="chevron-right" size={16} color={c.textTertiary} />
            </Tappable>
          </Fragment>
        ))}
      </SettingsSection>

      {/* Log out button at the very bottom */}
      <Tappable
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
      </Tappable>
    </Screen>
  );
}

