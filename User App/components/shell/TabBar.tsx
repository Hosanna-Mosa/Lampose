import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { Icon, Text, type IconName, type IconSize } from '@/components/ui';
import { component, easing } from '@/constants/motion';
import { FOOD_EMBER, type ThemeColors } from '@/constants/tokens';
import { useBottomBar } from '@/context/BottomBarContext';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { withAlpha } from '@/utils/color';

/**
 * THE BAR'S SIZE, in one place. A tab cell is `TAB_HEIGHT` tall — the bubble
 * fills it — and everything else (the bar's height, the door) is derived from
 * these, so growing or shrinking the bar is a change here and nowhere else.
 */
const TAB_HEIGHT = 40;

/** A tab at rest: an outline glyph over a small name. */
const REST_ICON: IconSize = 18;
const REST_LABEL = 10;
const REST_GAP = 2;

/** The selected tab: a solid glyph BESIDE a bold name, inside the bubble. */
const ACTIVE_ICON: IconSize = 18;
const ACTIVE_LABEL = 13;
const ACTIVE_GAP = 6;
/** Room between the bubble's rounded ends and what it carries. */
const ACTIVE_PAD_X = 13;

/** The bar's own padding around the row of tabs. */
const BAR_PAD_X = 8;
const BAR_PAD_Y = 5;
const BAR_HEIGHT = TAB_HEIGHT + BAR_PAD_Y * 2 + 2;

/** Space left between the bubble and its cell's edges, either side. */
const BUBBLE_GAP = 3;
const BUBBLE_RADIUS = TAB_HEIGHT / 2;

/** Everything a selected cell needs on top of its glyph-and-name row. */
const ACTIVE_CHROME = (ACTIVE_PAD_X + BUBBLE_GAP) * 2;

/**
 * The narrowest a resting tab is squeezed to while another one is selected —
 * enough for its glyph and a short name. The selected tab is capped so the
 * others never go below this, and its name ellipsizes instead.
 */
const MIN_REST = 40;

/**
 * The door — the `raised` tab — is its own rounded-square button BESIDE the
 * bar, a touch taller than it, so it stands proud of the pill.
 */
const DOOR_SIZE = BAR_HEIGHT + 4;
const DOOR_RADIUS = 18;
const DOOR_GAP = 8;
const DOOR_ICON: IconSize = 20;
/** The Food door's scooter is a busier drawing than a glyph, so it gets more room. */
const DOOR_SCOOTER: IconSize = 24;
const DOOR_LABEL = 11;

/** How far the door's glow and shadow spill past it. The slide-away travels
 *  this on top of the bar's height, or the glow would be the last thing left
 *  on screen. */
const DOOR_GLOW = 14;
/** How far right the door slides while the bar is hidden: past the dock's
    16 pt side padding and its own width, so it is wholly off screen. */
const DOOR_TUCK = 16 + DOOR_SIZE + 24;
/** The tab that stands in for the door at the screen's edge. */
const EDGE_TAB_WIDTH = 62;

/**
 * The bar's palette. Fixed rather than themed: the bar is a dark green pill in
 * both modes, so every ink on it is chosen against that green, not against the
 * page.
 */
const BAR_COLORS = {
  fill: '#112019',
  restGlyph: '#DCE7E1',
  restLabel: '#B9C7C0',
  /** The stay side's bubble, and the dark green drawn on it. */
  lime: '#D9EE87',
  onLime: '#112019',
};

/** The Food door's burnt orange, with white on it. */
/** Food's burnt orange (`FOOD_EMBER`). Exported so the food cart strip wears the same one. */
export const EMBER = { base: FOOD_EMBER.base, on: FOOD_EMBER.on, ink: FOOD_EMBER.ink };

/**
 * The bar's glyphs: an outline at rest and the SOLID shape when the tab is
 * active, from one icon family (Ionicons) so every pair is drawn to match.
 *
 * `food` is not in here: it is the delivery scooter drawn by `ScooterGlyph`,
 * which rides — wheels turning, body bobbing — on the Food door.
 */
const TAB_GLYPHS = {
  home: ['home-outline', 'home'],
  saved: ['heart-outline', 'heart'],
  bookings: ['calendar-clear-outline', 'calendar-clear'],
  stays: ['bed-outline', 'bed'],
  orders: ['receipt-outline', 'receipt'],
  dinein: ['restaurant-outline', 'restaurant'],
} as const satisfies Record<string, readonly [
  keyof typeof Ionicons.glyphMap,
  keyof typeof Ionicons.glyphMap,
]>;

export type TabGlyph = keyof typeof TAB_GLYPHS | 'food';

export type TabItem = {
  id: string;
  label: string;
  /** The line icon, used where no `glyph` is given. */
  icon: IconName;
  /** An outline / solid pair from the bar's own set — preferred over `icon`. */
  glyph?: TabGlyph;
  /** A number badge. 1–9 render as-is; anything above shows 9+. */
  badge?: number;
  /** A bare dot: "something changed", with no count to report. */
  dot?: boolean;
  /**
   * The DOOR: drawn as its own filled button beside the bar instead of as a
   * tab inside it — the one sanctioned break from "tabs are peers". A raised
   * tab is a door to another module, not another sibling screen, and the
   * highlight has to read at rest: a module door matters most when it is NOT
   * the active tab. One per set; the bar carries only the others.
   */
  raised?: boolean;
  /**
   * A soft ring that swells out of the door and fades, every few seconds — the
   * "look here" on the Food door. Off under reduced motion, and on a collapsed
   * bar, where the door is the only thing left and needs no pointing at.
   */
  glow?: boolean;
  /**
   * The door's fill: the Food door and the way back out of Food are both
   * `ember` (Food's burnt orange), and the glyph and name on it take that set's
   * `on` ink — never white by assumption. Tabs inside the bar ignore it: they
   * are drawn in the bar's own palette.
   */
  tone?: TabTone;
};

export type TabTone = 'brand' | 'caution' | 'deal' | 'orange' | 'ember' | 'link' | 'danger';

