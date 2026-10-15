import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import {
  runOnJS,
  runOnUI,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { component, easing } from '@/constants/motion';
import { useReduceMotion } from '@/context/ThemeContext';
import { createValueStore, type ValueStore } from '@/utils/valueStore';

/**
 * Whether the bottom bar is currently out of the way, and the one gesture that
 * decides it.
 *
 * A feed is read with the thumb, and the bar sits exactly where the thumb is.
 * Reading DOWN a list is the one time nobody is about to change tabs, so the
 * bar leaves; the first flick back UP is somebody looking for something, which
 * is when a control is wanted again. Zomato and Swiggy both do this, and it is
 * the reason their feeds feel taller than they are.
 *
 * ## Why this is a context and not a prop
 *
 * There is one bar and seven scrollables that can move it — four stay tabs and
 * three food screens — and the bar is a sibling of all of them rather than a
 * parent. Threading a handler down through `FoodModule` to each screen would
 * be the same value written seven times in seven signatures.
 *
 * ## Why the offset is a shared value and the height is not
 *
 * `hidden` changes sixty times a second while the bar is moving, so it lives on
 * the UI thread and nothing it drives re-renders React. `height` changes when
 * the bar is measured and then essentially never — it is ordinary state,
 * because the screens need it as a plain number to pad their content by.
 */
export type BottomBarValue = {
  /** 0 while the bar is up, 1 once it is fully out of the way. Multiply by
   *  `height` for a translation; the bar and the docked cart bar both do. */
  hidden: SharedValue<number>;
  /** The bar's measured height, safe-area inset included. 0 until it has been
   *  laid out once. Every scrollable under the bar pads its content by this,
   *  because the bar floats over them rather than sitting in the column. */
  height: number;
  /** Called by the bar itself, from its own `onLayout`. */
  setHeight: (height: number) => void;
  /** Hand this to any vertical scrollable's `onScroll`, with
   *  `scrollEventThrottle={16}` beside it. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /**
   * The same, as a worklet taking the offset: call it from a
   * `useAnimatedScrollHandler`, and the bar follows the thumb without the
   * scroll touching the JS thread at all. `onScroll` is this, hopped across.
   */
  onScrollY: (y: number) => void;
  /** Whether the bar is heading out of the way (true) or back up (false).
   *  Read it through `useBottomBarAway`. */
  awayStore: ValueStore<boolean>;
  /** Put the bar back up regardless of the gesture \u2014 for a tab change, where
   *  the next screen's scroll position says nothing about this one's. */
  showBar: () => void;
};

const BottomBarContext = createContext<BottomBarValue | null>(null);

/**
 * How far a finger has to travel in one direction before the bar answers.
 *
 * Not zero, and not a single frame's delta: a flick that ends with a few
 * pixels of wobble would otherwise flip the bar twice on the way to settling,
 * and a bar that flickers reads as broken rather than as responsive.
 */
const TRAVEL_THRESHOLD = 14;

/**
 * The top of the feed, where the bar is always up.
 *
 * A screen that has just been opened, or pulled back to the start, is not a
 * screen anybody is reading down \u2014 and hiding a control on the first 60pt of
 * a short list would leave it hidden with nothing left to scroll back up.
 */
const ALWAYS_SHOWN_ABOVE = 64;

/**
 * How long the bar has to have been on its way out before `useBottomBarAway`
 * says it is gone — the hide spring's travel, so nothing that pauses on it
 * freezes while it is still sliding off in plain sight.
 */
const AWAY_SETTLE_MS = 450;

/* Read once, out here, so the worklet below carries these few numbers to the
   UI thread rather than the whole motion-token module. */
const { reducedDuration: HIDE_REDUCED_MS, ...HIDE_SPRING } = component.bottomBarHide;
const HIDE_REDUCED_EASING = easing.standard;

export function BottomBarProvider({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReduceMotion();
  const hidden = useSharedValue(0);
  const [height, setHeightState] = useState(0);
  const [awayStore] = useState(() => createValueStore(false));

  /*
   * The gesture's state, on the UI thread.
   *
   * Shared values rather than refs, because the Explore feed reads its scroll
   * on the UI thread (see `onScrollY`) and the decision is made there, beside
   * the spring it starts — so following the thumb never waits on the JS
   * thread, however busy a tap has made it.
   *
   * `lastY` and `travel`: where the last scroll event left us, and how far the
   * finger has carried in the current direction.
   */
  const lastY = useSharedValue(0);
  const travel = useSharedValue(0);
  /* Set whenever the screen under the bar changes. One `lastY` is shared by
     every feed, so the first event from a NEW one would otherwise be read as a
     single enormous downward flick — arrive on a list already scrolled to 500
     and the bar would hide itself on the first pixel of movement. The next
     event after this flag is spent adopting the new position and nothing
     else. */
  const resync = useSharedValue(false);
  /* The value `hidden` is animating TOWARDS. `hidden.value` cannot answer this
     — mid-flight it is some fraction between the two, so comparing against it
     would restart the animation on every frame. */
  const target = useSharedValue(0);

  const reportAway = useCallback((away: boolean) => awayStore.set(away), [awayStore]);

  const setHidden = useCallback(
    (next: 0 | 1) => {
      'worklet';
      if (target.value === next) return;
      target.value = next;

      /*
       * A spring, and the same one in both directions.
       *
       * Leaving and returning are not two different events here — they are one
       * strip of chrome tracking a thumb, and a thumb reverses mid-travel all
       * the time. `withSpring` picks the reversal up at whatever position and
       * velocity it is already carrying; the timing curve this replaced
       * restarted its easing from there instead, which is the hitch that made
       * a turnaround read as a snap. See `component.bottomBarHide`.
       */
      hidden.value = reduceMotion
        ? withTiming(next, { duration: HIDE_REDUCED_MS, easing: HIDE_REDUCED_EASING })
        : withSpring(next, HIDE_SPRING);
      /* Once per change of direction, never per frame. */
      runOnJS(reportAway)(next === 1);
    },
    [hidden, target, reduceMotion, reportAway],
  );

  const onScrollY = useCallback(
    (y: number) => {
      'worklet';
      if (resync.value) {
        resync.value = false;
        lastY.value = y;
        travel.value = 0;
        return;
      }

      const dy = y - lastY.value;
      lastY.value = y;

      if (y <= ALWAYS_SHOWN_ABOVE) {
        travel.value = 0;
        setHidden(0);
        return;
      }

      /* A change of direction starts the measurement over, so the threshold is
         14pt of DELIBERATE travel rather than 14pt of net drift. */
      if ((dy > 0) !== (travel.value > 0)) travel.value = 0;
      travel.value += dy;

      if (travel.value > TRAVEL_THRESHOLD) setHidden(1);
      else if (travel.value < -TRAVEL_THRESHOLD) setHidden(0);
    },
    [resync, lastY, travel, setHidden],
  );

  /* For the scrollables that report on the JS thread: the same worklet, in the
     same order, one hop across. */
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      runOnUI(onScrollY)(event.nativeEvent.contentOffset.y);
    },
    [onScrollY],
  );

  const showBar = useCallback(() => {
    runOnUI(() => {
      'worklet';
      resync.value = true;
      travel.value = 0;
      setHidden(0);
    })();
  }, [resync, travel, setHidden]);

  const setHeight = useCallback((next: number) => {
    setHeightState((current) => (current === next ? current : next));
  }, []);

  const value = useMemo(
    () => ({ hidden, height, setHeight, onScroll, onScrollY, awayStore, showBar }),
    [hidden, height, setHeight, onScroll, onScrollY, awayStore, showBar],
  );

  return <BottomBarContext.Provider value={value}>{children}</BottomBarContext.Provider>;
}

export function useBottomBar(): BottomBarValue {
  const value = useContext(BottomBarContext);
  if (!value) throw new Error('useBottomBar must be used inside BottomBarProvider');
  return value;
}

/**
 * True once the bar has slid out of sight on scroll, false the moment it
 * starts back up.
 *
 * For what lives ON the bar and loops forever — the Food door's scooter and
 * glow: off screen, they have nothing to animate for. True only after
 * `AWAY_SETTLE_MS`, so a loop never freezes while the bar is still visibly
 * leaving; false at once, so it is already moving as the bar comes back.
 * Only the components that call this re-render when it changes.
 */
export function useBottomBarAway(): boolean {
  const { awayStore } = useBottomBar();
  const leaving = useSyncExternalStore(awayStore.subscribe, awayStore.get, awayStore.get);
  const [away, setAway] = useState(false);

  useEffect(() => {
    if (!leaving) {
      setAway(false);
      return undefined;
    }
    const timer = setTimeout(() => setAway(true), AWAY_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return away;
}
