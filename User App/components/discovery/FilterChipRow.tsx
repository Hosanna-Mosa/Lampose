import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

export type FilterChip = {
  id: string;
  label: string;
  active?: boolean;
  /** Active chips that carry a value can be cleared from the chip itself. */
  clearable?: boolean;
};

export const DEFAULT_FILTER_ORDER: readonly string[] = [
  'gender',
  'rent',
  'sharing',
  'furnishing',
  'meals',
  'deposit',
  'distance',
  'attachedBath',
  'ac',
  'parking',
  'gym',
];

const CHIP_ICON_MAP: Record<string, IconName> = {
  gender: 'visitors',
  rent: 'rupee',
  sharing: 'sharing',
  furnishing: 'furnished',
  meals: 'mess',
  deposit: 'rupee',
  ac: 'ac',
  parking: 'parking',
  gym: 'gym',
  attachedBath: 'attachedBath',
};

export type FilterChipRowProps = {
  chips: readonly FilterChip[];
  onPressChip: (id: string) => void;
  onClearChip?: (id: string) => void;
  onPressFilters: () => void;
  activeCount?: number;
  activeDropdownId?: string | null;
};

export function FilterChipRow({
  chips,
  onPressChip,
  onClearChip,
  onPressFilters,
  activeCount = 0,
  activeDropdownId,
}: FilterChipRowProps) {
  const { colors, space, radius, layout, touch, mode } = useTheme();

  return (
    <View
      style={[
        styles.host,
        {
          backgroundColor: colors.surface,
          borderBottomColor: mode === 'dark' ? colors.borderSubtle : '#F1F5F9',
          gap: space[2],
        },
      ]}
    >
      {/* Primary "Filters" Button */}
      <Pressable
        onPress={onPressFilters}
        accessibilityRole="button"
        accessibilityLabel={activeCount ? `Filters, ${activeCount} active` : 'Filters'}
        style={({ pressed }) => [
          styles.filtersButton,
          {
            minHeight: 32,
            marginLeft: layout.gutter,
            borderRadius: radius.pill,
            borderColor: activeCount > 0 ? (mode === 'dark' ? '#34D399' : '#0F4C3A') : '#E2E8F0',
            borderWidth: 1,
            backgroundColor: activeCount > 0 && mode !== 'dark' ? '#E8F5E9' : colors.surface,
            paddingHorizontal: space[2] + 2,
            gap: 5,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
        hitSlop={{ top: (touch.min - 32) / 2, bottom: (touch.min - 32) / 2 }}
      >
        <Icon
          name="filters"
          size={14}
          color={activeCount > 0 ? (mode === 'dark' ? '#34D399' : '#0F4C3A') : colors.textPrimary}
        />
        <Text
          variant="bodyStrong"
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: activeCount > 0 ? (mode === 'dark' ? '#34D399' : '#0F4C3A') : colors.textPrimary,
          }}
        >
          Filters
        </Text>
        {activeCount > 0 ? (
          <View
            style={[
              styles.count,
              {
                borderRadius: radius.pill,
                backgroundColor: mode === 'dark' ? '#34D399' : '#0F4C3A',
                paddingHorizontal: 5,
              },
            ]}
          >
            <Text variant="numMeta" style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
              {activeCount}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {/* Dimension Chips with Icon, Label, and Dropdown Chevron */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: layout.gutter, gap: space[2], alignItems: 'center' }}
      >
        {chips.map((chip) => {
          const iconName = CHIP_ICON_MAP[chip.id];
          const isSelected = Boolean(chip.active);
          const isDropdownOpen = activeDropdownId === chip.id;
          const isHighlighted = isSelected || isDropdownOpen;

          return (
            <Pressable
              key={chip.id}
              onPress={() => onPressChip(chip.id)}
              style={({ pressed }) => [
                styles.chipButton,
                {
                  minHeight: 32,
                  borderRadius: radius.pill,
                  backgroundColor: isHighlighted && mode !== 'dark' ? '#E8F5E9' : colors.surface,
                  borderColor: isHighlighted ? (mode === 'dark' ? '#34D399' : '#0F4C3A') : '#E2E8F0',
                  borderWidth: isDropdownOpen ? 1.5 : 1,
                  paddingLeft: iconName ? space[2] + 2 : space[3],
                  paddingRight: space[2] + 2,
                  gap: 5,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${chip.label} filter`}
            >
              {iconName ? (
                <Icon
                  name={iconName}
                  size={14}
                  color={isHighlighted ? (mode === 'dark' ? '#34D399' : '#0F4C3A') : colors.textSecondary}
                />
              ) : null}

              <Text
                variant="bodyStrong"
                style={{
                  fontSize: 12,
                  fontWeight: isHighlighted ? '700' : '500',
                  color: isHighlighted ? (mode === 'dark' ? '#34D399' : '#0F4C3A') : colors.textPrimary,
                }}
              >
                {chip.label}
              </Text>

              {isSelected && chip.clearable && onClearChip && !isDropdownOpen ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onClearChip(chip.id);
                  }}
                  hitSlop={6}
                  style={styles.removeCircle}
                >
                  <Icon name="close" size={12} color={colors.textSecondary} />
                </Pressable>
              ) : (
                <Text
                  style={
                    isDropdownOpen
                      ? [styles.chevron, { color: mode === 'dark' ? '#34D399' : '#0F4C3A' }]
                      : styles.chevron
                  }
                >
                  {isDropdownOpen ? '⌃' : '⌵'}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filtersButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  count: {
    minHeight: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  removeCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  chevron: {
    fontSize: 11,
    color: '#64748B',
    marginTop: -2,
    fontWeight: '600',
  },
});