/**
 * The colour the selected tab wears, per module: the lime bubble on the stay
 * side, Food's burnt orange (`ember`, the Food door's own colour) inside Food.
 */
export type TabAccent = 'brand' | 'deal' | 'ember';

export type TabBarProps = {
  tabs: readonly TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /**
   * Collapse the bar to this single button while a module owns the screen.
   *
   * Food is a place, not a fourth sibling screen. Once you are inside it,
   * Explore / Saved / Bookings are not peers to flick between — they are the
   * app you stepped out of, and a bar still offering all three says the
   * opposite. So the chrome goes: the pill and the other tabs, all of it,
   * leaving one button to bring you back.
   *
   * The button takes the door's place beside the bar, so the door out appears
   * exactly where the door in was.
   *
   * The bar keeps its footprint rather than dropping out of layout: the band
   * it leaves is plain page background, which is what "the bar is gone" looks
   * like. The measured height is still reported either way, so the
   * snackbar and the waiting pill read one number whichever state it is in.
   */
  collapsedTo?: TabItem | null;
  /**
   * Names the SET of destinations currently in the bar — `stay`, `food`.
   *
   * A change here, and only a change here, plays the swap. It cannot be
   * inferred from `tabs`: that array is rebuilt whenever a badge or a dot
   * changes, and animating the whole bar because an order went live would be
   * movement with nothing behind it.
   *
   * Leave it undefined and every change is a straight cut.
   */
  setId?: string;
  /** The selected tab's bubble and ink. Defaults to the stay side's lime;
   *  Food passes `ember`. */
  accent?: TabAccent;
  /**
   * No edge tab while the bar is hidden on scroll. Set while an active strip
   * (the food cart, a stay request in progress) owns the bottom of the
   * screen, where the tab would sit on it. The door beside the bar is
   * unaffected and comes back with the bar.
   */
  hideEdgeTab?: boolean;
};

/** Everything needed to draw one frame of the bar, so an outgoing set can be
 *  held on screen after the props that produced it have already changed. */
type BarFrame = {
  tabs: readonly TabItem[];
  activeId: string;
  collapsedTo: TabItem | null;
  setId?: string;
  accent: TabAccent;
};

/**
 * Where a set's selection is: `at` is a tab INDEX (fractional while the bubble
 * travels) and `engaged` is 1 with a tab selected, 0 with none.
 */
type Placement = {
  at: SharedValue<number>;
  engaged: SharedValue<number>;
};

/**
 * The bottom tab bar: a dark green pill of tabs with the module door beside it.
 *
 * ## The bubble
 *
 * The selected tab sits in a lime bubble (orange inside Food) and reads as a
 * chip — solid glyph and bold name side by side — while the others stay a
 * quiet outline glyph over a small name. The selected cell is as wide as its
 * own chip needs and the others share what is left, so "Bookings" fits as
 * well as "Home" does.
 *
 * Everything runs off one number, the selection's tab index: on a press it
 * springs to the new tab, and the cells' widths, the bubble's position and
 * each tab's chip-versus-outline crossfade are all read from it on the UI
 * thread. So the bubble slides, the cells make room for it as it goes, and
 * nothing can drift out of step. The chip widths themselves are measured off
 * screen (`Ruler`) rather than guessed, so a font or a font scale never
 * leaves a name clipped.
 *
 * ## The door sits beside the bar
 *
 * The `raised` tab — Food on the stay side, the way back out inside Food — is
 * not one of the bar's tabs. It is its own rounded-square button to the right
 * of the pill, in its own colour, so the door to the other module stands apart
 * from the screens of the one you are in. During a set swap the outgoing tabs
 * slide toward it and the incoming ones slide out of it.
 *
 * ## It floats, and it gets out of the way
 *
 * The bar is positioned over the screen rather than sitting in the column
 * below it, and slides off the bottom edge while a feed is being read down —
 * see `BottomBarContext`. Every scrollable under it pads its content by
 * `height` from that context, and the height is reported to BOTH the
 * bottom-edge registry (so the snackbar clears it) and the bar context (so the
 * screens can pad by it).
 */
