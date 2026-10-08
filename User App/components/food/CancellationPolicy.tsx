import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

/**
 * The cancellation policy, as the server actually applies it.
 *
 * Not a generic "orders are non-refundable" line: `cancelMyOrder` lets a diner
 * cancel while the order is placed or accepted — before the kitchen starts
 * cooking — and refuses after that (`TOO_LATE_TO_CANCEL`); prepaid money on a
 * cancelled order is owed back in full (`markForRefund`). If those rules
 * change, this text changes with them.
 *
 * One component so the cart and the payment screen cannot word it two ways.
 */
export function CancellationPolicy() {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[1], paddingHorizontal: space[1] }}>
      <Text variant="caption" color="secondary" style={{ fontWeight: '700' }}>
        Cancellation policy
      </Text>
      <Text variant="caption" color="tertiary">
        You can cancel from the order screen until the restaurant starts preparing your food. If
        you paid online, the full amount goes back to the account you paid from. Once the kitchen
        has started, the order can no longer be cancelled — please double-check your items and
        address before you place it.
      </Text>
    </View>
  );
}
