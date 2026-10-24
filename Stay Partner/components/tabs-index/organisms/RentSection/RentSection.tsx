import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Icon } from '@/components/common/atoms/Icon';
import { useColors } from '@/hooks/useColors';
import { useRentOverview } from '@/services/hooks/useRent';
import { RentHero } from '../RentHero/RentHero';
import { RentActionsGrid } from '../RentActionsGrid/RentActionsGrid';

/**
 * Rent & Residents, on the home screen — residents, the rent they owe, what
 * they paid, beds and reminders, from one grid.
 *
 * Rent is recorded, never collected: owners take it in cash or UPI and mark it
 * here. Nothing in this section moves money or touches payouts.
 *
 * Fetches its own numbers, so the rest of the dashboard never waits on them;
 * the Today screen's pull-to-refresh refreshes them through the same query.
 */
export function RentSection() {
  const c = useColors();
  const router = useRouter();
  const { overview, isLoading, refetch } = useRentOverview();

  /* Back from recording a payment, the tiles must already say so. */
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const counts = overview?.counts;
  const toCollect = (counts?.overdueAmount ?? 0) + (counts?.dueTodayAmount ?? 0);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Rent & Residents</Text>

      <RentHero
        toCollect={toCollect}
        collected={overview?.collectedThisMonth.amount ?? 0}
        month={overview?.collectedThisMonth.month ?? null}
        loading={isLoading}
      />

      {/* Residents with no rent known have no months to show anywhere else —
          this is the one place that says so before the owner wonders why. */}
      {counts && counts.needsRent > 0 ? (
        <Pressable
          onPress={() => router.push('/rent/residents' as never)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.banner,
            { borderColor: c.warningFill, backgroundColor: c.warningTint, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Icon name="alert-circle" size={20} color={c.warningInk} />
          <View style={styles.flex}>
            <Text style={[styles.bannerTitle, { color: c.warningInk }]}>
              {counts.needsRent} resident{counts.needsRent === 1 ? ' has' : 's have'} no rent set
            </Text>
            <Text style={[styles.bannerBody, { color: c.warningInk }]}>
              Set their monthly rent to start tracking what they owe.
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color={c.warningInk} />
        </Pressable>
      ) : null}

      <RentActionsGrid overview={overview} />
    </View>
  );
}

/* Section title as the Quick Actions grid draws its own. */
const styles = StyleSheet.create({
  container: { width: '100%', gap: 12 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  flex: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700' },
  bannerBody: { fontSize: 12.5, marginTop: 2 },
});
