import React, { useEffect, useState } from 'react';
import { Modal as RNModal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
/* The library's KeyboardAvoidingView, not React Native's — see the note on
   its use in `app/support/[id].tsx`. A sheet is exactly the same shape of
   problem: content anchored to the bottom of the screen, with a field inside
   it a keyboard can cover, and RN's own component needs a per-platform
   `behavior` ternary to do anything on Android at all. */
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from './Button';
import { Text } from './Text';
import { easing } from '@/constants/motion';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';

/** Physical, but never bouncy about money — overshoot is capped at 1.5%. */
const SHEET_SPRING = { damping: 22, stiffness: 260, mass: 0.9, overshootClamping: false };
/** Past this downward velocity the sheet is being thrown away, not scrolled. */
const DISMISS_VELOCITY = 550;

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Sticky footer. It lives in the bottom third, inside thumb reach. */
  footer?: React.ReactNode;
};

/** The slide in. There is no slide out — see the close in `BottomSheet`. */
const OPEN_MS = 280;
const FADE_MS = 160;

/**
 * The handle is decorative — the drag gesture lives on the whole header, which
 * is a far larger target than a 40×4 bar.
 *
 * ## The sheet sits on the real bottom edge
 *
 * The modal is `statusBarTranslucent` and `navigationBarTranslucent`. The app
 * runs edge-to-edge on Android, and a modal without both laid itself out for
 * the full screen height inside a window that started BELOW the status bar —
 * so the bottom of every sheet hung off the screen. "Long stay" showed and
 * "Short stay", the row beneath it, could not be reached. `paddingBottom`
 * below already clears the navigation bar with the safe-area inset.
 *
 * ## One driven value, not a layout animation
 *
 * The slide was `SlideInDown` / `SlideOutDown` — layout animations, which on
 * Android's new architecture can stall partway inside a native modal, leaving
 * a sheet frozen half on screen. And an exit animation could never play: the
 * modal unmounted the instant `visible` went false. Now `progress` runs 0 → 1
 * on open, the scrim and the sheet both read it. Closing unmounts at once, so
 * the screen underneath takes the very next tap.
 */
export function BottomSheet({ visible, onClose, title, children, footer }: BottomSheetProps) {
  const { colors, space, radius, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { height: windowHeight } = useWindowDimensions();

  /** The finger's drag, downward only. */
  const translateY = useSharedValue(0);
  /** 0 parked below the screen, 1 fully up. */
  const progress = useSharedValue(0);
  /* How far the sheet travels to leave: its own height once measured, the
     window's until then, so the first frame is always off screen. */
  const sheetHeight = useSharedValue(windowHeight);
  /** The modal outlives `visible` by the length of the slide out. */
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = 0;
      progress.value = withTiming(1, {
        duration: reduceMotion ? FADE_MS : OPEN_MS,
        easing: easing.enter,
      });
      return;
    }
    /*
     * Closing takes the modal down AT ONCE, with no slide out.
     *
     * A modal is its own native window, and while it is up it takes every
     * touch on the screen — `pointerEvents` cannot pass one through it. The
     * slide out kept that window up, invisible, for `CLOSE_MS` and then until
     * the JS thread got round to unmounting it, so the tap that came straight
     * after a choice ("Stay type", then "How many months") landed on a scrim
     * nobody could see and did nothing. That was the "tap it twice" on every
     * dropdown. The page under a sheet must be live the moment it closes.
     */
    progress.value = 0;
    setMounted(false);
  }, [visible, reduceMotion, progress, translateY]);

  const pan = Gesture.Pan()
    .onChange((event) => {
      // Downward only. Dragging up must not detach the sheet from the edge.
      translateY.value = Math.max(0, translateY.value + event.changeY);
    })
    .onEnd((event) => {
      if (event.velocityY > DISMISS_VELOCITY || translateY.value > 120) {
        /* The drag stays where the finger left it; the close slides on from
           there rather than snapping back up first. */
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, SHEET_SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      /* Reduced motion keeps the fade and drops the travel. */
      return { opacity: progress.value, transform: [{ translateY: translateY.value }] };
    }
    return {
      transform: [{ translateY: translateY.value + (1 - progress.value) * sheetHeight.value }],
    };
  });
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  if (!mounted) return null;

  return (
    <RNModal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* A modal is its own native window on Android, outside the app's root
          gesture view — gestures inside it need a root of their own or they
          are not recognised. */}
      <GestureHandlerRootView style={styles.flex}>
      {/* Scrim fades with the sheet, on the same value. */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      {/* `behavior="padding"` adds bottom padding equal to the keyboard's
          height while it is open, which — combined with this host's own
          `justifyContent: 'flex-end'` — pushes the whole sheet up rather than
          leaving a focused field to be covered. Without it, a name or address
          field low in a sheet's content is typed into blind, same as the
          composer this pattern was first fixed on. */}
      <KeyboardAvoidingView style={styles.sheetHost} pointerEvents="box-none" behavior="padding">
          <Animated.View
            onLayout={(event) => {
              const measured = event.nativeEvent.layout.height;
              if (measured > 0) sheetHeight.value = measured;
            }}
            style={[
              sheetStyle,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.sheet,
                borderTopRightRadius: radius.sheet,
                paddingBottom: insets.bottom + layout.bottomInsetExtra,
                maxHeight: '90%',
              },
            ]}
          >
            {/* The drag lives on the header only. It was on the whole sheet,
                so a list inside — "How many months", twelve rows — could not
                be scrolled: every vertical drag on it was read as pulling the
                sheet down, and the list sat stuck. */}
            <GestureDetector gesture={pan}>
              <View style={[styles.sheetHeader, { paddingHorizontal: space[4], paddingTop: space[3], gap: space[3] }]}>
                <View style={[styles.handle, { backgroundColor: colors.border, borderRadius: radius.pill }]} />
                <View style={styles.sheetTitleRow}>
                  <Text variant="title2" style={styles.flex}>
                    {title}
                  </Text>
                  <IconButton name="close" onPress={onClose} accessibilityLabel="Close" />
                </View>
              </View>
            </GestureDetector>

            {/* `flexShrink` so content taller than the 90% cap scrolls inside
                the sheet instead of pushing the footer off the bottom. */}
            <View style={{ paddingHorizontal: space[4], flexShrink: 1 }}>{children}</View>

            {footer ? (
              <View
                style={[
                  styles.sheetFooter,
                  { paddingHorizontal: space[4], paddingTop: space[3], borderTopColor: colors.borderSubtle },
                ]}
              >
                {footer}
              </View>
            ) : null}
          </Animated.View>
      </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </RNModal>
  );
}

