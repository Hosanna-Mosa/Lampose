import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { BillBreakdown, FoodEmptyState, FoodNotice, type BillLine } from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { findKitchen } from '@/data/food';
import { findWindow, focusWindow } from '@/types/food';
import { formatRupees } from '@/utils/money';

type Method = { id: string; label: string; detail: string; disabled?: boolean };

const UPI_APPS: readonly Method[] = [
  { id: 'gpay', label: 'GPay', detail: 'Installed on this phone' },
  { id: 'phonepe', label: 'PhonePe', detail: 'Installed on this phone' },
  { id: 'upiid', label: 'Pay to a UPI ID', detail: 'rahul@okhdfcbank · saved' },
];

/**
 * Paying.
 *
 * UPI first and by app, because that is how this audience actually pays and a
 * card form is four minutes of typing they will abandon. Cash is offered for
 * pickup only — a rider carrying change to a hostel gate at midnight is a
 * different product with a different risk.
 *
 * The CTA carries the amount. "Continue" on a screen that is about to move ₹122
 * is how people come to feel tricked, and this is a student's food budget.
 */
export default function PaymentScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const router = useRouter();
  const {
    kitchenId,
    window,
    count,
    itemTotal,
    deliveryFee,
    taxes,
    discount,
    toPay,
    coupon,
    fulfilment,
    address,
    slot,
    placeOrder,
  } = useFood();

  const [now] = useState(() => new Date());
  const [method, setMethod] = useState<string>('gpay');
  const [state, setState] = useState<'idle' | 'paying' | 'failed'>('idle');

  const kitchen = kitchenId ? findKitchen(kitchenId) : undefined;
  const activeWindow = findWindow(window ?? focusWindow(now).id);

  if (!kitchen || count === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Payment" onBack={() => router.back()} />
        <FoodEmptyState
          title="There is nothing to pay for"
          body="The cart emptied while you were here. Nothing was charged."
          primaryLabel="Back to food"
          onPrimary={() => router.replace('/home')}
        />
      </View>
    );
  }

  const others: readonly Method[] = [
    { id: 'card', label: 'HDFC debit card', detail: '•••• 4412 · expires 09/28' },
    { id: 'wallet', label: 'LAMPOSE wallet', detail: `Balance ${formatRupees(64)} · add ${formatRupees(Math.max(0, toPay - 64))} to use`, disabled: toPay > 64 },
    {
      id: 'cash',
      label: 'Cash at the counter',
      detail: fulfilment === 'pickup' ? 'Keep exact change ready' : 'Pickup orders only',
      disabled: fulfilment !== 'pickup',
    },
  ];

  const bill: BillLine[] = [
    { id: 'items', label: `Item total · ${count} ${count === 1 ? 'item' : 'items'}`, amount: itemTotal },
    fulfilment === 'pickup'
      ? { id: 'pickup', label: 'Pickup at the counter', amount: 0, amountLabel: 'Free' }
      : { id: 'delivery', label: `Delivery to ${address.title}`, amount: deliveryFee },
    ...(taxes ? [{ id: 'taxes', label: 'Taxes and charges', amount: taxes }] : []),
    ...(coupon ? [{ id: 'coupon', label: coupon.code, amount: discount, discount: true }] : []),
  ];

  const pay = () => {
    setState('paying');
    // The mock stands in for the UPI round trip. Everything the real one has to
    // do — order created only after the bank answers, cart cleared in the same
    // act — is already the shape here, so wiring it up is one call site.
    setTimeout(() => {
      const order = placeOrder(new Date());
      router.replace(foodHref.order(order.id, true));
    }, 900);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Payment"
        subtitle={`${kitchen.name} · ${activeWindow.label} · ${fulfilment === 'pickup' ? 'pickup' : 'delivery'}`}
        onBack={() => router.back()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[4] }}
      >
        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            Pay by UPI
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
            ]}
          >
            {UPI_APPS.map((entry, index) => (
              <MethodRow
                key={entry.id}
                method={entry}
                selected={method === entry.id}
                onSelect={() => setMethod(entry.id)}
                last={index === UPI_APPS.length - 1}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            Other ways
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
            ]}
          >
            {others.map((entry, index) => (
              <MethodRow
                key={entry.id}
                method={entry}
                selected={method === entry.id}
                onSelect={() => setMethod(entry.id)}
                last={index === others.length - 1}
              />
            ))}
          </View>
        </View>

        <BillBreakdown lines={bill} total={toPay} totalLabel="To pay" />

        <FoodNotice
          tone="good"
          title="We never see your UPI PIN"
          body={`Approving happens inside your bank's app. ${slot ? `The kitchen cooks to ${slot}.` : 'The kitchen starts as soon as the payment clears.'}`}
        />

        {state === 'failed' ? (
          <FoodNotice
            tone="problem"
            title="Your bank declined the request"
            body={`The cart is untouched and ${kitchen.name} has not started cooking. If ${formatRupees(toPay)} left your account, failed UPI debits return in 3–5 working days to the same account.`}
          />
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: space[6],
            gap: space[2],
          },
        ]}
      >
        <View style={styles.footerLine}>
          <Text variant="caption" color="tertiary" style={{ flex: 1 }} numberOfLines={1}>
            {count} {count === 1 ? 'item' : 'items'} · {fulfilment === 'pickup' ? 'pickup' : 'delivery'}
            {coupon ? ` · ${coupon.code}` : ''}
          </Text>
          <Text variant="priceLg">{formatRupees(toPay)}</Text>
        </View>

        <Button
          label={`Pay ${formatRupees(toPay)} with ${UPI_APPS.find((entry) => entry.id === method)?.label ?? 'UPI'}`}
          loading={state === 'paying'}
          loadingLabel="Waiting for your bank"
          fullWidth
          onPress={pay}
        />
      </View>
    </View>
  );
}

function MethodRow({
  method,
  selected,
  onSelect,
  last,
}: {
  method: Method;
  selected: boolean;
  onSelect: () => void;
  last: boolean;
}) {
  const { colors, space } = useTheme();

  return (
    <Pressable
      onPress={method.disabled ? undefined : onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!method.disabled }}
      accessibilityLabel={`${method.label}. ${method.detail}`}
      style={[
        styles.methodRow,
        {
          paddingVertical: space[3],
          gap: space[3],
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.borderSubtle,
          opacity: method.disabled ? 0.55 : 1,
        },
      ]}
    >
      {/* The circle is drawn here rather than reusing the primitive, because the
          primitive puts the label on its own row and a payment method needs two
          lines — the method, and the account it will actually move money from. */}
      <View
        style={[
          styles.radio,
          {
            borderColor: selected ? colors.brand : colors.borderInput,
            borderWidth: selected ? 6 : 1.5,
          },
        ]}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="title3" numberOfLines={1}>
          {method.label}
        </Text>
        <Text variant="caption" color="tertiary" numberOfLines={1} style={{ marginTop: 2 }}>
          {method.detail}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { borderWidth: StyleSheet.hairlineWidth },
  methodRow: { flexDirection: 'row', alignItems: 'center' },
  radio: { width: 20, height: 20, borderRadius: 999 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
  footerLine: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
});
