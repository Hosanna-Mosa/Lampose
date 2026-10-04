import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { liveOrderHeadline } from '@/types/food';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useBottomBar } from '@/context/BottomBarContext';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import type { FoodOrder } from '@/types/food';
import { formatRupees } from '@/utils/money';

import { DietMark, FoodPhoto } from './FoodMarks';
import { foodHref } from './routes';
import { FoodEmptyState } from './FoodStates';
import { FoodNotice, FoodSectionHeader } from './FoodNotices';
import { ActiveOrderCard, FoodStatusChip } from './FoodStatus';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import { useReorder } from './useReorder';

/* The three levels the cart can write into a line's note. `medium` is never
   written — it is the default and the note only records departures from it —
   but a note from an older build may carry it, and reading it back costs a
   comparison. */

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
  /* The bar floats over this screen and gets out of the way while it is read
     down — see `BottomBarContext`. */
  const { onScroll: barScroll, height: barHeight } = useBottomBar();
  const router = useRouter();
  const { orders, liveOrder, address, ordersState, refreshOrders, moreOrders, loadOlderOrders } = useFood();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const signedIn = useAuth().status === 'signedIn';

  const history = useMemo(() => orders.filter((order) => order.id !== liveOrder?.id), [orders, liveOrder]);
  const recent = history.filter((order) => order.monthLabel === 'This month');
  const earlier = history.filter((order) => order.monthLabel !== 'This month');

  /* Money actually spent: orders that went ahead and were paid (or are cash).
     Cancelled, refused and never-paid orders counted here before — and
     `refunded` is not a status any order has, so refunds were counted too. */
  const spent = history.filter((order) => order.status !== 'cancelled' && order.status !== 'rejected'
    && order.paymentLabel !== 'Payment not completed' && !order.refund);
  const spend = spent.reduce((sum, order) => sum + order.paid, 0);
  const average = spent.length ? Math.round(spend / spent.length) : 0;

  /**
   * What the last reorder could NOT rebuild, and where to go next.
   *
   * Null on a reorder that came across whole into an empty cart, which is the
   * ordinary case and goes straight to the cart as before.
   */
  const { reorder, reorderNote, setReorderNote } = useReorder();

  /* Each of these used to fall through to "No food orders yet": a guest,
     a list still loading, and a load that failed all read as an empty
     history — the last one to somebody with orders on the server. */
  if (!orders.length && !signedIn) {
    return (
      <FoodEmptyState
        glyph="calendar"
        title="Sign in to see your orders"
        body="Your food orders, receipts and reorders live with your account."
        primaryLabel="Sign in"
        onPrimary={() => router.push('/(entry)/auth' as never)}
      />
    );
  }
  if (!orders.length && ordersState === 'loading') {
    return (
      <View style={{ padding: 32, alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!orders.length && ordersState === 'error') {
    return (
      <FoodEmptyState
        glyph="calendar"
        title="We could not load your orders"
        body="Check your connection and try again."
        primaryLabel="Try again"
        onPrimary={() => { void refreshOrders(); }}
      />
    );
  }

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
      contentContainerStyle={{
        paddingTop: space[2],
        /* The bar floats over this list, so its height is tail padding here. */
        paddingBottom: space[8] + barHeight,
        gap: space[4],
      }}
      onScroll={barScroll}
      scrollEventThrottle={16}
    >
      {/* Read before the cart opens, not after it is paid for. */}
      {reorderNote ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <FoodNotice
            tone="problem"
            title={reorderNote.title}
            body={reorderNote.message}
            actionLabel={reorderNote.kitchenId ? 'Open the kitchen' : 'Open the cart'}
            onAction={() => {
              const target = reorderNote.kitchenId;
              setReorderNote(null);
              if (target) router.push(foodHref.kitchen(target));
              else router.push(foodHref.cart);
            }}
          />
        </View>
      ) : null}

      {liveOrder ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <ActiveOrderCard
            order={liveOrder}
            /* Same three-way split the tracking screen uses, and for the same
               reason: "the kitchen is cooking" is not true yet at `placed` —
               dispatch does not even start looking for a rider until the
               kitchen accepts, so a `placed` order has not been touched. */
            headline={liveOrderHeadline(liveOrder.status, liveOrder.fulfilment)}
            detail={
              liveOrder.fulfilment === 'pickup'
                ? `${liveOrder.kitchenName} · collect at the counter`
                : `${liveOrder.kitchenName}${address ? ` · ${address.title}` : ''}`
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
            {/* "Your orders", not "This term": the list is the last 50 orders,
                not a term, and the count is the orders that went ahead. */}
            <Text variant="caption" color="tertiary">
              Your orders
            </Text>
            <Text variant="priceMd" style={{ marginTop: 2 }}>
              {spent.length} orders · {formatRupees(spend)}
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

      {/* Older than the first fifty — the list used to stop there with no
          way further back. Shown while the last page came back full. */}
      {moreOrders ? (
        <View style={{ paddingHorizontal: layout.gutter }}>
          <Button
            label={loadingOlder ? 'Loading…' : 'Show older orders'}
            variant="ghost"
            disabled={loadingOlder}
            fullWidth
            onPress={() => {
              setLoadingOlder(true);
              loadOlderOrders().catch(() => {}).finally(() => setLoadingOlder(false));
            }}
          />
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
  const { findDish } = useFoodCatalogue();
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

      {/* On the refund itself: the order's status is `cancelled` or
          `rejected`, never `refunded`, so gating on that hid this line. */}
      {order.refund ? (
        <Text variant="caption" style={{ color: colors.brandInk }}>
          Refund of {formatRupees(order.refund.amount)} sent · Ref {order.refund.reference}.
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