export function TabBar({ tabs, activeId, onChange, collapsedTo, setId, accent = 'brand', hideEdgeTab = false }: TabBarProps) {
  const { mode, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const live: BarFrame = { tabs, activeId, collapsedTo: collapsedTo ?? null, setId, accent };

  /*
   * The set that is on its way out, kept mounted until the swap finishes —
   * React would otherwise unmount it the instant the props changed, and there
   * would be nothing left to animate away.
   */
  const [outgoing, setOutgoing] = useState<BarFrame | null>(null);
  /** The frame the previous render drew, which is the one that has to leave. */
  const lastFrame = useRef<BarFrame>(live);

  /** 0 at the start of a swap, 1 at rest. */
  const swap = useSharedValue(1);
  /*
   * The door was pressed and the other module's tabs are on their way.
   *
   * The swap can only start once the screen has re-rendered with the new set,
   * and the page above has already begun to slide by then — so the bar answers
   * the press itself, on the UI thread: the current tabs dim and draw in a
   * little at once, and the swap takes it from there.
   */
  const leaving = useSharedValue(0);
  const leavingStyle = useAnimatedStyle(() => ({
    opacity: 1 - 0.55 * leaving.value,
    transform: [{ scale: 1 - 0.05 * leaving.value }],
  }));
  const pressDoor = (id: string) => {
    if (!reduceMotion) leaving.value = withTiming(1, { duration: 120, easing: easing.exit });
    onChange(id);
    /* Should the set not change after all, the tabs come back regardless. */
    setTimeout(() => {
      leaving.value = withTiming(0, { duration: 160 });
    }, 700);
  };
  /** The whole bar's width, so a cell's travel to the door is measured. */
  const barWidth = useSharedValue(360);
  /** The row the tabs share, inside the pill's padding. */
  const rowWidth = useSharedValue(0);

  const collapsedNow = resolveCollapsed(live);
  const liveFlat = flatTabsOf(live);
  const activeIndex = liveFlat.findIndex((tab) => tab.id === live.activeId);
  const selected = !collapsedNow && activeIndex >= 0;

  const at = useSharedValue(Math.max(0, activeIndex));
  const engaged = useSharedValue(selected ? 1 : 0);
  /* The outgoing set's selection, frozen where it was when the swap began. */
  const outAt = useSharedValue(0);
  const outEngaged = useSharedValue(0);
  const placedSet = useRef(setId);

  const settled = useCallback(() => setOutgoing(null), []);

  /*
   * A LAYOUT effect, so the swap is set up before the new set is painted.
   * As a plain effect it ran after: the new tabs were drawn once at rest, then
   * snapped back to the start of the swap — a flicker, and a swap that began a
   * frame late behind the page slide it is meant to move with.
   */
  useLayoutEffect(() => {
    const before = lastFrame.current;

    // No set named, or the same set — a badge changed, not the destinations.
    if (!setId || !before.setId || before.setId === setId) return;

    const beforeIndex = flatTabsOf(before).findIndex((tab) => tab.id === before.activeId);
    outAt.value = Math.max(0, beforeIndex);
    outEngaged.value = beforeIndex >= 0 && !resolveCollapsed(before) ? 1 : 0;

    setOutgoing(before);
    /* The new set arrives at full strength; the swap is its entrance. */
    leaving.value = 0;
    swap.value = 0;
    swap.value = withTiming(
      1,
      {
        duration: reduceMotion ? component.tabSetSwap.reducedDuration : component.tabSetSwap.duration,
        easing: component.tabSetSwap.easing,
      },
      (finished) => {
        if (finished) runOnJS(settled)();
      },
    );
    // `live` is rebuilt every render; the set name is the only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId, reduceMotion, swap, settled, leaving]);

  /*
   * Remember what was just drawn — every render, and deliberately declared
   * AFTER the swap effect so it runs after it on the same commit, so the
   * frame animating out is what the bar looked like a moment ago.
   */
  useEffect(() => {
    lastFrame.current = live;
  });

  /*
   * Move the selection. A slide only between tabs of the same set while one
   * was already selected; arriving from "nothing selected", or in a new set,
   * is a placement, not a move — the bubble must not sweep in from tab one.
   */
  useEffect(() => {
    if (activeIndex < 0) return;
    const jump = reduceMotion || engaged.value === 0 || placedSet.current !== setId;
    placedSet.current = setId;
    at.value = jump ? activeIndex : withSpring(activeIndex, component.tabBubble);
  }, [activeIndex, setId, reduceMotion, at, engaged]);

  useEffect(() => {
    const target = selected ? 1 : 0;
    engaged.value = reduceMotion ? target : withTiming(target, { duration: 160, easing: easing.standard });
  }, [selected, reduceMotion, engaged]);

  /* Each tab's chip width, measured once by the ruler and kept by id. */
  const [faceWidths, setFaceWidths] = useState<Record<string, number>>({});
  const rememberFace = useCallback((key: string, width: number) => {
    setFaceWidths((prev) => (Math.abs((prev[key] ?? -1) - width) < 0.5 ? prev : { ...prev, [key]: width }));
  }, []);
  const liveKeys = liveFlat.map(faceKey).join('\n');
  const outgoingKeys = outgoing ? flatTabsOf(outgoing).map(faceKey).join('\n') : '';
  const liveFaces = useMemo(() => facesFor(liveKeys, faceWidths), [liveKeys, faceWidths]);
  const outgoingFaces = useMemo(() => facesFor(outgoingKeys, faceWidths), [outgoingKeys, faceWidths]);

  /*
   * The bar owns the bottom edge, so the floating request pill sits above it
   * rather than over the tabs. Measured rather than assumed — the height is
   * the bar plus a safe-area inset that differs on every device.
   */
  const { reserveBottom, releaseBottom } = usePendingRequest();
  useEffect(() => () => releaseBottom('tabbar'), [releaseBottom]);

  /*
   * How far the bar is hidden on scroll, 0 to 1. The pill slides off the
   * bottom edge, and so does the door — off the RIGHT edge — while a small
   * tab slides in against that edge in its place: the door's colour, an arrow
   * and its name, as Zomato does with "Delivery". The other module stays one
   * tap away however far down the feed somebody has read, in Stays and in
   * Food alike.
   */
  const { hidden, height, setHeight } = useBottomBar();
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateY: hidden.value * (height + DOOR_GLOW + 20) }],
  }));
  const tuck = useAnimatedStyle(() => ({
    transform: [{ translateX: hidden.value * DOOR_TUCK }],
  }));
  const edgeTab = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - hidden.value) * (EDGE_TAB_WIDTH + 12) }],
  }));

  const measure = (event: LayoutChangeEvent) => {
    reserveBottom('tabbar', event.nativeEvent.layout.height);
    setHeight(event.nativeEvent.layout.height);
    barWidth.value = event.nativeEvent.layout.width;
  };

  /* Reduced motion keeps the crossfades and drops the travel and the scale. */
  const moves = !reduceMotion;

  /* A collapsed bar's lone button stands where the door stands. */
  const door = collapsedNow ?? doorOf(live);

  return (
    <Animated.View
      accessibilityRole={collapsedNow ? undefined : 'tablist'}
      onLayout={measure}
      style={[
        styles.floatingWrapper,
        {
          /* The floor is what carries a device where `insets.bottom` under-
             reports the system nav (a stale measurement on first layout, or
             an Android bar the OS drew without telling `SafeAreaContext` in
             time), so the bar never sits under the system's buttons. */
          paddingBottom: Math.max(insets.bottom, 20) + 4,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.dock} pointerEvents="box-none">
        <Animated.View
          style={[
            slide,
            styles.bar,
            collapsedNow
              ? styles.barCollapsed
              : [
                  styles.floatingBar,
                  {
                    backgroundColor: BAR_COLORS.fill,
                    /* On a dark page the pill needs an edge to stand off it. */
                    borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.10)' : BAR_COLORS.fill,
                    shadowOpacity: mode === 'dark' ? 0.5 : 0.22,
                  },
                ],
          ]}
        >
          <Ruler tabs={liveFlat} onMeasure={rememberFace} />

          {/*
            The tabs on their way out, sliding toward the door. Never tappable:
            the arriving tabs take touches from their first frame.
          */}
          {outgoing ? (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.overlayRow}
            >
              <FlatCells
                frame={outgoing}
                mode="leaving"
                progress={swap}
                barWidth={barWidth}
                rowWidth={rowWidth}
                moves={moves}
                onChange={onChange}
                placement={{ at: outAt, engaged: outEngaged }}
                faces={outgoingFaces}
              />
            </View>
          ) : null}

          {/* The bubble, under the live tabs. */}
          {!collapsedNow ? (
            <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, leavingStyle]}>
              <Bubble
                count={liveFlat.length}
                placement={{ at, engaged }}
                rowWidth={rowWidth}
                faces={liveFaces}
                swap={swap}
                accent={live.accent}
              />
            </Animated.View>
          ) : null}

          {/* The live tabs. The row's fixed height is what gives the bar its
              height — every cell in it is positioned absolutely. */}
          <Animated.View
            style={[styles.row, leavingStyle]}
            onLayout={(event) => {
              rowWidth.value = event.nativeEvent.layout.width;
            }}
          >
            <FlatCells
              frame={live}
              mode="arriving"
              progress={swap}
              barWidth={barWidth}
              rowWidth={rowWidth}
              moves={moves}
              onChange={onChange}
              placement={{ at, engaged }}
              faces={liveFaces}
            />
          </Animated.View>
        </Animated.View>

        {door ? (
          <Animated.View style={tuck}>
            <DoorButton
              tab={door}
              active={!collapsedNow && door.id === live.activeId}
              collapsed={!!collapsedNow}
              accent={live.accent}
              onPress={() => pressDoor(door.id)}
            />
          </Animated.View>
        ) : null}
      </View>

      {door && !hideEdgeTab ? (
        <EdgeTab
          tab={door}
          tone={toneSetOf(colors, door.tone ?? live.accent)}
          bottom={Math.max(insets.bottom, 20) + 4}
          style={edgeTab}
          onPress={() => pressDoor(door.id)}
        />
      ) : null}
    </Animated.View>
  );
}

