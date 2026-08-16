import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip, Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

export type FilterChip = {
  id: string;
  label: string;
  active?: boolean;
  /** Active chips that carry a value can be cleared from the chip itself. */
  clearable?: boolean;
};

/**
 * The default chip order.
 *
 * Ordered by how often each one changes a result set, not alphabetically. Rent
 * and sharing move the list most, so they sit where the thumb starts; gym is
 * last because almost nobody filters on it and it never empties a list.
 */
export const DEFAULT_FILTER_ORDER: readonly string[] = [
  'rent',
  'sharing',
  'gender',
  'deposit',
  'meals',
  'distance',
  'attachedBath',
  'ac',
  'parking',
  'gym',
];

export type FilterChipRowProps = {
  chips: readonly FilterChip[];
  onPressChip: (id: string) => void;
  onClearChip?: (id: string) => void;
  onPressFilters: () => void;
  /** Active filter count. Brand, not red — five filters is a state, not a problem. */
  activeCount?: number;
};

/**
 * Sticky under the search header.
 *
 * The Filters button is first and never scrolls out of reach: a user who has
 * over-filtered themselves into an empty list needs the way out to be where
 * they last saw it, not two swipes to the left.
 */
export function FilterChipRow({
  chips,
  onPressChip,
  onClearChip,
  onPressFilters,
  activeCount = 0,
}: FilterChipRowProps) {
  const { colors, space, radius, layout, touch } = useTheme();

  return (
    <View
      style={[
        styles.host,
        { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle, gap: space[2] },
      ]}
    >
      <Pressable
        onPress={onPressFilters}
        accessibilityRole="button"
        accessibilityLabel={activeCount ? `Filters, ${activeCount} active` : 'Filters'}
        style={[
          styles.filtersButton,
          {
            minHeight: 40,
            marginLeft: layout.gutter,
            borderRadius: radius.pill,
            borderColor: activeCount ? colors.brand : colors.border,
            borderWidth: activeCount ? 1.5 : 1,
            backgroundColor: colors.surface,
            paddingHorizontal: space[3],
            gap: space[2],
          },
        ]}
        hitSlop={{ top: (touch.min - 40) / 2, bottom: (touch.min - 40) / 2 }}
      >
        <Icon name="filters" size={20} color={activeCount ? colors.brandInk : colors.textPrimary} />
        <Text variant="bodyStrong" style={{ color: activeCount ? colors.brandInk : colors.textPrimary }}>
          Filters
        </Text>
        {activeCount ? (
          <View
            style={[
              styles.count,
              { borderRadius: radius.pill, backgroundColor: colors.brandTint, paddingHorizontal: space[2] },
            ]}
          >
            <Text variant="numMeta" style={{ color: colors.info.ink }}>
              {activeCount}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: layout.gutter, gap: space[2] }}
      >
        {chips.map((chip) => (
          <Chip
            key={chip.id}
            label={chip.label}
            selected={chip.active}
            onPress={() => onPressChip(chip.id)}
            onRemove={chip.active && chip.clearable && onClearChip ? () => onClearChip(chip.id) : undefined}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filtersButton: { flexDirection: 'row', alignItems: 'center' },
  count: { minHeight: 20, alignItems: 'center', justifyContent: 'center' },
});
