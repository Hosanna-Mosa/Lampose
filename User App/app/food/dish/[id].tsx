import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StandardHeader } from '@/components/shell';
import { FoodEmptyState, FoodMenuSkeleton } from '@/components/food';
import { DishCommitBar, DishDetailContent, useDishChoices } from '@/components/food/DishDetail';
import { useTheme } from '@/context/ThemeContext';
import type { Dish, Kitchen } from '@/types/food';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import { useDish } from '@/services/hooks/useFood';
import { useBottomEdgeInset } from '@/hooks/useActionBarInset';

/**
 * One dish, as a page of its own — reached from the home rails, search and
 * links. A kitchen's menu opens the same content as a sheet instead; both are
 * `components/food/DishDetail.tsx`, which explains the choices on it.
 */
export default function DishScreen() {
  const { findDish, findKitchen, kitchenOpen, loading, loadingMenus, refetch } = useFoodCatalogue();
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  /*
   * The feed is scoped to where the student is, so a dish opened from an old
   * order, a favourite or a link can belong to a kitchen it never listed. It
   * is then asked for by id, which answers with the dish AND its kitchen.
   * Only asked when the catalogue cannot answer, so a listed dish costs
   * nothing extra.
   */
  const listedDish = id ? findDish(id) : undefined;
  const listedKitchen = listedDish ? findKitchen(listedDish.kitchenId) : undefined;
  const fallback = useDish(!listedKitchen && !loading && !loadingMenus ? id : null);
  const dish = listedKitchen ? listedDish : fallback.data?.dish;
  const kitchen = listedKitchen ?? fallback.data?.kitchen;

  if ((!dish || !kitchen) && (loading || loadingMenus || fallback.isLoading)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Dish" onBack={() => router.back()} />
        <FoodMenuSkeleton />
      </View>
    );
  }

  if (!dish || !kitchen) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Dish" onBack={() => router.back()} />
        <FoodEmptyState
          title="This dish is off the menu"
          body="It may have been delisted. The rest of this kitchen's menu is still here."
          primaryLabel="Back"
          onPrimary={() => router.back()}
        />
      </View>
    );
  }

  return (
    <DishPage
      dish={dish}
      kitchen={kitchen}
      open={kitchenOpen(kitchen)}
      refreshing={loading || loadingMenus}
      onRefresh={refetch}
    />
  );
}

/** The loaded page. Its own component so the choices hook only ever runs with a dish. */
function DishPage({
  dish,
  kitchen,
  open,
  refreshing,
  onRefresh,
}: {
  dish: Dish;
  kitchen: Kitchen;
  open: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { colors, space, layout, mode } = useTheme();
  /* Nothing on a handset that reports a real inset; the shortfall on one
     that reports none, so the action clears the navigation bar. */
  const actionInset = useBottomEdgeInset();
  const router = useRouter();
  const choices = useDishChoices(dish, kitchen, open);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title={kitchen.name} onBack={() => router.back()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[4] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <DishDetailContent dish={dish} open={open} choices={choices} />
      </ScrollView>

      <View
        style={[
          styles.cta,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: space[6] + actionInset,
          },
        ]}
      >
        <DishCommitBar dish={dish} choices={choices} onCommitted={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cta: { borderTopWidth: StyleSheet.hairlineWidth },
});