export type DialogProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** The single way out. "Got it", "Close" — never a decision. */
  dismissLabel?: string;
};

/**
 * A centred dialog for something worth reading, with nothing to decide.
 *
 * The sibling of `ConfirmModal`, sharing its card, its scrim, its 96%-to-100%
 * scale and its 400pt cap — but it takes children instead of one string, and it
 * carries one dismissing button instead of two choices.
 *
 * ## Why this exists next to `BottomSheet`
 *
 * A sheet is for a control: pick a sharing type, choose a sort. It slides from
 * the edge the thumb is on and it wants to be reopened. A dialog interrupts,
 * says a self-contained thing in the middle of the screen, and closes. Offers
 * are the second kind — nothing in them is selected, and the page behind must
 * not have moved when it goes.
 *
 * Content scrolls inside the card rather than the card growing, so a long list
 * cannot push the dismiss button off a short screen.
 */
export function Dialog({ visible, onClose, title, children, dismissLabel = 'Close' }: DialogProps) {
  const { colors, space, radius, layout, elevation } = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 240, easing: easing.enter });
  }, [visible, progress]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: reduceMotion ? 1 : 0.96 + progress.value * 0.04 }],
  }));

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalHost, { backgroundColor: colors.scrim, padding: layout.gutter }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <Animated.View
          accessibilityViewIsModal
          style={[
            cardStyle,
            elevation.float,
            styles.dialogCard,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.sheet,
              padding: space[5],
              gap: space[3],
            },
          ]}
        >
          <Text variant="title1">{title}</Text>
          {/* `bounces={false}` so a list that already fits does not rubber-band
              and imply there is more below it. */}
          <ScrollView bounces={false} contentContainerStyle={{ gap: space[3] }}>
            {children}
          </ScrollView>
          <Button label={dismissLabel} variant="secondary" fullWidth onPress={onClose} />
        </Animated.View>
      </View>
    </RNModal>
  );
}

export type ConfirmModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
  /** The irreversible one. Never filled. */
  confirmLabel: string;
  onConfirm: () => void;
  /** The way out. Sits last, nearest the thumb. */
  cancelLabel: string;
};

/**
 * For irreversible decisions only.
 *
 * Two stacked full-width buttons, and the safe choice is the lower one because
 * that is the one under the thumb. The destructive action is an outline — a
 * filled red button in the reach zone is a mis-tap waiting to happen.
 */
export function ConfirmModal({
  visible,
  onClose,
  title,
  body,
  confirmLabel,
  onConfirm,
  cancelLabel,
}: ConfirmModalProps) {
  const { colors, space, radius, layout, elevation } = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 240, easing: easing.enter });
  }, [visible, progress]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: reduceMotion ? 1 : 0.96 + progress.value * 0.04 }],
  }));

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalHost, { backgroundColor: colors.scrim, padding: layout.gutter }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <Animated.View
          accessibilityViewIsModal
          style={[
            cardStyle,
            elevation.float,
            {
              backgroundColor: colors.surface,
              borderRadius: radius.sheet,
              padding: space[5],
              gap: space[3],
              width: '100%',
              maxWidth: 400,
            },
          ]}
        >
          <Text variant="title1">{title}</Text>
          <Text variant="bodyLg" color="secondary">
            {body}
          </Text>
          <View style={{ gap: space[2], marginTop: space[2] }}>
            <Button label={confirmLabel} variant="destructive" fullWidth onPress={onConfirm} />
            <Button label={cancelLabel} variant="secondary" fullWidth onPress={onClose} />
          </View>
        </Animated.View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  sheetHeader: { alignItems: 'stretch' },
  handle: { width: 40, height: 4, alignSelf: 'center' },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center' },
  sheetFooter: { borderTopWidth: StyleSheet.hairlineWidth },
  modalHost: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /* Capped at 400 like the confirm card, and at three quarters of the screen
     so the dismiss button is reachable on a short phone with large text. */
  dialogCard: { width: '100%', maxWidth: 400, maxHeight: '75%' },
  flex: { flex: 1 },
});