/** The lone button a collapsed bar shows, if it is collapsed. Guarded rather
 *  than assumed: only an `activeId` the bar actually carries collapses it. */
function resolveCollapsed(frame: BarFrame): TabItem | null {
  return frame.collapsedTo && frame.tabs.some((tab) => tab.id === frame.activeId)
    ? frame.collapsedTo
    : null;
}

/** The set's door — drawn beside the bar, never in it. */
function doorOf(frame: BarFrame): TabItem | null {
  return frame.tabs.find((tab) => tab.raised) ?? null;
}

/** The tabs the bar itself carries: everything but the door. */
function flatTabsOf(frame: BarFrame): readonly TabItem[] {
  return frame.tabs.filter((tab) => !tab.raised);
}

/** A measured chip is kept per tab AND label, so a renamed tab re-measures. */
function faceKey(tab: TabItem): string {
  return `${tab.id}|${tab.label}`;
}

function facesFor(keys: string, widths: Record<string, number>): number[] {
  return keys ? keys.split('\n').map((key) => widths[key] ?? 0) : [];
}

/** A tone's fill, the ink drawn ON that fill, and its readable-as-text ink. */
function toneSetOf(colors: ThemeColors, tone: TabTone) {
  switch (tone) {
    case 'deal':
      return colors.deal;
    case 'caution':
      return colors.warning;
    case 'orange':
      return colors.orange;
    case 'ember':
      return EMBER;
    case 'link':
      return colors.link;
    case 'danger':
      return colors.danger;
    case 'brand':
      return { base: colors.brand, on: colors.onBrand, ink: colors.brandInk };
  }
}

/** The selected tab's bubble fill and the ink drawn on it. */
function accentOf(colors: ThemeColors, accent: TabAccent) {
  return accent === 'ember'
    ? { fill: EMBER.base, ink: EMBER.on }
    : accent === 'deal'
      ? { fill: colors.deal.base, ink: colors.deal.on }
      : { fill: BAR_COLORS.lime, ink: BAR_COLORS.onLime };
}

/**
 * How selected tab `index` is, 0 to 1: fully at the selection's index, fading
 * to nothing a whole tab away. While the selection travels, the two tabs it is
 * between share it.
 */
function focusOf(index: number, at: number, engaged: number, count: number): number {
  'worklet';
  const p = Math.min(Math.max(at, 0), Math.max(count - 1, 0));
  return engaged * Math.max(0, 1 - Math.abs(p - index));
}

/**
 * Every cell's left edge and width for a selection at `at`.
 *
 * A selected cell is as wide as its chip (`faces`, plus `ACTIVE_CHROME`) — but
 * never narrower than an even share, and never so wide the others drop below
 * `MIN_REST`. The rest split what is left evenly. Each cell blends between
 * its resting and selected width by its focus, so as the selection travels
 * the widths always add up to the row.
 */
function layoutCells(count: number, at: number, engaged: number, row: number, faces: readonly number[]) {
  'worklet';
  const lefts: number[] = [];
  const widths: number[] = [];
  const focus: number[] = [];
  if (count === 0 || row <= 0) return { lefts, widths, focus };

  const share = row / count;
  const cap = Math.max(share, row - (count - 1) * MIN_REST);
  const full: number[] = [];
  let pull = 0;
  let want = 0;
  for (let k = 0; k < count; k++) {
    const t = focusOf(k, at, engaged, count);
    const a = Math.min(Math.max((faces[k] ?? 0) + ACTIVE_CHROME, share), cap);
    focus.push(t);
    full.push(a);
    pull += t;
    want += t * a;
  }
  const rest = count - pull > 0.0001 ? (row - want) / (count - pull) : share;

  let x = 0;
  for (let k = 0; k < count; k++) {
    const w = focus[k] * full[k] + (1 - focus[k]) * rest;
    lefts.push(x);
    widths.push(w);
    x += w;
  }
  return { lefts, widths, focus };
}

