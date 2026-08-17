import React from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { PendingAdd } from '@/context/FoodContext';
import { formatRupees } from '@/utils/money';

export type CartSwitchSheetProps = {
  /** Set when an add from a second kitchen is waiting on an answer. */
  pending: PendingAdd | null;
  currentKitchenName?: string;
  lineCount: number;
  lineTotal: number;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * "Your cart has food from another kitchen."
 *
 * The blocking-rule sheet, and the shape every one of them takes in this
 * module: what is true, why the rule exists, what will be lost — with the
 * amount — then the keep-it action as the filled default and the destructive
 * one plain underneath.
 *
 * The default is KEEPING the cart. A student who taps a biryani while holding
 * a thali has probably mis-tapped; making "clear and add" the filled button
 * would turn a mis-tap into a lost cart, and the recovery for that is
 * rebuilding three choices from memory.
 */
export function CartSwitchSheet({
  pending,
  currentKitchenName,
  lineCount,
  lineTotal,
  onConfirm,
  onCancel,
}: CartSwitchSheetProps) {
  const { colors, space, radius } = useTheme();

  return (
    <BottomSheet
      visible={pending !== null}
      onClose={onCancel}
      title={`Your cart has food from ${currentKitchenName ?? 'another kitchen'}`}
      footer={
        <View style={{ gap: space[2] }}>
          <Button label="Keep my cart" fullWidth onPress={onCancel} />
          <Button
            label={pending ? `Clear it and add ${pending.dish.name}` : 'Clear the cart'}
            variant="destructive"
            fullWidth
            onPress={onConfirm}
          />
        </View>
      }
    >
      <View style={{ gap: space[3] }}>
        <Text variant="body" color="secondary">
          One kitchen per order keeps the food hot and the pickup at a single counter. Clearing removes{' '}
          {lineCount} {lineCount === 1 ? 'item' : 'items'} worth {formatRupees(lineTotal)}, along with the
          choices you set on them.
        </Text>

        {pending ? (
          <View
            style={[
              {
                backgroundColor: colors.surfaceSunken,
                borderRadius: radius.card,
                padding: space[3],
                gap: space[1],
              },
            ]}
          >
            <Text variant="caption" color="tertiary">
              You are adding
            </Text>
            <Text variant="title3">{pending.dish.name}</Text>
            <Text variant="numMeta" color="tertiary">
              {formatRupees(pending.dish.price)} · a different kitchen
            </Text>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

