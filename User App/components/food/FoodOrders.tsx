import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { findDish } from '@/data/food';
import type { FoodOrder } from '@/types/food';
import { formatRupees } from '@/utils/money';

import { DietMark, FoodPhoto } from './FoodMarks';
import { foodHref } from './routes';
import { FoodEmptyState } from './FoodStates';
import { FoodSectionHeader } from './FoodNotices';
import { ActiveOrderCard, FoodStatusChip } from './FoodStatus';

/**
 * Orders — the live one, then everything that has already happened.
 *
 * A refunded order shows the amount inside its chip and the expected date on
 * the line beneath it, so the question this screen is actually opened with —
 * "where is my money" — is answered without a tap. That single line is worth
 * more than the rest of the screen: it is the support message that never gets
 * written.
 */
export function FoodOrders({ onHome }: { onHome: () => void }) {
  const { colors, space, layout, radius } = useTheme();
  const router = useRouter();
  const { orders, liveOrder, address, add, clear } = useFood();

  const history = useMemo(() => orders.filter((order) => order.id !== liveOrder?.id), [orders, liveOrder]);
  const recent = history.filter((order) => order.monthLabel === 'This month');
  const earlier = history.filter((order) => order.monthLabel !== 'This month');

  const spend = history.reduce((sum, order) => sum + (order.status === 'refunded' ? 0 : order.paid), 0);
  const average = history.length ? Math.round(spend / history.length) : 0;

  /*
   * Reorder rebuilds the cart from the order's dishes rather than cloning the
   * old total. Prices move, dishes leave the menu, and a "reorder" that charges
   * last week's number is the single fastest way to lose a student's trust in
   * every other number in the app.
   */
  const reorder = (order: FoodOrder) => {
    clear();
    let added = 0;
    for (const line of order.lines) {
      const dish = line.dishId ? findDish(line.dishId) : undefined;
      // A dish that has left the menu is silently dropped here and named on the
      // cart, which is where there is room to say "papad is off today's menu".
      if (dish && !dish.soldOut) {
        add(dish, { qty: line.qty, window: order.window });
        added += 1;
      }
    }
    router.push(added ? foodHref.cart : foodHref.kitchen(order.kitchenId));
  };

  if (!orders.length) {
    return (
      <FoodEmptyState
        glyph="calendar"
        title="No food orders yet"
        body="Once you order, everything lives here — status, receipts and one-tap reorder."
        primaryLabel="Browse what is cooking"
        onPrimary={onHome}
      />
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: space[2], paddingBottom: space[8], gap: space[4] }}
    >
      {liveOrder ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <ActiveOrderCard
            order={liveOrder}
            headline={
              liveOrder.status === 'ready'
                ? liveOrder.fulfilment === 'pickup'
                  ? 'Waiting at the counter'
                  : 'Leaving the kitchen'
                : 'The kitchen is cooking'
            }
            detail={
              liveOrder.fulfilment === 'pickup'
                ? `${liveOrder.kitchenName} · collect at the counter`
                : `${liveOrder.kitchenName} · ${address.title}`
            }
            actionLabel="Track order"
            onPress={() => router.push(foodHref.order(liveOrder.id))}
          />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: layout.gutter }}>
        <View
          style={[
            styles.summary,
            { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: space[3] },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="tertiary">
              This term
            </Text>
            <Text variant="priceMd" style={{ marginTop: 2 }}>
              {history.length} orders · {formatRupees(spend)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="caption" color="tertiary">
              Average meal
            </Text>
            <Text variant="priceMd" style={{ marginTop: 2 }}>
              {formatRupees(average)}
            </Text>
          </View>
        </View>
      </View>

      {recent.length ? (
        <View style={{ gap: space[2] }}>
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodSectionHeader title="This month" trailing={`${recent.length} orders`} />
          </View>
          <View style={{ paddingHorizontal: layout.gutter, gap: space[2] }}>
            {recent.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onPress={() => router.push(foodHref.order(order.id))}
                onReorder={() => reorder(order)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {earlier.length ? (
        <View style={{ gap: space[2] }}>
          <View style={{ paddingHorizontal: layout.gutter }}>
            <FoodSectionHeader title="Earlier" />
          </View>
          <View
            style={{
              marginHorizontal: layout.gutter,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: radius.card,
              paddingHorizontal: space[3],
            }}
          >
            {earlier.map((order, index) => (
              <Pressable
                key={order.id}
                onPress={() => router.push(foodHref.order(order.id))}
                accessibilityRole="button"
                style={[
                  styles.earlierRow,
                  {
                    paddingVertical: space[3],
                    gap: space[3],
                    borderBottomWidth: index === earlier.length - 1 ? 0 : StyleSheet.hairlineWidth,
                    borderBottomColor: colors.borderSubtle,
                  },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="title3" numberOfLines={1}>
                    {order.lines.map((line) => line.name).join(', ')}
                  </Text>
                  <Text variant="caption" color="tertiary" numberOfLines={1}>
                    {order.kitchenName} · {order.placedLabel}
                  </Text>
                </View>
                <Text variant="priceSm">{formatRupees(order.paid)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: layout.gutter }}>
        <Button label="Browse what is cooking now" variant="secondary" fullWidth onPress={onHome} />
      </View>
    </ScrollView>
  );
}

/**
 * One past order.
 *
 * The striped tile on the left is what separates a food row from a stay row in
 * any shared list: food carries a striped tile, a kitchen name and a status
 * chip; a stay row carries a solid tile, a property name and a period. Colour
 * is never the difference.
 */
function OrderCard({
  order,
  onPress,
  onReorder,
}: {
  order: FoodOrder;
  onPress: () => void;
  onReorder: () => void;
}) {
  const { colors, space, radius } = useTheme();
  const refunded = order.status === 'refunded';
  /* The first line's dish, when it is still on the menu. A receipt has to
     survive a delisted dish, so this is a lookup rather than stored art. */
  const thumbnail = order.lines[0]?.dishId ? findDish(order.lines[0].dishId)?.photo : undefined;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.id} from ${order.kitchenName}`}
      style={({ pressed }) => [
        styles.orderCard,
        {
          backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
          borderColor: colors.border,
          borderRadius: radius.card,
          padding: space[3],
          gap: space[2],
        },
      ]}
    >
      <View style={styles.orderHead}>
        <FoodStatusChip status={order.status} amount={refunded ? order.refund?.amount : undefined} />
        <Text variant="numMeta" color="tertiary">
          {order.placedLabel}
        </Text>
      </View>

      <View style={[styles.orderBody, { gap: space[3] }]}>
        <FoodPhoto height={40} width={40} radius={radius.chip} uri={thumbnail} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.orderTitle}>
            <DietMark diet={order.lines[0]?.diet ?? 'veg'} size={12} />
            <Text variant="title3" numberOfLines={1} style={{ flex: 1 }}>
              {order.kitchenName}
            </Text>
          </View>
          <Text variant="caption" color="tertiary" numberOfLines={1}>
            {order.lines.map((line) => (line.qty > 1 ? `${line.name} ×${line.qty}` : line.name)).join(', ')}
          </Text>
        </View>
        <Text variant="priceLg">{formatRupees(order.paid)}</Text>
      </View>

      {refunded && order.refund ? (
        <Text variant="caption" style={{ color: colors.brandInk }}>
          {formatRupees(order.refund.amount)} back to {order.refund.destination}, expected by {order.refund.expectedBy}.
          Nothing for you to do.
        </Text>
      ) : (
        <View style={[styles.orderActions, { gap: space[2] }]}>
          <Button label="Reorder" size="sm" variant="secondary" onPress={onReorder} />
          <Button label="Get help" size="sm" variant="ghost" onPress={onPress} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  orderCard: { borderWidth: StyleSheet.hairlineWidth },
  orderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  orderBody: { flexDirection: 'row', alignItems: 'center' },
  orderTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderActions: { flexDirection: 'row' },
  earlierRow: { flexDirection: 'row', alignItems: 'center' },
});
