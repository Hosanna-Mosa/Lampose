/* ══════════════════════════════════════════════════════════════════════════
   Where Lampose delivers.

   The other end of the admin console's Service Zones page: an administrator
   draws a shape, and this is where a diner reads it. Nothing here is
   hardcoded — the list is `GET /api/v2/zones`, which needs no account, so a
   student can answer "do you even come to my block" before signing up.

   ## A list, not a map

   This app has no maps library and no `react-native-svg`, and adding a native
   module so a rarely-opened screen can draw an outline would be a rebuild for
   every user to gain a picture nobody navigates by. The useful facts about a
   zone are its NAME, how big it is, and when it is open — and those are words.
   The rider app draws the shape, because a rider genuinely needs to see where
   the edge is; a diner needs to know whether their hostel is named.
   ══════════════════════════════════════════════════════════════════════════ */
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { FoodNotice } from '@/components/food';
import { useTheme } from '@/context/ThemeContext';
import { fetchZones, type ServiceZone } from '@/services/api/zones.api';

export default function DeliveryAreaScreen() {
  const { colors, space, radius, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setZones(await fetchZones('food'));
    } catch (err) {
      setError((err as Error)?.message || 'We could not load the delivery area.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Where we deliver" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingBottom: insets.bottom + space[8],
          gap: space[3],
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
      >
        <Text variant="body" color="secondary">
          These are the areas Lampose currently delivers to. They change as we grow — pull down
          to check again.
        </Text>

        {!!error && <FoodNotice tone="deadline" title="Could not load" body={error} />}

        {loading ? (
          <Text variant="body" color="tertiary">
            Loading…
          </Text>
        ) : zones.length === 0 ? (
          <FoodNotice
            tone="info"
            title="No areas are published yet"
            body="Delivery is not limited by area at the moment. If an address will not take an order, it is for another reason."
          />
        ) : (
          zones.map((zone) => (
            <View
              key={zone.zoneId}
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius.card,
                  padding: space[4],
                  gap: space[1],
                },
              ]}
            >
              <Text variant="title3">{zone.name}</Text>
              <Text variant="numMeta" color="tertiary">
                {zone.type === 'circle' && zone.radius
                  ? `About ${(zone.radius / 1000).toFixed(1)} km across the centre`
                  : 'A mapped neighbourhood'}
              </Text>
              {/* Said only when there IS a restriction. A zone that is open all
                  day should not carry a line implying it might not be. */}
              {!!zone.activeHours.start && (
                <Text variant="numMeta" color="tertiary">
                  Open {zone.activeHours.start} – {zone.activeHours.end}
                </Text>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
});
