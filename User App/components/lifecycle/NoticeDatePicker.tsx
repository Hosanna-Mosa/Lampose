import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { NoticeOption } from '@/types/booking';

/**
 * Picking a last day.
 *
 * The rule that governs this component: **the costly option is marked with its
 * exact cost, in rupees, before the tap.** Nobody should discover an ₹8,500
 * penalty in a confirmation dialog.
 *
 * So a penalised option carries a warning dot on the chip itself, and selecting
 * it opens a warning panel naming the figure, the person who keeps it, and the
 * date that would cost nothing instead. The option is never disabled — leaving
 * early is a legitimate choice a student is allowed to make with their eyes
 * open. It just may not be a silent one.
 */

export type NoticeDatePickerProps = {
  options: readonly NoticeOption[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function NoticeDatePicker({ options, selectedId, onSelect }: NoticeDatePickerProps) {
  const { colors, space, radius, touch } = useTheme();
  const selected = options.find((option) => option.id === selectedId);

  return (
    <View style={{ gap: space[3] }}>
      <Text variant="title3">Pick your last day</Text>

      <View style={[styles.row, { gap: space[2] }]}>
        {options.map((option) => {
          const active = option.id === selectedId;
          const costly = option.penalty > 0;

          return (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={
                costly
                  ? `${option.fullLabel}. Costs ${formatRupees(option.penalty)} from your deposit.`
                  : `${option.fullLabel}. No penalty.`
              }
              style={({ pressed }) => [
                styles.chip,
                {
                  minHeight: touch.min,
                  borderRadius: radius.button,
                  paddingHorizontal: space[3],
                  gap: space[1],
                  backgroundColor: active ? colors.brand : colors.surface,
                  borderColor: active ? colors.brand : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={[styles.chipHead, { gap: space[1] }]}>
                {/* The dot rides the chip, so the cost is visible without
                    selecting the option first. */}
                {costly ? (
                  <View
                    style={[
                      styles.dot,
                      {
                        borderRadius: radius.pill,
                        backgroundColor: active ? colors.onBrand : colors.warning.base,
                      },
                    ]}
                  />
                ) : null}
                <Text variant="priceSm" style={active ? { color: colors.onBrand } : undefined}>
                  {option.label}
                </Text>
              </View>
              <Text
                variant="numMeta"
                style={{ color: active ? colors.onBrand : colors.textTertiary }}
              >
                {costly ? `−${formatRupees(option.penalty)}` : 'no penalty'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selected && selected.penalty > 0 ? (
        <View
          style={[
            styles.warn,
            {
              backgroundColor: colors.warning.tint,
              borderColor: colors.warning.borderStrong,
              borderRadius: radius.card,
              padding: space[4],
              gap: space[3],
            },
          ]}
        >
          <Icon name="alert" size={20} color={colors.warning.base} />
          <Text variant="body" style={{ color: colors.warning.ink, flex: 1 }}>
            {selected.penaltyReason}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    // No flex, and a lower floor. Three chips at flex:1 with minWidth:96
    // demanded 336 units before gutters, and minWidth refuses to go below it —
    // so the row overflowed instead of wrapping. `flexBasis` lets them share
    // the row when there is space and drop to a second line when there is not.
    flexGrow: 1,
    flexBasis: 88,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipHead: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 6, height: 6 },
  warn: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: StyleSheet.hairlineWidth },
});
