import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  BillBreakdown,
  DietMark,
  FoodEmptyState,
  FoodNotice,
  FoodStatusChip,
  FoodTimeline,
  ReceiptLine,
  timelineIndex,
  type BillLine,
} from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { findKitchen } from '@/data/food';
import { findWindow } from '@/types/food';
import { formatRupees } from '@/utils/money';

const CANCEL_REASONS = [
  'Ordered by mistake',
  'Taking too long',
  'Wrong room or address',
  'Eating in the mess instead',
  'Something else',
];

/**
 * One order — tracking, receipt and refund, in that order as it ages.
 *
 * It is one screen rather than three because a student does not think in those
 * categories: they think "my order", and what they want from it changes by the
 * minute. While it is live the pickup code and the hold time are the whole
 * screen; once it is done the bill is; once it is cancelled the refund is, with
 * the expected date in bold and one sentence saying there is nothing to do.
 *
 * Cancel never disappears. After the kitchen plates it, it stays on screen,
 * disabled, saying why — a button that vanishes reads as a bug, and the student
 * goes to support to ask where it went.
 */
export default function OrderScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const router = useRouter();
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const { orders, cancelOrder, address } = useFood();

  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);

  const order = orders.find((entry) => entry.id === id);

  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Order" onBack={() => router.back()} />
        <FoodEmptyState
          title="We cannot find that order"
          body="It may belong to another account. Your orders are all under the Orders tab in Food."
          primaryLabel="Back to food"
          onPrimary={() => router.replace('/home')}
        />
      </View>
    );
  }

  const kitchen = findKitchen(order.kitchenId);
  const activeWindow = findWindow(order.window);
  const live = ['placed', 'confirmed', 'preparing', 'ready', 'onTheWay'].includes(order.status);
  const cancellable = ['placed', 'confirmed', 'preparing'].includes(order.status);

  const bill: BillLine[] = [
    ...order.lines.map((line) => ({
      id: line.name,
      label: line.qty > 1 ? `${line.name} ×${line.qty}` : line.name,
      amount: line.price,
    })),
    ...order.lines
      .filter((line) => line.note)
      .map((line) => ({ id: `${line.name}-note`, label: line.note as string, amount: 0, amountLabel: 'included', sub: true })),
    order.fulfilment === 'pickup'
      ? { id: 'pickup', label: 'Pickup', amount: 0, amountLabel: 'Free' }
      : { id: 'delivery', label: `Delivery to ${address.title}`, amount: order.deliveryFee },
    ...(order.taxes ? [{ id: 'taxes', label: 'Taxes and charges', amount: order.taxes }] : []),
    ...(order.discount ? [{ id: 'discount', label: order.couponCode ?? 'Discount', amount: order.discount, discount: true }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title={`Order ${order.id}`}
        subtitle={`${order.kitchenName} · ${activeWindow.label}`}
        onBack={() => (placed ? router.replace('/home') : router.back())}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[3] }}
      >
        {placed ? (
          <FoodNotice
            tone="good"
            title="Payment successful"
            body={`${formatRupees(order.paid)} paid by ${order.paymentLabel}. ${order.kitchenName} has your order — we send one notification when it is ready, and nothing else.`}
          />
        ) : null}

        {/* The live head. Everything a student needs while standing up. */}
        {live ? (
          <View
            style={[
              { backgroundColor: colors.graphite, borderRadius: radius.card, padding: space[4], gap: space[2] },
            ]}
          >
            <View style={styles.headRow}>
              <FoodStatusChip status={order.status} onDark />
              <Text variant="numMeta" style={{ color: colors.onGraphiteMuted }}>
                {order.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}
              </Text>
            </View>

            <Text variant="display2" style={{ color: colors.onGraphite, marginTop: space[1] }}>
              {order.status === 'ready'
                ? order.fulfilment === 'pickup'
                  ? 'Waiting at the counter'
                  : 'Leaving the kitchen now'
                : `Ready by about ${order.timeline?.[2]?.note?.replace('Ready by about ', '') ?? 'soon'}`}
            </Text>
            <Text variant="caption" style={{ color: colors.onGraphiteMuted }}>
              {order.fulfilment === 'pickup'
                ? `${kitchen?.landmark ?? 'the counter'} · ${kitchen?.walkMinutes ?? 0} min walk`
                : address.title}
            </Text>

            {order.pickupCode && order.status === 'ready' ? (
              <View
                style={[
                  styles.code,
                  { backgroundColor: colors.onGraphite, borderRadius: radius.card, padding: space[3], marginTop: space[3] },
                ]}
              >
                <Text variant="caption" style={{ color: colors.textTertiary }}>
                  Show this at the counter
                </Text>
                <Text variant="priceHero" style={{ color: colors.graphite, letterSpacing: 4, marginTop: space[1] }}>
                  {order.pickupCode}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Where it is */}
        {order.timeline?.length ? (
          <FoodTimeline steps={order.timeline} currentIndex={timelineIndex(order)} />
        ) : null}

        {/* Refund, when there is one. The support-message-that-never-gets-written. */}
        {order.refund ? (
          <View
            style={[
              styles.refund,
              { backgroundColor: colors.success.tint, borderColor: colors.success.border, borderRadius: radius.card, padding: space[4], gap: space[2] },
            ]}
          >
            <View style={styles.headRow}>
              <Text variant="title2" style={{ color: colors.success.ink, flex: 1 }}>
                Refund on the way
              </Text>
              <Text variant="priceLg" style={{ color: colors.success.ink }}>
                {formatRupees(order.refund.amount)}
              </Text>
            </View>

            <Text variant="caption" style={{ color: colors.success.ink }}>
              {order.refund.reason} {formatRupees(order.refund.amount)} goes back to {order.refund.destination}, the
              same way you paid. Expected by {order.refund.expectedBy}, often sooner.
            </Text>

            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.chip,
                padding: space[3],
                marginTop: space[1],
              }}
            >
              <ReceiptLine label="Reference" value={order.refund.reference} />
              <ReceiptLine
                label="Status"
                value={
                  order.refund.status === 'credited'
                    ? 'Credited'
                    : order.refund.status === 'sentToBank'
                      ? 'Sent to bank'
                      : 'Initiated'
                }
                last
              />
            </View>

            <Text variant="caption" style={{ color: colors.success.ink }}>
              Nothing for you to do. If it has not landed by {order.refund.expectedBy}, tap Get help and we chase the
              bank with that reference.
            </Text>
          </View>
        ) : null}

        {/* What was ordered */}
        <View
          style={[
            styles.group,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
          ]}
        >
          {order.lines.map((line, index) => (
            <View
              key={line.name}
              style={[
                styles.line,
                {
                  paddingVertical: space[3],
                  gap: space[3],
                  borderBottomWidth: index === order.lines.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: colors.borderSubtle,
                },
              ]}
            >
              <DietMark diet={line.diet} size={13} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="title3" numberOfLines={1}>
                  {line.qty > 1 ? `${line.name} ×${line.qty}` : line.name}
                </Text>
                {line.note ? (
                  <Text variant="caption" color="tertiary" numberOfLines={1}>
                    {line.note}
                  </Text>
                ) : null}
              </View>
              <Text variant="priceSm">{formatRupees(line.price)}</Text>
            </View>
          ))}
        </View>

        <BillBreakdown
          lines={bill}
          total={order.refund ? order.refund.amount : order.paid}
          totalLabel={order.refund ? 'Refunding' : live ? 'Paid' : 'Paid'}
        />

        <View
          style={[
            styles.group,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
          ]}
        >
          <ReceiptLine label="Placed" value={order.placedLabel} />
          <ReceiptLine label="How" value={order.fulfilment === 'pickup' ? 'Pickup at the counter' : 'Room delivery'} />
          <ReceiptLine label="Payment" value={order.paymentLabel} last />
        </View>

        {/* Cancel. Visible after it stops working, with the reason. */}
        {cancelling ? (
          <View
            style={[
              styles.group,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: space[3], gap: space[2] },
            ]}
          >
            <Text variant="title2">Why are you cancelling?</Text>
            {CANCEL_REASONS.map((entry) => (
              <Button
                key={entry}
                label={entry}
                size="sm"
                variant={reason === entry ? 'primary' : 'secondary'}
                fullWidth
                onPress={() => setReason(entry)}
              />
            ))}

            <View
              style={{
                backgroundColor: colors.success.tint,
                borderColor: colors.success.border,
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: radius.chip,
                padding: space[3],
                marginTop: space[1],
              }}
            >
              <Text variant="title3" style={{ color: colors.success.ink }}>
                You get the full {formatRupees(order.paid)} back
              </Text>
              <Text variant="caption" style={{ color: colors.success.ink, marginTop: 2 }}>
                The kitchen has not plated it, so there is no cancellation fee. The refund goes to {order.paymentLabel}.
              </Text>
            </View>

            <View style={[styles.actions, { gap: space[2], marginTop: space[1] }]}>
              <Button label="Keep my order" fullWidth onPress={() => setCancelling(false)} />
            </View>
            <Button
              label={`Cancel and refund ${formatRupees(order.paid)}`}
              variant="destructive"
              fullWidth
              onPress={() => {
                cancelOrder(order.id, reason);
                setCancelling(false);
              }}
            />
          </View>
        ) : (
          <View style={{ gap: space[2] }}>
            <Button
              label="Cancel order"
              variant={cancellable ? 'destructive' : 'secondary'}
              fullWidth
              disabled={!cancellable}
              onPress={() => setCancelling(true)}
            />
            <Text variant="caption" color="tertiary" style={styles.center}>
              {cancellable
                ? 'Free until the kitchen plates it.'
                : order.status === 'ready'
                  ? 'The food is cooked and waiting, so it can no longer be cancelled. Call the kitchen if something is wrong.'
                  : 'This order has finished.'}
            </Text>
          </View>
        )}

        <View style={[styles.actions, { gap: space[2] }]}>
          <Button label="Get help" variant="secondary" onPress={() => router.push('/support')} />
          <Button label="Order it again" onPress={() => router.push(foodHref.kitchen(order.kitchenId))} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  code: { alignItems: 'center' },
  refund: { borderWidth: StyleSheet.hairlineWidth },
  group: { borderWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row' },
  center: { textAlign: 'center' },
});
