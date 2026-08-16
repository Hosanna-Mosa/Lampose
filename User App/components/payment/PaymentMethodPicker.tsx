import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { PAYMENT_METHODS, type PaymentMethod } from '@/types/payment';

/**
 * How to pay.
 *
 * UPI intent apps come first and are named, because a student on a crowded bus
 * should tap one tile rather than type a VPA. The last-used method is marked,
 * so someone paying a second month does not re-choose. Card and net banking are
 * present but demoted — they are the parent's route.
 *
 * There is no wallet, no EMI and no pay-later. A deposit financed on credit is
 * exactly the trap this audience should not be nudged into, and offering it
 * would contradict the product's whole posture.
 */

export type PaymentMethodPickerProps = {
  value: string | null;
  onChange: (id: string) => void;
  methods?: readonly PaymentMethod[];
};

export function PaymentMethodPicker({
  value,
  onChange,
  methods = PAYMENT_METHODS,
}: PaymentMethodPickerProps) {
  const { colors, space, radius, touch } = useTheme();

  const upi = methods.filter((method) => method.kind === 'upiIntent' || method.kind === 'upiCollect');
  const other = methods.filter((method) => method.kind === 'card' || method.kind === 'netbanking');

  const row = (method: PaymentMethod) => {
    const active = method.id === value;
    return (
      <Pressable
        key={method.id}
        onPress={() => onChange(method.id)}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${method.label}${method.detail ? `, ${method.detail}` : ''}${method.lastUsed ? ', last used' : ''}`}
        style={[
          styles.row,
          {
            minHeight: touch.listRow,
            borderRadius: radius.chip,
            borderWidth: active ? 1.5 : 1,
            borderColor: active ? colors.brand : colors.border,
            backgroundColor: active ? colors.brandTint : colors.surface,
            paddingHorizontal: space[3],
            paddingVertical: space[2],
            gap: space[3],
          },
        ]}
      >
        <View style={[styles.glyph, { backgroundColor: colors.surfaceSunken, borderRadius: radius.chip }]}>
          <Icon name={method.icon} size={20} color={colors.textPrimary} />
        </View>

        <View style={styles.flex}>
          <View style={[styles.labelRow, { gap: space[2] }]}>
            <Text variant={active ? 'bodyStrong' : 'bodyLg'} color={active ? 'info' : 'primary'}>
              {method.label}
            </Text>
            {method.lastUsed ? (
              <View
                style={{
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: radius.chip,
                  paddingHorizontal: space[2],
                  paddingVertical: 2,
                }}
              >
                <Text variant="label" color="secondary">
                  Last used
                </Text>
              </View>
            ) : null}
          </View>
          {method.detail ? (
            <Text variant="numMeta" color="tertiary">
              {method.detail}
            </Text>
          ) : null}
        </View>

        {active ? <Icon name="check" size={20} color={colors.brandInk} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={{ gap: space[4] }} accessibilityRole="radiogroup" accessibilityLabel="How to pay">
      <View style={{ gap: space[2] }}>
        <Text variant="title3">Pay by UPI</Text>
        {upi.map(row)}
      </View>

      <View style={{ gap: space[2] }}>
        <Text variant="title3">Or</Text>
        {other.map(row)}
      </View>

      {/* Said plainly, because the alternative is a student wondering whether
          we hold their card. */}
      <View
        style={[
          styles.note,
          { backgroundColor: colors.surfaceSunken, borderRadius: radius.chip, padding: space[3], gap: space[2] },
        ]}
      >
        <Icon name="verified" size={20} color={colors.textSecondary} />
        <Text variant="caption" color="secondary" style={styles.flex}>
          LAMPOSE never sees your card or UPI PIN — your bank handles that. We hold the rent and deposit
          only until the owner confirms you have moved in.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  glyph: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start' },
});
