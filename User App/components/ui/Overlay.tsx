import React from 'react';
import { Modal as RNModal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
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

/**
 * The handle is decorative — the drag gesture lives on the whole header, which
 * is a far larger target than a 40×4 bar.
 */
export function BottomSheet({ visible, onClose, title, children, footer }: BottomSheetProps) {
  const { colors, space, radius, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const translateY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onChange((event) => {
      // Downward only. Dragging up must not detach the sheet from the edge.
      translateY.value = Math.max(0, translateY.value + event.changeY);
    })
    .onEnd((event) => {
      if (event.velocityY > DISMISS_VELOCITY || translateY.value > 120) {
        runOnJS(onClose)();
        translateY.value = 0;
      } else {
        translateY.value = withSpring(0, SHEET_SPRING);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  return (
    <RNModal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Scrim fades on its own 200ms curve, independent of the sheet spring. */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(160)}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <View style={styles.sheetHost} pointerEvents="box-none">
        <GestureDetector gesture={pan}>
          <Animated.View
            entering={reduceMotion ? FadeIn.duration(160) : SlideInDown.duration(300)}
            exiting={reduceMotion ? FadeOut.duration(160) : SlideOutDown.duration(240)}
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
            <View style={[styles.sheetHeader, { paddingHorizontal: space[4], paddingTop: space[3], gap: space[3] }]}>
              <View style={[styles.handle, { backgroundColor: colors.border, borderRadius: radius.pill }]} />
              <View style={styles.sheetTitleRow}>
                <Text variant="title2" style={styles.flex}>
                  {title}
                </Text>
                <IconButton name="close" onPress={onClose} accessibilityLabel="Close" />
              </View>
            </View>

            <View style={{ paddingHorizontal: space[4] }}>{children}</View>

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
        </GestureDetector>
      </View>
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