/**
 * The selection bubble, sliding with the selection.
 *
 * Its box is the focus-weighted blend of the cells it is between, so it lands
 * exactly on the selected cell and carries that cell's width with it. It
 * stands aside for a set swap — the arriving tabs carry their own bubble out
 * of the door (see `SlidingCell`) — and takes over the moment the swap lands,
 * at the same place and size, so the handover is invisible.
 */
function Bubble({
  count,
  placement,
  rowWidth,
  faces,
  swap,
  accent,
}: {
  count: number;
  placement: Placement;
  rowWidth: SharedValue<number>;
  faces: readonly number[];
  swap: SharedValue<number>;
  accent: TabAccent;
}) {
  const { colors } = useTheme();
  const { at, engaged } = placement;

  const style = useAnimatedStyle(() => {
    const box = layoutCells(count, at.value, engaged.value, rowWidth.value, faces);
    let sum = 0;
    let left = 0;
    let width = 0;
    for (let k = 0; k < box.focus.length; k++) {
      const t = box.focus[k];
      sum += t;
      left += t * box.lefts[k];
      width += t * box.widths[k];
    }
    if (sum <= 0) return { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
    return {
      opacity: swap.value < 1 ? 0 : engaged.value,
      width: Math.max(0, width / sum - BUBBLE_GAP * 2),
      transform: [{ translateX: BAR_PAD_X + left / sum + BUBBLE_GAP }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.bubble, { backgroundColor: accentOf(colors, accent).fill }, style]}
    />
  );
}

/**
 * The bar's tabs for one set, each carrying its own distance to the door.
 * A collapsed bar draws none: the row's fixed height keeps its footprint.
 */
function FlatCells({
  frame,
  mode,
  progress,
  barWidth,
  rowWidth,
  moves,
  onChange,
  placement,
  faces,
}: {
  frame: BarFrame;
  mode: 'leaving' | 'arriving';
  progress: SharedValue<number>;
  barWidth: SharedValue<number>;
  rowWidth: SharedValue<number>;
  moves: boolean;
  onChange: (id: string) => void;
  placement: Placement;
  faces: readonly number[];
}) {
  const { colors } = useTheme();
  if (resolveCollapsed(frame)) return null;

  const flat = flatTabsOf(frame);
  const hasDoor = doorOf(frame) !== null;
  const count = flat.length;
  const fill = accentOf(colors, frame.accent).fill;

  return (
    <>
      {flat.map((tab, index) => (
        <SlidingCell
          key={tab.id}
          index={index}
          count={count}
          mode={mode}
          progress={progress}
          barWidth={barWidth}
          rowWidth={rowWidth}
          moves={moves}
          /* The door stands just past the bar's right end — roughly one more
             cell along — so this is the fraction of the whole width between
             this tab and it. */
          offsetRatio={hasDoor ? (count - index) / (count + 1) : 0}
          placement={placement}
          faces={faces}
          patchColor={fill}
        >
          <TabButton
            tab={tab}
            index={index}
            count={count}
            placement={placement}
            active={tab.id === frame.activeId}
            onPress={() => onChange(tab.id)}
            accent={frame.accent}
          />
        </SlidingCell>
      ))}
    </>
  );
}

/**
 * One tab's cell: placed by `layoutCells`, and travelling to or from the door
 * during a set swap.
 *
 * A component rather than a loop of `useAnimatedStyle` calls, because hooks
 * cannot be called per item of a list whose length is not fixed.
 *
 * The `patch` is the bubble's stand-in during a swap: drawn inside the cell, it
 * slides and scales with it, where the bar's own bubble would sit still.
 */
function SlidingCell({
  index,
  count,
  mode,
  progress,
  barWidth,
  rowWidth,
  moves,
  offsetRatio,
  placement,
  faces,
  patchColor,
  children,
}: {
  index: number;
  count: number;
  mode: 'leaving' | 'arriving';
  progress: SharedValue<number>;
  barWidth: SharedValue<number>;
  rowWidth: SharedValue<number>;
  moves: boolean;
  offsetRatio: number;
  placement: Placement;
  faces: readonly number[];
  patchColor: string;
  children: React.ReactNode;
}) {
  const { scaleFrom } = component.tabSetSwap;
  const { at, engaged } = placement;

  const style = useAnimatedStyle(() => {
    const box = layoutCells(count, at.value, engaged.value, rowWidth.value, faces);
    const settledness = progress.value;
    // 1 while the cell is at the door, 0 once it is home.
    const away = mode === 'leaving' ? settledness : 1 - settledness;
    const distance = moves ? barWidth.value * offsetRatio * away : 0;
    const scale = moves ? 1 - (1 - scaleFrom) * away : 1;

    return {
      left: box.lefts[index] ?? 0,
      width: box.widths[index] ?? 0,
      opacity: mode === 'leaving' ? 1 - settledness : settledness,
      transform: [{ translateX: distance }, { scale }],
    };
  });

  const patchStyle = useAnimatedStyle(() => {
    const swapping = mode === 'leaving' || progress.value < 1;
    return { opacity: swapping ? focusOf(index, at.value, engaged.value, count) : 0 };
  });

  return (
    <Animated.View style={[styles.cell, style]}>
      <Animated.View pointerEvents="none" style={[styles.patch, { backgroundColor: patchColor }, patchStyle]} />
      {children}
    </Animated.View>
  );
}

/**
 * A tab's glyph: the delivery scooter for `food`, an Ionicons outline / solid
 * pair for the other bar glyphs, or the app's line icon as a fallback.
 */
function TabGlyphIcon({
  tab,
  solid,
  size,
  color,
  cut,
  riding = false,
}: {
  tab: TabItem;
  solid: boolean;
  size: IconSize;
  color: string;
  /** The colour behind the glyph, for the details cut out of a solid shape. */
  cut?: string;
  /** Animate the scooter. Only the door asks; everywhere else it is still. */
  riding?: boolean;
}) {
  if (tab.glyph === 'food') return <ScooterGlyph size={size} color={color} cut={cut} riding={riding} />;
  if (tab.glyph) return <Ionicons name={TAB_GLYPHS[tab.glyph][solid ? 1 : 0]} size={size} color={color} />;
  return <Icon name={tab.icon} size={size} color={color} fill={solid ? withAlpha(color, 0.2) : undefined} />;
}

/** The scooter is drawn in a 28 × 24 box: wider than tall, like a scooter. */
const SCOOTER_W = 28;
const SCOOTER_H = 24;
/** Its two wheels: centre and outer radius, in that box. */
const REAR_WHEEL = { cx: 6.5, cy: 18.6 };
const FRONT_WHEEL = { cx: 22.4, cy: 18.6 };
const WHEEL_R = 3.1;

/**
 * A delivery scooter, riding — the Food door's glyph.
 *
 * Facing right: a rider leaning in to the handlebar, the delivery box behind
 * them, the seat and body, the steering column, a headlight, and two spoked
 * wheels. While `riding`:
 *
 *   - the wheels TURN, spokes and all, so it is plainly moving;
 *   - rider and body BOB on the suspension over a bumpy road, unevenly,
 *     while the wheels stay on the ground — which is what sells it as a ride
 *     rather than an icon that wobbles;
 *   - two speed lines stream off behind it and fade.
 *
 * Built from separate pieces (a body and two wheels) rather than one path, so
 * each can move on its own. `size` is the HEIGHT; the scooter is a little
 * wider than that. Still under reduced motion — the caller decides.
 */
function ScooterGlyph({
  size,
  color,
  cut,
  riding,
}: {
  size: number;
  color: string;
  cut?: string;
  riding: boolean;
}) {
  const unit = size / SCOOTER_H;
  const spin = useSharedValue(0);
  const bob = useSharedValue(0);
  const wind = useSharedValue(0);

  useEffect(() => {
    if (!riding) {
      cancelAnimation(spin);
      cancelAnimation(bob);
      cancelAnimation(wind);
      spin.value = 0;
      bob.value = 0;
      wind.value = 0;
      return;
    }
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: 520, easing: Easing.linear }), -1, false);
    /* Two bumps, a big one and a small one, then a beat of smooth road. */
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 140, easing: easing.inOut }),
        withTiming(0, { duration: 160, easing: easing.inOut }),
        withTiming(0.45, { duration: 110, easing: easing.inOut }),
        withTiming(0, { duration: 130, easing: easing.inOut }),
        withDelay(260, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
    wind.value = 0;
    wind.value = withRepeat(withTiming(1, { duration: 760, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(spin);
      cancelAnimation(bob);
      cancelAnimation(wind);
    };
  }, [riding, spin, bob, wind]);

  const wheelStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 1.2 * unit }] }));
  /* Two streaks half a cycle apart, each sliding back and fading out. */
  const streakA = useAnimatedStyle(() => ({
    opacity: riding ? 0.85 * (1 - wind.value) : 0,
    transform: [{ translateX: -wind.value * 6 * unit }],
  }));
  const streakB = useAnimatedStyle(() => {
    const t = (wind.value + 0.5) % 1;
    return {
      opacity: riding ? 0.85 * (1 - t) : 0,
      transform: [{ translateX: -t * 6 * unit }],
    };
  });

  const detail = cut ?? 'transparent';
  const width = SCOOTER_W * unit;

  return (
    <View style={{ width, height: size }}>
      {/* Speed lines, behind the box. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.streak,
          { backgroundColor: color, left: -2.5 * unit, top: 7.4 * unit, width: 4.5 * unit, height: 1.5 * unit },
          streakA,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.streak,
          { backgroundColor: color, left: -1.5 * unit, top: 12.6 * unit, width: 3.5 * unit, height: 1.5 * unit },
          streakB,
        ]}
      />

      {/* The body, on its suspension. */}
      <Animated.View style={[StyleSheet.absoluteFill, bodyStyle]}>
        <Svg width={width} height={size} viewBox={`0 0 ${SCOOTER_W} ${SCOOTER_H}`} fill="none">
          {/* Delivery box, with its lid line. */}
          <Rect x={2} y={5.6} width={7.6} height={6.6} rx={1.4} fill={color} />
          <Line x1={2.6} y1={8.2} x2={9} y2={8.2} stroke={detail} strokeWidth={1.1} strokeLinecap="round" />
          {/* The rider: head, and a body leaning in to the handlebar. */}
          <Circle cx={15.6} cy={3.2} r={2} fill={color} />
          <Path
            d="M12.6 10.6 15 6.2M15.4 6.8 18.6 7.6"
            stroke={color}
            strokeWidth={2.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Body, and the seat on it. */}
          <Path d="M3 12.1H16.4c1.2 0 1.9 1 1.6 2.1l-.2.6H4.6C3.7 14.8 3 14.1 3 13.2Z" fill={color} />
          <Rect x={10.2} y={10.4} width={5.6} height={2.2} rx={1.1} fill={color} />
          {/* Footboard, steering column and fork down to the front wheel. */}
          <Path
            d="M16.8 14.8H21.4M19.6 6.8 22.4 18.6"
            stroke={color}
            strokeWidth={2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Handlebar and headlight. */}
          <Line x1={18.4} y1={6.6} x2={21.4} y2={6.6} stroke={color} strokeWidth={2.1} strokeLinecap="round" />
          <Circle cx={22} cy={10} r={1} fill={color} />
        </Svg>
      </Animated.View>

      {/* The wheels, turning, and not bobbing: they are on the road. */}
      {[REAR_WHEEL, FRONT_WHEEL].map((wheel, i) => (
        <Animated.View
          key={i}
          style={[
            styles.wheel,
            {
              left: (wheel.cx - WHEEL_R) * unit,
              top: (wheel.cy - WHEEL_R) * unit,
              width: WHEEL_R * 2 * unit,
              height: WHEEL_R * 2 * unit,
            },
            wheelStyle,
          ]}
        >
          <Svg width={WHEEL_R * 2 * unit} height={WHEEL_R * 2 * unit} viewBox={`0 0 ${WHEEL_R * 2} ${WHEEL_R * 2}`}>
            <Circle cx={WHEEL_R} cy={WHEEL_R} r={WHEEL_R - 0.8} stroke={color} strokeWidth={1.4} fill="none" />
            <Path
              d={`M${WHEEL_R - 1.6} ${WHEEL_R}H${WHEEL_R + 1.6}M${WHEEL_R} ${WHEEL_R - 1.6}V${WHEEL_R + 1.6}`}
              stroke={color}
              strokeWidth={0.8}
              strokeLinecap="round"
            />
            <Circle cx={WHEEL_R} cy={WHEEL_R} r={0.6} fill={color} />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

/** A glyph with the tab's badge or dot pinned to its corner. */
function Marked({ tab, children }: { tab: TabItem; children: React.ReactNode }) {
  const { colors } = useTheme();
  const badgeLabel = tab.badge ? (tab.badge > 9 ? '9+' : String(tab.badge)) : undefined;

  return (
    <View>
      {children}
      {badgeLabel ? (
        <View style={[styles.badge, { backgroundColor: colors.danger.base, borderColor: BAR_COLORS.fill }]}>
          {/* A badge sits inside an 18pt disc on a 20pt icon, so it cannot take
              the 11pt floor — the same count is stated in words elsewhere. */}
          <Text variant="numMeta" style={{ color: colors.danger.on, fontSize: 10, lineHeight: 12 }}>
            {badgeLabel}
          </Text>
        </View>
      ) : tab.dot ? (
        <View style={[styles.dot, { backgroundColor: colors.danger.base, borderColor: BAR_COLORS.fill }]} />
      ) : null}
    </View>
  );
}

/** The selected tab's chip: solid glyph and bold name, side by side. */
function ActiveFace({
  tab,
  ink,
  onWidth,
}: {
  tab: TabItem;
  ink: string;
  onWidth?: (width: number) => void;
}) {
  return (
    <View
      style={styles.activeRow}
      onLayout={onWidth ? (event) => onWidth(event.nativeEvent.layout.width) : undefined}
    >
      <Marked tab={tab}>
        <TabGlyphIcon tab={tab} solid size={ACTIVE_ICON} color={ink} />
      </Marked>
      <Text
        variant="caption"
        numberOfLines={1}
        style={{ color: ink, fontSize: ACTIVE_LABEL, lineHeight: ACTIVE_LABEL + 4, fontWeight: '700', flexShrink: 1 }}
      >
        {tab.label}
      </Text>
    </View>
  );
}

/**
 * Measures every chip at its natural width, off screen and invisible. A
 * selected cell is sized from these, so a long name ("Bookings") gets the
 * room it needs at whatever font scale the phone is set to.
 */
function Ruler({ tabs, onMeasure }: { tabs: readonly TabItem[]; onMeasure: (key: string, width: number) => void }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.ruler}
    >
      {tabs.map((tab) => (
        <ActiveFace
          key={faceKey(tab)}
          tab={tab}
          ink={BAR_COLORS.onLime}
          onWidth={(width) => onMeasure(faceKey(tab), width)}
        />
      ))}
    </View>
  );
}

/**
 * The door's stand-in while the bar is hidden: a tab against the right edge
 * with an arrow and the door's name. It does what the door does.
 */
function EdgeTab({
  tab,
  tone,
  bottom,
  style,
  onPress,
}: {
  tab: TabItem;
  tone: { base: string; on: string };
  bottom: number;
  style: React.ComponentProps<typeof Animated.View>['style'];
  onPress: () => void;
}) {
  return (
    <Animated.View style={[styles.edgeTab, { bottom, backgroundColor: tone.base }, style]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Go to ${tab.label}`}
        hitSlop={6}
        style={StyleSheet.absoluteFill}
      />
      <Ionicons name="arrow-forward" size={18} color={tone.on} pointerEvents="none" />
      <Text
        variant="caption"
        numberOfLines={1}
        pointerEvents="none"
        style={{ color: tone.on, fontSize: DOOR_LABEL, lineHeight: DOOR_LABEL + 3, fontWeight: '700' }}
      >
        {tab.label}
      </Text>
    </Animated.View>
  );
}

/**
 * The door: a filled rounded-square button beside the bar, its glyph and its
 * name both inside it.
 *
 * Its fill is its tone (the burnt orange for Food), and everything on it takes
 * that tone's `on` ink. With `glow`, a ring of the same colour swells out of it
 * and fades, then rests for a beat before the next one, so it draws the eye
 * without nagging.
 */
function DoorButton({
  tab,
  active,
  collapsed,
  accent,
  onPress,
}: {
  tab: TabItem;
  active: boolean;
  /** The lone way out of a collapsed bar, rather than one of a set. */
  collapsed: boolean;
  accent: TabAccent;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  const pulse = useSharedValue(0);
  const glows = !!tab.glow && !collapsed && !reduceMotion;

  useEffect(() => {
    if (!glows) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = 0;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: easing.enter }),
        /* Back behind the button, invisibly, after a rest. */
        withDelay(1600, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [glows, pulse]);

  const handlePress = () => {
    if (!reduceMotion) {
      scale.value = withSequence(
        withTiming(0.92, { duration: 120, easing: easing.settle }),
        withTiming(1, { duration: 120, easing: easing.settle }),
      );
    }
    onPress();
  };

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.32 }],
  }));

  const toneSet = toneSetOf(colors, tab.tone ?? accent);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole={collapsed ? 'button' : 'tab'}
      accessibilityState={collapsed ? undefined : { selected: active }}
      /* The label alone would announce "Explore" on a screen that is not
         Explore. Said in full, it is the one thing this control does. */
      accessibilityLabel={collapsed ? `Back to ${tab.label}` : tab.label}
      hitSlop={6}
      style={styles.doorPress}
    >
      {glows ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.doorRing, { backgroundColor: toneSet.base }, ringStyle]}
        />
      ) : null}
      <Animated.View
        style={[styles.door, { backgroundColor: toneSet.base, shadowColor: toneSet.base }, pressStyle]}
      >
        <TabGlyphIcon
          tab={tab}
          solid
          size={tab.glyph === 'food' ? DOOR_SCOOTER : DOOR_ICON}
          color={toneSet.on}
          cut={toneSet.base}
          riding={!reduceMotion && !collapsed}
        />
        <Text
          variant="caption"
          numberOfLines={1}
          style={{ color: toneSet.on, fontSize: DOOR_LABEL, lineHeight: DOOR_LABEL + 3, fontWeight: '700' }}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function TabButton({
  tab,
  index,
  count,
  placement,
  active,
  onPress,
  accent,
}: {
  tab: TabItem;
  index: number;
  count: number;
  placement: Placement;
  active: boolean;
  onPress: () => void;
  accent: TabAccent;
}) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  const { at, engaged } = placement;

  const handlePress = () => {
    // A press acknowledgement, not an entrance, so it never runs on the tab
    // that is already active.
    if (!reduceMotion && !active) {
      scale.value = withSequence(
        withTiming(0.92, { duration: 120, easing: easing.settle }),
        withTiming(1, { duration: 120, easing: easing.settle }),
      );
    }
    onPress();
  };

  /* The chip and the resting face crossfade on the tab's focus, so the name
     turns into a chip exactly as the bubble arrives under it. */
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const restStyle = useAnimatedStyle(() => ({ opacity: 1 - focusOf(index, at.value, engaged.value, count) }));
  const activeStyle = useAnimatedStyle(() => ({ opacity: focusOf(index, at.value, engaged.value, count) }));

  const accessibilityLabel = tab.badge
    ? `${tab.label}, ${tab.badge} new`
    : tab.dot
      ? `${tab.label}, updated`
      : tab.label;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
      style={styles.tab}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, pressStyle]}>
        <Animated.View style={[styles.restFace, restStyle]}>
          <Marked tab={tab}>
            <TabGlyphIcon tab={tab} solid={false} size={REST_ICON} color={BAR_COLORS.restGlyph} />
          </Marked>
          <Text
            variant="caption"
            numberOfLines={1}
            style={{ color: BAR_COLORS.restLabel, fontSize: REST_LABEL, lineHeight: REST_LABEL + 3, fontWeight: '500' }}
          >
            {tab.label}
          </Text>
        </Animated.View>
        <Animated.View style={[styles.activeFace, activeStyle]}>
          <ActiveFace tab={tab} ink={accentOf(colors, accent).ink} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    width: '100%',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* The bar and the door, side by side. */
  dock: {
    width: '100%',
    maxWidth: 420 + DOOR_GAP + DOOR_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: DOOR_GAP,
  },
  bar: {
    flex: 1,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    paddingVertical: BAR_PAD_Y,
    paddingHorizontal: BAR_PAD_X,
    borderWidth: 1,
    position: 'relative',
  },
  floatingBar: {
    shadowColor: '#0B1A13',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 14,
  },
  /* The whole bar, minus the bar: no fill and no edge, so what is left is the
     page showing through and one button standing on it. */
  barCollapsed: { backgroundColor: 'transparent', borderWidth: 0 },
  /* One set of tabs. Its cells are absolute, so it holds the height itself. */
  row: {
    height: TAB_HEIGHT,
  },
  /* The outgoing set, laid exactly over the live row. */
  overlayRow: {
    position: 'absolute',
    left: BAR_PAD_X,
    right: BAR_PAD_X,
    top: BAR_PAD_Y,
    height: TAB_HEIGHT,
  },
  /* Wide enough that no chip is ever squeezed while it is measured. */
  ruler: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1000,
    flexDirection: 'row',
    alignItems: 'flex-start',
    opacity: 0,
  },
  cell: {
    position: 'absolute',
    top: 0,
    height: TAB_HEIGHT,
  },
  tab: {
    flex: 1,
  },
  restFace: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: REST_GAP,
  },
  activeFace: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ACTIVE_PAD_X + BUBBLE_GAP,
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ACTIVE_GAP,
    flexShrink: 1,
  },
  bubble: {
    position: 'absolute',
    left: 0,
    top: BAR_PAD_Y,
    height: TAB_HEIGHT,
    borderRadius: BUBBLE_RADIUS,
  },
  patch: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: BUBBLE_GAP,
    right: BUBBLE_GAP,
    borderRadius: BUBBLE_RADIUS,
  },
  /* Flush to the right edge, rounded on its open side. */
  edgeTab: {
    position: 'absolute',
    right: 0,
    width: EDGE_TAB_WIDTH,
    height: DOOR_SIZE,
    borderTopLeftRadius: DOOR_RADIUS,
    borderBottomLeftRadius: DOOR_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    shadowColor: '#000000',
    shadowOffset: { width: -2, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  /* The door's touch area: the button plus room for its press dip. */
  doorPress: { width: DOOR_SIZE, height: DOOR_SIZE, alignItems: 'center', justifyContent: 'center' },
  /* Shadowed in its own colour, so it glows rather than sinks. */
  door: {
    width: DOOR_SIZE,
    height: DOOR_SIZE,
    borderRadius: DOOR_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },
  /* The scooter's moving parts — see `ScooterGlyph`. */
  wheel: { position: 'absolute' },
  streak: { position: 'absolute', borderRadius: 999 },
  /* The glow: the same shape, behind the door, scaled out and faded. */
  doorRing: {
    position: 'absolute',
    width: DOOR_SIZE,
    height: DOOR_SIZE,
    borderRadius: DOOR_RADIUS,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
});
