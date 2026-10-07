import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/common';
import { layout, radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { useStayRequests } from '@/services/hooks/useStayRequests';

/** The active tab's ink — glyph and label — and the tint of the glass under it. */
const ACTIVE_TINT = '#FF5200';

/** The bar's top padding. The bubble's top edge is read from it too, because
 *  that is where the tab cells start. */
const BAR_PAD_TOP = 8;

/**
 * The bubble's height: the stock tab button's own box — 5pt of padding, the
 * 28pt icon frame, the 13pt label line and 5pt again. The button lays that out
 * from the top of its cell, so a bubble the height of the CELL would sit flush
 * on the icon and loose under the label; this one is centred on what it holds.
 */
const BUBBLE_HEIGHT = 51;

/**
 * The glass bubble's travel — the customer app's `component.tabBubble`
 * (`User App/constants/motion.ts`), so the three apps' bars move alike.
 *
 * Under-damped on purpose: the small settle at the far end is what makes it
 * read as a bubble rather than a cursor. It runs on the tab INDEX, not on
 * points. Reanimated 4 ends a spring on a RELATIVE energy threshold, so the
 * rest thresholds that token also lists have no equivalent to carry over and
 * the units do not need rescaling.
 */
const TAB_BUBBLE_SPRING = { damping: 17, stiffness: 210, mass: 0.8 } as const;

/**
 * Four tabs: Today · Requests · Bookings · Profile. The design system
 * originally specced five, with Calendar between Bookings and Payouts, and
 * named the last tab "Menu" with a hamburger icon — both changed at the
 * user's request; see the build record's scope-changes panel. The screen
 * behind the last tab is still Settings, unchanged; only the tab's own icon
 * and label read differently now. The header stays white and flat and is
 * never coloured; the active tab is the only place the accent appears in
 * this bar.
 *
 * The active tab sits in a bubble of tinted glass that SLIDES to the next tab
 * on a press — the same travelling highlight as the customer app's bar and
 * the segmented controls. The bar itself is still react-navigation's own
 * `BottomTabBar`, drawn exactly as before; the bubble goes in through its
 * `tabBarBackground` slot, which is laid above the bar's fill and below the
 * tab buttons. `GlassTabBar` tells it which cell is active.
 */
export default function TabsLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();

  /*
   * The badge, and the reason Requests is a tab at all.
   *
   * A booking request gives this owner THREE MINUTES. Until now the only
   * places it appeared were a card on the dashboard and a row in an inbox two
   * taps down, so an owner on Bookings or Profile had no standing indication
   * that anybody was waiting — the request simply expired and told the student
   * nobody answered.
   *
   * `unread` is the server's own count (requests still waiting on this owner,
   * newer than their read watermark), so the number here and the number the
   * inbox clears are the same fact rather than two that can drift.
   *
   * Same query key as every other caller, so this is not an extra poll —
   * react-query dedupes them onto the one `IncomingRequestAlert` already runs.
   */
  const { unread, groups } = useStayRequests();
  /* Fall back to what is actually pending. `unread` goes to zero the moment
     the inbox is opened, and a request still counting down after that is
     still somebody waiting — the dot has to outlast the badge. */
  /* The fallback counts what is counting DOWN — app requests. A website
     lead waiting on a WhatsApp reply is not one this tab can answer. */
  /* The larger of the two, not "unread if any": with one request opened and
     one new, `unread` was 1 while two students were counting down, and the
     badge under-reported the people waiting. */
  const waiting = Math.max(unread, groups.pending.filter((r) => r.channel === 'app').length);

  const tab = (name: IconName) =>
    ({ color, focused }: { color: string; focused: boolean }) => (
      <Icon name={name} size={22} color={color} strokeWidth={focused ? 2.1 : 1.75} />
    );

  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_TINT,
        tabBarInactiveTintColor: c.textTertiary,
        tabBarBackground: () => <GlassTabBubble />,
        tabBarStyle: {
          height: layout.tabBarHeight + insets.bottom,
          paddingTop: BAR_PAD_TOP,
          paddingBottom: insets.bottom + 8,
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.borderSubtle,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.bold,
          fontSize: 10,
          lineHeight: 13,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tab('home') }} />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
          tabBarIcon: tab('bell'),
          /* Undefined rather than 0 — react-navigation renders a badge for any
             defined value, and an empty grey pill on a quiet inbox is a thing
             owners learn to ignore. */
          tabBarBadge: waiting > 0 ? (waiting > 9 ? '9+' : waiting) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: c.error,
            color: '#FFFFFF',
            fontFamily: fonts.bold,
            fontSize: 10,
            lineHeight: 13,
          },
        }}
      />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: tab('bookings') }} />
      {/* The Payouts tab is gone with the screens behind it — the app does not
          display payouts. Payout METHODS survive as a Profile row: a bank
          account is where referral money lands, which is a different thing from
          a payout history. */}
      <Tabs.Screen name="menu" options={{ title: 'Profile', tabBarIcon: tab('user') }} />
    </Tabs>
  );
}

