import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { component, easing } from '@/constants/motion';
import { useReduceMotion } from '@/context/ThemeContext';

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

export function BottomBarProvider({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReduceMotion();
  const hidden = useSharedValue(0);
  const [height, setHeightState] = useState(0);

  /* Where the last scroll event left us, and how far the finger has carried in
     the current direction. Refs rather than state: this runs on every scroll
     frame, and the whole point is that it re-renders nothing. */
  const lastY = useRef(0);
  const travel = useRef(0);
  /* Set whenever the screen under the bar changes. One `lastY` is shared by
     every feed, so the first event from a NEW one would otherwise be read as a
     single enormous downward flick — arrive on a list already scrolled to 500
     and the bar would hide itself on the first pixel of movement. The next
     event after this flag is spent adopting the new position and nothing
     else. */
  const resync = useRef(false);
  /* The value `hidden` is animating TOWARDS. `hidden.value` cannot answer this
     \u2014 mid-flight it is some fraction between the two, so comparing against it
     would restart the animation on every frame. */
  const target = useRef(0);

  const setHidden = useCallback(
    (next: 0 | 1) => {
      if (target.current === next) return;
      target.current = next;

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
      const { reducedDuration, ...spring } = component.bottomBarHide;
      hidden.value = reduceMotion
        ? withTiming(next, { duration: reducedDuration, easing: easing.standard })
        : withSpring(next, spring);
    },
    [hidden, reduceMotion],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;

      if (resync.current) {
        resync.current = false;
        lastY.current = y;
        travel.current = 0;
        return;
      }

      const dy = y - lastY.current;
      lastY.current = y;

      if (y <= ALWAYS_SHOWN_ABOVE) {
        travel.current = 0;
        setHidden(0);
        return;
      }

      /* A change of direction starts the measurement over, so the threshold is
         14pt of DELIBERATE travel rather than 14pt of net drift. */
      if ((dy > 0) !== (travel.current > 0)) travel.current = 0;
      travel.current += dy;

      if (travel.current > TRAVEL_THRESHOLD) setHidden(1);
      else if (travel.current < -TRAVEL_THRESHOLD) setHidden(0);
    },
    [setHidden],
  );

  const showBar = useCallback(() => {
    resync.current = true;
    travel.current = 0;
    setHidden(0);
  }, [setHidden]);

  const setHeight = useCallback((next: number) => {
    setHeightState((current) => (current === next ? current : next));
  }, []);

  const value = useMemo(
    () => ({ hidden, height, setHeight, onScroll, showBar }),
    [hidden, height, setHeight, onScroll, showBar],
  );

  return <BottomBarContext.Provider value={value}>{children}</BottomBarContext.Provider>;
}

export function useBottomBar(): BottomBarValue {
  const value = useContext(BottomBarContext);
  if (!value) throw new Error('useBottomBar must be used inside BottomBarProvider');
  return value;
}
