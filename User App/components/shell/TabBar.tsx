import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, type IconName } from '@/components/ui';
import { component, easing } from '@/constants/motion';
import { elevation } from '@/constants/tokens';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

export type TabItem = {
  id: string;
  label: string;
  icon: IconName;
  /** A number badge. 1–9 render as-is; anything above shows 9+. */
  badge?: number;
  /** A bare dot: "something changed", with no count to report. */
  dot?: boolean;
  /**
   * Renders as a filled disc lifted above the bar's top edge — the one
   * sanctioned break from "tabs are peers". A raised tab is a door to another
   * module, not a fourth sibling screen, and the highlight has to read at rest:
   * a module door matters most when it is NOT the active tab.
   */
  raised?: boolean;
  /**
   * Palette of the raised disc. The Food module ships in the caution set.
   *
   * It was the DANGER set until the Dock repaint, and that was always a borrow
   * rather than a choice — the old palette simply had no third colour to spend.
   * It is untenable now: Dock's danger is a true red at #B3261E, and painting
   * the door to a module in the one colour reserved for a failed payment and a
   * cancelled booking teaches the wrong thing about red. Caution's burnt orange
   * is a real role in this palette, reads warm next to food, and is nowhere
   * near the accent teal it has to be told apart from.
   */
  tone?: 'brand' | 'caution';
};

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
   * opposite. So the chrome goes: surface, top border and the other tabs, all
   * of it, leaving one button to bring you back.
   *
   * The button keeps the ACTIVE tab's slot, so the door out appears exactly
   * where the door in was — tap the red Food disc at the right-hand end and it
   * becomes a green Explore disc without moving a pixel.
   *
   * The bar keeps its footprint rather than dropping out of layout. The disc
   * is a floating control with a text label under it, and content scrolling
   * beneath that label is the one thing that would make it unreadable; the
   * band it leaves is plain page background, which is what "the bar is gone"
   * looks like. The measured height is still reported either way, so the
   * snackbar and the waiting pill read one number whichever state it is in.
   */
  collapsedTo?: TabItem | null;
  /**
   * Names the SET of destinations currently in the bar — `stay`, `food`.
   *
   * A change here, and only a change here, plays the swap. It cannot be
   * inferred from `tabs`: that array is rebuilt whenever a badge or a dot
   * changes, and animating the whole bar because an order went live would be
   * movement with nothing behind it. A string the caller controls says
   * "this is a different set of places" and nothing else does.
   *
   * Leave it undefined and the bar behaves exactly as it did before — every
   * change is a straight cut.
   */
  setId?: string;
};

/** Everything needed to draw one frame of the bar, so an outgoing set can be
 *  held on screen after the props that produced it have already changed. */
type BarFrame = {
  tabs: readonly TabItem[];
  activeId: string;
  collapsedTo: TabItem | null;
  setId?: string;
};

/**
 * The bottom tab bar. 56pt of content plus the safe-area inset.
 *
 * Labels are always visible. An icon-only bar asks a first-time user to guess,
 * and this audience has never seen the app before — the icon set cannot carry
 * "Bookings" versus "Explore" on its own.
 *
 * There is deliberately no sliding pill or underline. Tabs are peers, not
 * points on a line: Explore is not nearer to Bookings than it is to Profile,
 * and a travelling indicator asserts an adjacency and a direction that a
 * lateral move does not have. A pill also animates position during a screen
 * swap, so a stuttering swap leaves it stranded between two tabs.
 */