/** Which cell the bubble belongs in, handed from the bar to its background. */
type BubbleSlot = {
  /** The active tab among the cells actually drawn; -1 when it is none of them. */
  index: number;
  count: number;
  /** The bar's own side padding — `BottomTabBar` pads by the larger side inset. */
  sideInset: number;
};

const BubbleSlotContext = createContext<BubbleSlot | null>(null);

/**
 * The stock bar, plus the one fact its background slot cannot see: which tab
 * is active. `tabBarBackground` is called with no arguments, so the slot is
 * handed down through context rather than through the options.
 *
 * Cells are counted the way the bar lays them out. A route hidden with
 * `href: null` is still in `state.routes` but is drawn `display: 'none'`, so it
 * takes no cell — counting it would make every cell too narrow and leave the
 * bubble short of the last tab.
 */
function GlassTabBar(props: BottomTabBarProps) {
  const { state, descriptors, insets } = props;
  const focusedKey = state.routes[state.index]?.key;
  const cells = state.routes.filter(
    (route) => StyleSheet.flatten(descriptors[route.key]?.options.tabBarItemStyle)?.display !== 'none',
  );
  const index = cells.findIndex((route) => route.key === focusedKey);
  const count = cells.length;
  const sideInset = Math.max(insets.left, insets.right);

  const slot = useMemo(() => ({ index, count, sideInset }), [index, count, sideInset]);

  return (
    <BubbleSlotContext.Provider value={slot}>
      <BottomTabBar {...props} />
    </BubbleSlotContext.Provider>
  );
}

/** `#RRGGBB` at an alpha, so the glass follows the tint constant rather than a
 *  hand-copied rgba of it. Anything else is returned unchanged. */
function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/**
 * The glass bubble under the active tab.
 *
 * `position` springs from the old tab index to the new one; the bubble's left
 * edge is that index times a cell's width, read from the measured bar inside
 * the worklet, so a rotation or a late layout still lands it in the right
 * cell. While it travels it STRETCHES — wider by how far it still has to go —
 * and settles back to a cell's width as it lands.
 *
 * Glass, not paint: the active tint at low alpha, a bright rim, and a
 * highlight across its top half, over the bar's own white. This app is
 * light-only (see `useColors`), so there is no dark variant to pick.
 */
function GlassTabBubble() {
  const slot = useContext(BubbleSlotContext);
  const reduceMotion = useReducedMotion();
  const index = slot?.index ?? -1;
  const count = slot?.count ?? 0;
  const sideInset = slot?.sideInset ?? 0;
  const shown = index >= 0;

  /** The background slot's width — the whole bar, side padding included. */
  const barWidth = useSharedValue(0);
  const position = useSharedValue(Math.max(0, index));
  const target = useSharedValue(Math.max(0, index));
  const visible = useSharedValue(shown ? 1 : 0);
  const placed = useRef(false);

  useEffect(() => {
    if (index < 0) return;
    target.value = index;
    /* The first placement is a placement, not a move — the bubble must not
       slide in from the first tab when the app opens on the third. */
    position.value = !placed.current || reduceMotion ? index : withSpring(index, TAB_BUBBLE_SPRING);
    placed.current = true;
  }, [index, reduceMotion, position, target]);

  useEffect(() => {
    visible.value = withTiming(shown ? 1 : 0, { duration: 160, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  }, [shown, visible]);

  const style = useAnimatedStyle(() => {
    const cell = count > 0 ? Math.max(0, barWidth.value - sideInset * 2) / count : 0;
    const still = Math.min(Math.abs(target.value - position.value), 1);
    return {
      width: Math.max(0, cell - 6),
      opacity: cell > 0 ? visible.value : 0,
      transform: [
        { translateX: sideInset + position.value * cell + 3 },
        { scaleX: 1 + still * 0.28 },
        { scaleY: 1 - still * 0.06 },
      ],
    };
  });

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        barWidth.value = event.nativeEvent.layout.width;
      }}
    >
      <Animated.View
        style={[
          styles.bubble,
          { backgroundColor: withAlpha(ACTIVE_TINT, 0.1), borderColor: 'rgba(255, 255, 255, 0.95)' },
          style,
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 0.7 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, styles.bubbleRim, { borderColor: withAlpha(ACTIVE_TINT, 0.14) }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Laid over the tab cells: the bar's top padding is where they start (the
     slot sits inside the bar's top border), left edge at the slot's, moved
     across by the worklet. */
  bubble: {
    position: 'absolute',
    left: 0,
    top: BAR_PAD_TOP,
    height: BUBBLE_HEIGHT,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bubbleRim: { borderRadius: radius.pill, borderWidth: 1, margin: 1 },
});
