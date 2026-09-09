import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { VegMode } from '@/types/food';

import { DietMark } from './FoodMarks';

/**
 * The two shapes "veg only" can take, asked as a real choice rather than
 * folded into one switch.
 *
 * `items` is the mode this module has always had — hide non-veg dishes,
 * touch nothing about which kitchens show up ("veg-only never hides a
 * kitchen, only dishes"). `restaurants` is stricter and new: hide every
 * kitchen that cooks anything non-veg at all, for the student who wants a
 * pure-veg counter rather than a veg plate from a kitchen that also fries
 * chicken. Neither is the "right" one — a diner who only trusts kitchens
 * with no meat on the premises wants the second; most people want the first
 * — so the tap asks rather than guessing.
 */
const OPTIONS: readonly { mode: Exclude<VegMode, 'off'>; label: string; body: string }[] = [
  {
    mode: 'items',
    label: 'Veg items, any kitchen',
    body: 'Hides non-veg dishes. Kitchens that also cook non-veg still show up for their veg dishes.',
  },
  {
    mode: 'restaurants',
    label: 'Pure veg kitchens only',
    body: 'Hides every kitchen that cooks anything non-veg, even for the dishes that are veg.',
  },
];

export type VegModeSheetProps = {
  visible: boolean;
  onClose: () => void;
  onChoose: (mode: Exclude<VegMode, 'off'>) => void;
};

export function VegModeSheet({ visible, onClose, onChoose }: VegModeSheetProps) {
  const { colors, space, touch } = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Switch on veg mode">
      <View accessibilityRole="radiogroup" accessibilityLabel="Veg mode" style={{ paddingBottom: space[3] }}>
        {OPTIONS.map((option, index) => (
          <Pressable
            key={option.mode}
            onPress={() => onChoose(option.mode)}
            accessibilityRole="radio"
            accessibilityState={{ selected: false }}
            accessibilityLabel={`${option.label}. ${option.body}`}
            style={({ pressed }) => [
              styles.row,
              {
                minHeight: touch.listRow,
                paddingVertical: space[3],
                gap: space[3],
                borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: colors.borderSubtle,
                backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
              },
            ]}
          >
            <DietMark diet="veg" size={16} />
            <View style={styles.flex}>
              <Text variant="bodyLg">{option.label}</Text>
              <Text variant="caption" color="secondary">
                {option.body}
              </Text>
            </View>
            <Icon name="chevronRight" size={16} color={colors.textTertiary} />
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
