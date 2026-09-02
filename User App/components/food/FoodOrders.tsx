import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import type { FoodOrder, SpiceLevel } from '@/types/food';
import { formatRupees } from '@/utils/money';

import { DietMark, FoodPhoto } from './FoodMarks';
import { foodHref } from './routes';
import { FoodEmptyState } from './FoodStates';
import { FoodNotice, FoodSectionHeader } from './FoodNotices';
import { ActiveOrderCard, FoodStatusChip } from './FoodStatus';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';

/* The three levels the cart can write into a line's note. `medium` is never
   written — it is the default and the note only records departures from it —
   but a note from an older build may carry it, and reading it back costs a
   comparison. */
const SPICE_LEVELS: readonly SpiceLevel[] = ['mild', 'medium', 'hot'];

/** "a", "a and b", "a, b and c" — a list as somebody would say it aloud. */
function joinList(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

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
  const { findDish, findKitchen } = useFoodCatalogue();
  const { colors, space, layout, radius } = useTheme();
  const router = useRouter();
  const { orders, liveOrder, address, add, clear, kitchenId: cartKitchenId, count } = useFood();

  const history = useMemo(() => orders.filter((order) => order.id !== liveOrder?.id), [orders, liveOrder]);
  const recent = history.filter((order) => order.monthLabel === 'This month');
  const earlier = history.filter((order) => order.monthLabel !== 'This month');

  const spend = history.reduce((sum, order) => sum + (order.status === 'refunded' ? 0 : order.paid), 0);
  const average = history.length ? Math.round(spend / history.length) : 0;

  /**
   * What the last reorder could NOT rebuild, and where to go next.
   *
   * Null on a reorder that came across whole into an empty cart, which is the
   * ordinary case and goes straight to the cart as before.
   */
  const [reorderNote, setReorderNote] = useState<
    { title: string; message: string; kitchenId: string | null } | null
  >(null);

  /**
   * The order a Reorder tap has accepted but not yet rebuilt, with the name of
   * whatever cart it displaced. See the effect below for why it has to wait.
   */
  const [rebuilding, setRebuilding] = useState<
    { order: FoodOrder; displaced: string | null } | null
  >(null);

  /*
   * The tap: empty the cart, then hand the order to the effect underneath.
   *
   * The kitchen being displaced is read off HERE because `clear()` is about to
   * remove the only reference to it, and a cart silently thrown away is the
   * thing the switch sheet exists everywhere else to prevent. Reorder does not
   * get to ask — the cart is already gone by the time anything could be
   * rendered — so the least it can do is name what it took.
   */
  const reorder = (order: FoodOrder) => {
    setReorderNote(null);

    const displaced =
      cartKitchenId && cartKitchenId !== order.kitchenId && count > 0
        ? (findKitchen(cartKitchenId)?.name ?? 'another kitchen')
        : null;

    clear();
    setRebuilding({ order, displaced });
  };

  /*
   * Reorder rebuilds the cart from the order's dishes rather than cloning the
   * old total. Prices move, dishes leave the menu, and a "reorder" that charges
   * last week's number is the single fastest way to lose a student's trust in
   * every other number in the app.
   *
   * ## Why the rebuild is an effect and not the rest of the tap handler
   *
   * `add` is a memoised callback closing over the cart's CURRENT kitchen and
   * line count, and it refuses — 'conflict', for the switch sheet to pick up —
   * whenever those say another kitchen's food is already in the cart.
   * `clear()` only SCHEDULES that cart to empty; inside the handler that called
   * it, the `add` in scope is still the one built against the old cart. So
   * reordering three lines from a second kitchen used to hit 'conflict' on the
   * first line and stop: nothing added, nothing said, nowhere navigated, and a
   * switch sheet offering to re-add exactly one dish. Parking the order in
   * state lets React deliver the cleared cart first; by the time this runs,
   * `add` is the one that agrees the cart is empty and every line goes in.
   *
   * ## What is rebuilt, and how
   *
   * What was CHOSEN is rebuilt with the dish, and it has to be rebuilt BY NAME.
   * The portion and the add-ons survive on the order line as the words the
   * diner picked — that is what `note` is — while the ids behind them are
   * minted from the product id each time the menu is fetched, so last week's
   * ids match nothing today. Matching labels against the dish's current option
   * list is the only join that survives a refetch, and it fails safely: an
   * add-on the kitchen has withdrawn simply finds nothing.
   *
   * Whatever cannot be rebuilt is SAID. A silent drop is a student paying for
   * a plain dosa they believed had extra chutney on it and discovering the
   * difference at the door, so an incomplete reorder stops here with the
   * difference named and the cart one deliberate tap away.
   */
  useEffect(() => {
    if (!rebuilding) return;
    /* The clear has not landed yet — this render is still holding the old
       cart, and an `add` made against it would refuse every line. */
    if (cartKitchenId !== null || count > 0) return;

    const { order, displaced } = rebuilding;
    setRebuilding(null);

    const delisted: string[] = [];
    const unknown: string[] = [];
    const withdrawn: string[] = [];
    const refused: string[] = [];
    let added = 0;

    for (const line of order.lines) {
      const dish = line.dishId ? findDish(line.dishId) : undefined;
      /* Two different failures, and saying the wrong one is worse than saying
         nothing. `soldOut` is a fact the kitchen published today. A dish the
         catalogue simply does not hold is NOT that: `findDish` searches the
         menus that have been fetched, so an order from a kitchen whose menu is
         not loaded — or one that has since been delisted — returns undefined
         for every line. Telling a student their dosa is off the menu when it
         is on the counter is the kind of small lie that costs the next
         number's credibility. */
      if (!dish) {
        unknown.push(line.name);
        continue;
      }
      if (dish.soldOut) {
        delisted.push(line.name);
        continue;
      }

      const options = dish.addOns ?? [];
      const addOnIds: string[] = [];
      let spice: SpiceLevel | undefined;

      const chosen = (line.note ?? '').split(',').map((part) => part.trim()).filter(Boolean);
      for (const part of chosen) {
        const option = options.find((entry) => entry.label.toLowerCase() === part.toLowerCase());
        if (option) {
          addOnIds.push(option.id);
          continue;
        }
        const level = SPICE_LEVELS.find((value) => `${value} spice` === part.toLowerCase());
        if (level) {
          spice = level;
          continue;
        }
        withdrawn.push(`${part} on ${dish.name}`);
      }

      /* Every line of one order comes from one kitchen and the cart was empty
         a render ago, so nothing here should be refused. Counted rather than
         ignored anyway: the one thing this reorder must never do again is drop
         a line without saying so. */
      if (add(dish, { qty: line.qty, window: order.window, addOnIds, ...(spice ? { spice } : null) }) === 'conflict') {
        refused.push(line.name);
        continue;
      }
      added += 1;
    }

    const lost = [
      delisted.length ? `${joinList(delisted)} ${delisted.length === 1 ? 'is' : 'are'} off the menu today` : null,
      unknown.length
        ? `we could not find ${joinList(unknown)} on the menu just now`
        : null,
      withdrawn.length ? `${joinList(withdrawn)} ${withdrawn.length === 1 ? 'is' : 'are'} no longer offered` : null,
      refused.length ? `${joinList(refused)} could not be put in your cart` : null,
    ]
      .filter(Boolean)
      .join('. ');

    /* Nothing lost and nobody's cart taken: the ordinary reorder, straight
       through to a cart that now holds exactly what the order held. */
    if (!lost && !displaced) {
      router.push(foodHref.cart);
      return;
    }

    const tail = !added
      ? 'That leaves nothing to reorder.'
      : lost
        ? "The rest is in your cart, at today's prices."
        : "Everything from that order is in your cart, at today's prices.";

    setReorderNote({
      title: lost ? 'This reorder is not the same order' : 'Your cart was replaced',
      message: [displaced ? `Your cart from ${displaced} made way for this one.` : null, lost ? `${lost}.` : null, tail]
        .filter(Boolean)
        .join(' '),
      kitchenId: added ? null : order.kitchenId,
    });
  }, [rebuilding, cartKitchenId, count, add, findDish, router]);

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
