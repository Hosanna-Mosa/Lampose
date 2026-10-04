import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Switch, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { FoodNotice, FoodSectionHeader } from '@/components/food';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { ALLERGENS } from '@/types/food';

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

        {/* No diet or spice defaults: neither reached anything — diet was only
            echoed on the Home card, and every dish hides the spice picker
            because no kitchen screen shows it. Veg-only and the allergen flags
            below are the preferences that act. */}
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
                /* Turning this off from here has to leave veg mode fully off,
                   not just item-level — Home's pure-veg-kitchens mode also
                   sets `vegOnly`, and a plain switch that only ever touched
                   its own field would leave `vegRestaurantsOnly` stranded
                   true, ready to silently re-filter kitchens the next time
                   this switch is turned back on from here. */
                onChange={(value) => setPreferences({ vegOnly: value, ...(value ? null : { vegRestaurantsOnly: false }) })}
              />
            </View>

            {/* No "Default to pickup": pickup is not offered, so it saved nothing. */}
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
