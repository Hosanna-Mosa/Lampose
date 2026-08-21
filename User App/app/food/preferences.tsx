import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Switch, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { DietMark, FoodNotice, FoodSectionHeader } from '@/components/food';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import type { Diet, SpiceLevel } from '@/types/food';
import { ALLERGENS, SPICE_LABEL } from '@/types/food';

const DIETS: readonly { id: Diet; label: string; consequence: string }[] = [
  { id: 'veg', label: 'Veg', consequence: 'Feeds and search open on veg' },
  { id: 'egg', label: 'Veg and egg', consequence: 'Egg dishes are shown, non-veg is not pre-selected' },
  { id: 'nonveg', label: 'Everything', consequence: 'Nothing is pre-filtered' },
];

const SPICES: readonly SpiceLevel[] = ['mild', 'medium', 'hot'];

/**
 * Food preferences.
 *
 * These are DEFAULTS, not limits, and the screen says so twice — once in a
 * strip at the top and once beside the allergens. It is said twice because the
 * failure it prevents is expensive and silent: a student who believes veg-only
 * hides non-veg will order at the wrong kitchen once, and after that will not
 * trust any filter in the app.
 *
 * Allergens are FLAGGED, never removed. The data comes from kitchens with four
 * staff and no nutritionist; hiding food on the strength of it would be a
 * promise the data cannot keep, and a dish that quietly never appears is a
 * promise a student cannot check.
 */
export default function FoodPreferencesScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preferences, setPreferences } = useFood();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Food preferences" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8], gap: space[4] }}>
        <FoodNotice
          tone="info"
          title="These set your defaults, not your limits"
          body="Every kitchen still shows its full menu. We pre-select these on dish pages and warn you when something clashes."
        />

        <View>
          <FoodSectionHeader title="Default diet" />
          <View
            style={[
              styles.group,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
            ]}
          >
            {DIETS.map((entry, index) => {
              const selected = preferences.diet === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => setPreferences({ diet: entry.id })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${entry.label}. ${entry.consequence}`}
                  style={[
                    styles.row,
                    {
                      paddingVertical: space[3],
                      gap: space[3],
                      borderBottomWidth: index === DIETS.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: colors.borderSubtle,
                    },
                  ]}
                >
                  <DietMark diet={entry.id === 'nonveg' ? 'nonveg' : entry.id === 'egg' ? 'egg' : 'veg'} size={15} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="title3">{entry.label}</Text>
                    <Text variant="caption" color="tertiary" numberOfLines={2}>
                      {entry.consequence}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: selected ? colors.brand : colors.borderInput, borderWidth: selected ? 6 : 1.5 },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <FoodSectionHeader title="Spice level" />
          <View style={[styles.spiceRow, { gap: space[2] }]}>
            {SPICES.map((level) => {
              const active = preferences.spice === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => setPreferences({ spice: level })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.spiceChip,
                    {
                      borderRadius: radius.button,
                      backgroundColor: active ? colors.graphite : colors.surface,
                      borderColor: active ? colors.graphite : colors.border,
                    },
                  ]}
                >
                  <Text variant="title3" style={{ color: active ? colors.onGraphite : colors.textSecondary }}>
                    {SPICE_LABEL[level]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="caption" color="tertiary" style={{ marginTop: space[2] }}>
            We pass this to the kitchen with every order. Some dishes cannot be changed, and those say so.
          </Text>
        </View>

        <View>
          <FoodSectionHeader title="Tell me if it contains" trailing={`${preferences.allergens.length} flagged`} />
          <View style={[styles.chipWrap, { gap: space[2] }]}>
            {ALLERGENS.map((allergen) => {
              const active = preferences.allergens.includes(allergen);
              return (
                <Pressable
                  key={allergen}
                  onPress={() =>
                    setPreferences({
                      allergens: active
                        ? preferences.allergens.filter((entry) => entry !== allergen)
                        : [...preferences.allergens, allergen],
                    })
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                  style={[
                    styles.allergenChip,
                    {
                      borderRadius: radius.pill,
                      paddingHorizontal: space[3],
                      backgroundColor: active ? colors.graphite : colors.surface,
                      borderColor: active ? colors.graphite : colors.border,
                    },
                  ]}
                >
                  <Text variant="label" style={{ color: active ? colors.onGraphite : colors.textSecondary, letterSpacing: 0.3 }}>
                    {allergen}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ marginTop: space[3] }}>
            <FoodNotice
              tone="deadline"
              title="Flagged, not removed"
              body="Allergen data comes from the kitchen and is not complete. We warn you on the dish page rather than hiding the dish, because hiding it would be a promise this data cannot keep."
            />
          </View>
        </View>

        <View>
          <FoodSectionHeader title="Ordering" />
          <View
            style={[
              styles.group,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
            ]}
          >
            <View style={[styles.row, { paddingVertical: space[3], gap: space[3] }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="title3">Show veg food only</Text>
                <Text variant="caption" color="tertiary">
                  A filter, not a default — it hides non-veg from every feed and search
                </Text>
              </View>
              <Switch
                label="Show veg food only"
                value={preferences.vegOnly}
                onChange={(value) => setPreferences({ vegOnly: value })}
              />
            </View>

            <View
              style={[
                styles.row,
                { paddingVertical: space[3], gap: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="title3">Default to pickup</Text>
                <Text variant="caption" color="tertiary">
                  Saves the delivery fee on every meal — you collect at the counter
                </Text>
              </View>
              <Switch
                label="Default to pickup"
                value={preferences.defaultPickup}
                onChange={(value) => setPreferences({ defaultPickup: value })}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center' },
  radio: { width: 20, height: 20, borderRadius: 999 },
  spiceRow: { flexDirection: 'row' },
  spiceChip: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  allergenChip: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
