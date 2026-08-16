import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { SORT_LABEL, type SortKey } from '@/types/filters';

/**
 * Sort — one decision, so it applies on tap and closes.
 *
 * There is no Apply button. A sort is a single choice with an immediately
 * visible result, and asking someone to confirm it adds a step to a gesture
 * that was already complete. That is the opposite of the filter sheet, where
 * the commit is deliberate because a dozen controls change at once.
 */

const ORDER: readonly SortKey[] = ['recommended', 'rentLow', 'depositLow'];

const EXPLAINER: Record<SortKey, string> = {
  recommended: 'Complete listings with real photos first.',
  rentLow: 'Cheapest monthly rent at the top.',
  depositLow: 'Smallest deposit first — a separate constraint from rent.',
};

export type SortSheetProps = {
  visible: boolean;
  value: SortKey;
  onChange: (sort: SortKey) => void;
  onClose: () => void;
};

export function SortSheet({ visible, value, onChange, onClose }: SortSheetProps) {
  const { colors, space, touch } = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sort">
      <View accessibilityRole="radiogroup" accessibilityLabel="Sort results" style={{ paddingBottom: space[3] }}>
        {ORDER.map((key, index) => {
          const active = key === value;
          return (
            <Pressable
              key={key}
              onPress={() => {
                onChange(key);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${SORT_LABEL[key]}. ${EXPLAINER[key]}`}
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
              <View style={styles.flex}>
                <Text variant={active ? 'bodyStrong' : 'bodyLg'}>{SORT_LABEL[key]}</Text>
                <Text variant="caption" color="secondary">
                  {EXPLAINER[key]}
                </Text>
              </View>
              {active ? <Icon name="check" size={20} color={colors.brandInk} /> : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
