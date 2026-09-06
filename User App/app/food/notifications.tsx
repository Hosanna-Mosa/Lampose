/* ══════════════════════════════════════════════════════════════════════════
   Food's own alerts door.

   The stay side's `/notifications` is built — deliberately — from one thing
   only: visit-request replies. A food order never appears there and never
   should; bolting a second, unrelated event type onto that inbox would be
   the same "answers a question nobody here has" failure its own comment
   warns about.

   There is also no server-side notification for a food order changing status
   — nothing in `food_orders` is an "event" the way a WhatsApp reply is. What
   every order already carries is its own `timeline`, written from the same
   `statusHistory` the tracking screen reads (see `buildTimeline` in
   `FoodContext`). So this screen does not fetch a feed; it reads the orders
   already in memory and shows what has changed about them, which is the
   honest version of "what's new" available here.

   The live order gets its full timeline — the same `FoodTimeline` the
   tracking screen renders, not a re-description of it — because that IS the
   thing worth watching right now. Finished orders get one line each: their
   final chip and when it landed. Browsing the whole order history stays the
   Orders tab's job; this screen answers "did anything just change", not
   "show me everything I've ever ordered".
   ══════════════════════════════════════════════════════════════════════════ */
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  FoodEmptyState,
  FoodSectionHeader,
  FoodStatusChip,
  FoodTimeline,
  timelineIndex,
} from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';

export default function FoodNotificationsScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orders, liveOrder, markFoodNotificationsSeen } = useFood();

  /* Opening this screen IS the read receipt — there is no separate "mark all
     read" tap to offer, because there is no per-row read state under it to
     move: every reached step is either counted or it isn't. Runs once, on
     mount, against whatever `orders` holds at that moment; a status that
     changes while the diner is already looking at it is still visible on
     screen, just not separately flagged. */
  useEffect(() => {
    markFoodNotificationsSeen();
    // Deliberately once — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recentlyFinished = useMemo(
    () => orders.filter((order) => order.id !== liveOrder?.id && order.monthLabel === 'This month'),
    [orders, liveOrder],
  );

  const nothingToShow = !liveOrder && recentlyFinished.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Order updates" onBack={() => router.back()} />

      {nothingToShow ? (
        <FoodEmptyState
          glyph="calendar"
          title="Nothing to show yet"
          body="Once you order, its status changes — the kitchen starting, a rider confirming, it arriving — show up here."
          primaryLabel="Browse what is cooking"
          onPrimary={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingTop: space[2], paddingBottom: space[8], gap: space[4] }}
        >
          {liveOrder ? (
            <View style={{ gap: space[2] }}>
              <View style={{ paddingHorizontal: layout.gutter }}>
                <FoodSectionHeader title="Right now" />
              </View>
              <View style={{ paddingHorizontal: layout.gutter, gap: space[3] }}>
                <View
                  style={[
                    styles.card,
                    { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, padding: space[3], gap: space[2] },
                  ]}
                >
                  <View style={styles.head}>
                    <FoodStatusChip status={liveOrder.status} />
                    <Text variant="caption" color="tertiary">
                      {liveOrder.kitchenName}
                    </Text>
                  </View>
                  {liveOrder.timeline?.length ? (
                    <FoodTimeline steps={liveOrder.timeline} currentIndex={timelineIndex(liveOrder)} />
                  ) : null}
                  <Pressable
                    onPress={() => router.push(foodHref.order(liveOrder.id))}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.trackLink,
                      { backgroundColor: pressed ? colors.surfaceSunken : 'transparent', borderRadius: radius.chip },
                    ]}
                  >
                    <Text variant="title3" style={{ color: colors.brandInk }}>
                      Track this order
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          {recentlyFinished.length ? (
            <View style={{ gap: space[2] }}>
              <View style={{ paddingHorizontal: layout.gutter }}>
                <FoodSectionHeader title="Recently finished" trailing={`${recentlyFinished.length}`} />
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
                {recentlyFinished.map((order, index) => {
                  const lastStep = [...(order.timeline ?? [])].reverse().find((step) => step.done && step.at);
                  return (
                    <Pressable
                      key={order.id}
                      onPress={() => router.push(foodHref.order(order.id))}
                      accessibilityRole="button"
                      style={[
                        styles.row,
                        {
                          paddingVertical: space[3],
                          gap: space[3],
                          borderBottomWidth: index === recentlyFinished.length - 1 ? 0 : StyleSheet.hairlineWidth,
                          borderBottomColor: colors.borderSubtle,
                        },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="title3" numberOfLines={1}>
                          {order.kitchenName}
                        </Text>
                        {lastStep ? (
                          <Text variant="caption" color="tertiary" numberOfLines={1}>
                            {lastStep.label} · {lastStep.at}
                          </Text>
                        ) : null}
                      </View>
                      <FoodStatusChip status={order.status} amount={order.status === 'refunded' ? order.refund?.amount : undefined} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  trackLink: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