export function TabBar({ tabs, activeId, onChange, collapsedTo, setId }: TabBarProps) {
  const { colors, space, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const live: BarFrame = { tabs, activeId, collapsedTo: collapsedTo ?? null, setId };

  /*
   * The set that is on its way out, kept mounted until the swap finishes.
   *
   * React would otherwise unmount it the instant the props changed, and there
   * would be nothing left to animate away — the whole point of the transition
   * is that both sets are on screen at once for 280ms.
   */
  const [outgoing, setOutgoing] = useState<BarFrame | null>(null);
  /** The frame the previous render drew, which is the one that has to leave. */
  const lastFrame = useRef<BarFrame>(live);

  /** 0 at the start of a swap, 1 at rest. */
  const swap = useSharedValue(1);
  /** The bar's own width, so a cell's travel is measured, never guessed. */
  const barWidth = useSharedValue(360);

  const settled = useCallback(() => setOutgoing(null), []);

  useEffect(() => {
    const before = lastFrame.current;

    // No set named, or the same set — a badge changed, not the destinations.
    if (!setId || !before.setId || before.setId === setId) return;

    setOutgoing(before);
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
  }, [setId, reduceMotion, swap, settled]);

  /*
   * Remember what was just drawn — every render, and deliberately declared
   * AFTER the swap effect so it runs after it on the same commit.
   *
   * Updating this inside the swap effect instead would only refresh it on the
   * renders that swapped, so the frame animating out would be whatever the bar
   * looked like at the last swap rather than a moment ago: leave Food from
   * Orders and you would watch Home slide away.
   */
  useEffect(() => {
    lastFrame.current = live;
  });

  /*
   * The bar owns the bottom edge, so the floating request pill sits above it
   * rather than over the tabs. Measured rather than assumed — the height is
   * 56pt plus a safe-area inset that differs on every device, and a pill
   * placed with a guessed number lands on the tabs on half the fleet.
   */
  const { reserveBottom, releaseBottom } = usePendingRequest();
  useEffect(() => () => releaseBottom('tabbar'), [releaseBottom]);

  const measure = (event: LayoutChangeEvent) => {
    reserveBottom('tabbar', event.nativeEvent.layout.height);
    barWidth.value = event.nativeEvent.layout.width;
  };

  /* Reduced motion keeps the crossfade and drops the travel and the scale.
     The user still learns that one set replaced another; they are just not
     moved to learn it. */
  const moves = !reduceMotion;
  const collapsedNow = resolveCollapsed(live);
  const gap = space[1] + 1;

  return (
    <View
      // Not a tablist when it is holding one button: a screen reader that
      // announces "tab 4 of 4" for a lone way-out control is describing a bar
      // that is not on screen.
      accessibilityRole={collapsedNow ? undefined : 'tablist'}
      onLayout={measure}
      style={[
        styles.bar,
        collapsedNow
          ? styles.barCollapsed
          : { backgroundColor: colors.surface, borderTopColor: colors.borderSubtle },
        { paddingBottom: insets.bottom + layout.bottomInsetExtra },
      ]}
    >
      {/*
        The three flat tabs on their way out, converging on the disc.

        `pointerEvents="none"` and never the other way round: the motion rules
        forbid an animation gating an interaction, so the arriving tabs are
        tappable from their first frame while these are already untouchable.
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
            moves={moves}
            onChange={onChange}
            gap={gap}
          />
        </View>
      ) : null}

      {/* The live three. In normal flow, so this row is what gives the bar its
          height — the overlays above and below it are all absolute. */}
      <View style={styles.row}>
        <FlatCells
          frame={live}
          mode="arriving"
          progress={swap}
          barWidth={barWidth}
          moves={moves}
          onChange={onChange}
          gap={gap}
        />
      </View>

      {/*
        The disc, and only the disc — stationary, and drawn last so the flat
        tabs pass UNDERNEATH it on their way in and out. That is the whole
        illusion: they are going into the door, not past it.

        It swaps its icon and its tone the instant it is pressed rather than
        crossfading. Two filled discs of different colours dissolved through
        each other spend 100ms as a muddy brown, and an instant change on the
        thing under the thumb reads as a response to the press.

        `box-none` so only the disc itself catches a touch; the empty slots
        beside it let taps fall through to the live row underneath.
      */}
      <View pointerEvents="box-none" style={styles.overlayRow}>
        <RaisedCell frame={live} onChange={onChange} gap={gap} />
      </View>
    </View>
  );
}

/** Which slot the lone button inherits. Guarded rather than assumed: an
 *  `activeId` that is not in `tabs` (Profile, which lost its tab to Food and is
 *  now reached from the header) has no slot to hold, and collapsing onto slot
 *  -1 would silently park the button on the left edge. */
function collapsedSlotOf(frame: BarFrame): number {
  return frame.collapsedTo ? frame.tabs.findIndex((tab) => tab.id === frame.activeId) : -1;
}

function resolveCollapsed(frame: BarFrame): TabItem | null {
  return collapsedSlotOf(frame) >= 0 ? frame.collapsedTo : null;
}

/**
 * Which slot holds the raised disc — the one cell that never moves.
 *
 * In a collapsed bar the lone button IS the raised one, so the two ideas
 * resolve to the same slot and the rest of the bar is empty either way.
 */
function raisedSlotOf(frame: BarFrame): number {
  const collapsedSlot = collapsedSlotOf(frame);
  if (collapsedSlot >= 0) return collapsedSlot;
  return frame.tabs.findIndex((tab) => tab.raised);
}

/** An empty cell. It exists to hold a position, so it must never take a touch. */
function Spacer() {
  return <View pointerEvents="none" style={styles.cell} />;
}

/**
 * The flat tabs of one set, each carrying its own distance to the disc.
 *
 * Every slot is rendered — the raised one as an empty spacer — because the
 * four flex:1 cells are the only thing keeping the three sets (leaving, live,
 * disc) in the same columns as each other.
 */
function FlatCells({
  frame,
  mode,
  progress,
  barWidth,
  moves,
  onChange,
  gap,
}: {
  frame: BarFrame;
  mode: 'leaving' | 'arriving';
  progress: SharedValue<number>;
  barWidth: SharedValue<number>;
  moves: boolean;
  onChange: (id: string) => void;
  gap: number;
}) {
  const raisedSlot = raisedSlotOf(frame);
  const collapsed = resolveCollapsed(frame);
  const count = frame.tabs.length || 1;

  return (
    <>
      {frame.tabs.map((tab, index) => {
        // The disc's own slot, and every slot of a collapsed bar, stays empty
        // here — a collapsed bar has no flat tabs to fly anywhere.
        if (index === raisedSlot || collapsed) return <Spacer key={tab.id} />;

        return (
          <SlidingCell
            key={tab.id}
            mode={mode}
            progress={progress}
            barWidth={barWidth}
            moves={moves}
            /* Cells are equal width, so the gap from this slot's centre to the
               disc's is exactly this fraction of the bar. */
            offsetRatio={(raisedSlot - index) / count}
          >
            <TabButton
              tab={tab}
              active={tab.id === frame.activeId}
              onPress={() => onChange(tab.id)}
              gap={gap}
            />
          </SlidingCell>
        );
      })}
    </>
  );
}

/** The raised disc of one set, in its slot, with the rest of the row empty. */
function RaisedCell({
  frame,
  onChange,
  gap,
}: {
  frame: BarFrame;
  onChange: (id: string) => void;
  gap: number;
}) {
  const raisedSlot = raisedSlotOf(frame);
  const collapsed = resolveCollapsed(frame);

  return (
    <>
      {frame.tabs.map((tab, index) => {
        if (index !== raisedSlot) return <Spacer key={tab.id} />;

        /* Keyed by the SLOT, not by the button in it. Keyed by the button,
           `explore` would collide with the empty first slot — and the swap
           would also tear down the node it is replacing, losing the disc that
           is standing in exactly that spot. */
        return collapsed ? (
          <TabButton
            key={tab.id}
            tab={collapsed}
            active={false}
            emphasised
            role="button"
            onPress={() => onChange(collapsed.id)}
            gap={gap}
          />
        ) : (
          <TabButton
            key={tab.id}
            tab={tab}
            active={tab.id === frame.activeId}
            onPress={() => onChange(tab.id)}
            gap={gap}
          />
        );
      })}
    </>
  );
}

/**
 * One flat tab, travelling to or from the disc.
 *
 * A component rather than a loop of `useAnimatedStyle` calls, because hooks
 * cannot be called per item of a list whose length is not fixed.
 *
 * The distance is read from `barWidth` inside the worklet rather than passed in
 * as a number, so a rotation mid-transition lands the cell in the right place
 * instead of the place the old width implied.
 */
function SlidingCell({
  mode,
  progress,
  barWidth,
  moves,
  offsetRatio,
  children,
}: {
  mode: 'leaving' | 'arriving';
  progress: SharedValue<number>;
  barWidth: SharedValue<number>;
  moves: boolean;
  offsetRatio: number;
  children: React.ReactNode;
}) {
  const { scaleFrom } = component.tabSetSwap;

  const style = useAnimatedStyle(() => {
    const settledness = progress.value;
    // 1 while the cell is at the disc, 0 once it is home.
    const away = mode === 'leaving' ? settledness : 1 - settledness;
    const distance = moves ? barWidth.value * offsetRatio * away : 0;
    const scale = moves ? 1 - (1 - scaleFrom) * away : 1;

    return {
      opacity: mode === 'leaving' ? 1 - settledness : settledness,
      transform: [{ translateX: distance }, { scale }],
    };
  });

  return <Animated.View style={[styles.cell, style]}>{children}</Animated.View>;
}

function TabButton({
  tab,
  active,
  onPress,
  gap,
  /**
   * Wear the active label treatment without being the selected tab.
   *
   * The collapsed button is never "selected" — the module is. But it is the
   * only control left on the bar, and a tertiary-grey name under a filled
   * brand disc reads as something switched off.
   */
  emphasised = false,
  /** A collapsed bar holds a way out, not one of several destinations. */
  role = 'tab',
}: {
  tab: TabItem;
  active: boolean;
  onPress: () => void;
  gap: number;
  emphasised?: boolean;
  role?: 'tab' | 'button';
}) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);

  const progress = useDerivedValue(
    () =>
      withTiming(active || emphasised ? 1 : 0, {
        duration: reduceMotion ? 100 : 160,
        easing: easing.standard,
      }),
    [active, emphasised, reduceMotion],
  );

  const handlePress = () => {
    // The dip lands where the finger did. It is a press acknowledgement, not
    // an entrance, so it never runs on the tab that is already active.
    if (!reduceMotion && !active) {
      scale.value = withSequence(
        withTiming(0.92, { duration: 120, easing: easing.settle }),
        withTiming(1, { duration: 120, easing: easing.settle }),
      );
    }
    onPress();
  };

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const restLabelStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const activeLabelStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const badgeLabel = tab.badge ? (tab.badge > 9 ? '9+' : String(tab.badge)) : undefined;
  const accessibilityLabel =
    role === 'button'
      ? // The label alone would announce "Explore" on a screen that is not
        // Explore. Said in full, it is the one thing this control does.
        `Back to ${tab.label}`
      : badgeLabel
        ? `${tab.label}, ${tab.badge} new`
        : tab.dot
          ? `${tab.label}, updated`
          : tab.label;

  /* The raised disc is a solid fill, so its glyph takes the `on` ink of its
     tone — never white by assumption; both flip between modes. The active
     label follows the same tone so the door and its name agree. */
  const discBg = tab.tone === 'caution' ? colors.warning.base : colors.brand;
  const discInk = tab.tone === 'caution' ? colors.warning.on : colors.onBrand;
  const activeInk = tab.tone === 'caution' ? colors.warning.ink : colors.brandInk;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole={role}
      accessibilityState={role === 'tab' ? { selected: active } : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[styles.tab, { gap }]}
    >
      <Animated.View
        style={[
          iconStyle,
          tab.raised
            ? [styles.raisedDisc, { backgroundColor: discBg, borderColor: colors.surface }, elevation.float]
            : null,
        ]}
      >
        <Icon
          name={tab.icon}
          size={24}
          color={tab.raised ? discInk : active ? activeInk : colors.textTertiary}
        />
        {badgeLabel ? (
          <View style={[styles.badge, { backgroundColor: colors.danger.base, borderColor: colors.surface }]}>
            {/* The one deliberate override left. A badge sits inside a 16pt
                disc on a 24pt icon, so it cannot take the 11pt floor — and it
                is exempt from it for the reason the accessibility pass allows:
                the same count is stated in words on the Alerts row in Profile,
                so nothing is only available here. */}
            <Text variant="numMeta" style={{ color: colors.danger.on, fontSize: 10, lineHeight: 12 }}>
              {badgeLabel}
            </Text>
          </View>
        ) : tab.dot ? (
          <View style={[styles.dot, { backgroundColor: colors.danger.base, borderColor: colors.surface }]} />
        ) : null}
      </Animated.View>

      {/* Two overlaid label nodes with opposing opacity. fontWeight cannot be
          interpolated in React Native — it snaps between discrete weights, so
          a single animated node pops in the middle of the crossfade.

          The WIDER copy defines the layout box, and here that is the 600 one
          despite being the smaller point size: `label` is UPPERCASE with 1.1pt
          of tracking, so "BOOKINGS" at 11pt runs about 65pt against roughly
          46pt for "Bookings" at 11.5pt. Comparing point sizes alone gets this
          backwards — uppercasing and tracking are part of the width. */}
      <View>
        <Animated.View style={activeLabelStyle}>
          <Text variant="label" style={{ color: activeInk, letterSpacing: 0 }}>
            {tab.label}
          </Text>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.restLabel, restLabelStyle]}>
          <Text variant="caption" color="tertiary">
            {tab.label}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth },
  /* One set of tabs. Two of these exist during a swap, stacked. */
  row: { flexDirection: 'row' },
  /*
     A row stacked over the live one — the leaving tabs, and the disc.

     Pinned to the top of the bar's content box rather than stretched with
     `absoluteFill`: that would give it the bar's full height INCLUDING the
     safe-area padding, and its cells — `flex: 1` in a row, so stretched on the
     cross axis — would sit taller and lower than the ones they line up with.
     Every layer has to be pixel-aligned or the swap reads as a jump.
  */
  overlayRow: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row' },
  /* The whole bar, minus the bar: no fill and no edge, so what is left is the
     page showing through and one button standing on it. */
  barCollapsed: { backgroundColor: 'transparent', borderTopWidth: 0 },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  /*
     The cell a tab sits in, and the thing that gets translated.

     It holds the column and NOTHING else — no `alignItems: 'center'`. Centring
     here would size the button to its own text instead of stretching it across
     the cell, quietly shrinking a 97pt touch target to the width of the word
     "Bookings". The button already centres its own contents.
  */
  cell: { flex: 1, minHeight: 56 },
  /* 46pt disc lifted 26pt above the bar, ringed in `surface` so it reads as
     punched through the edge rather than pasted on top of it. */
  raisedDisc: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 3,
    marginTop: -26,
    alignItems: 'center',
    justifyContent: 'center',
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
  restLabel: { alignItems: 'center', justifyContent: 'center' },
});
