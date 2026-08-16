import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useTheme } from '@/context/ThemeContext';

export type Tone = 'success' | 'error' | 'info' | 'warning';

const TONE_GLYPH: Record<Tone, IconName> = {
  success: 'check',
  error: 'alert',
  info: 'verified',
  warning: 'clock',
};

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */

export type ToastProps = {
  message: string;
  tone?: Tone;
  visible: boolean;
  onDismiss?: () => void;
  /** Milliseconds before auto-dismiss. */
  duration?: number;
  /** Height of the sticky action bar this must clear, if any. */
  offsetBottom?: number;
};

/**
 * One dark surface for all tones — the disc carries the meaning, not the
 * background. A toast never covers the sticky action bar; it sits 12pt above
 * whatever the screen has parked at the bottom.
 */
export function Toast({ message, tone = 'success', visible, onDismiss, duration = 3200, offsetBottom = 0 }: ToastProps) {
  const { colors, space, radius } = useTheme();

  useEffect(() => {
    if (!visible || !onDismiss) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  /* The disc and the ink that goes on it, chosen together. Picking a fill in
     one expression and a glyph colour in another is how the six white-on-light
     discs happened. */
  const disc =
    tone === 'success'
      ? { fill: colors.success.base, on: colors.success.on }
      : tone === 'error'
        ? { fill: colors.danger.base, on: colors.danger.on }
        : { fill: colors.brandOnDark, on: colors.onBrand };

  return (
    <Animated.View
      entering={SlideInDown.duration(240)}
      exiting={SlideOutDown.duration(160)}
      accessibilityLiveRegion="polite"
      style={[
        styles.floating,
        {
          bottom: offsetBottom + space[3],
          backgroundColor: colors.graphiteRaised,
          borderRadius: radius.button,
          padding: space[3],
          gap: space[3],
        },
      ]}
    >
      <View style={[styles.disc, { backgroundColor: disc.fill, borderRadius: radius.pill }]}>
        <Icon name={TONE_GLYPH[tone]} size={16} color={disc.on} />
      </View>
      <Text variant="bodyStrong" color="onGraphite" style={styles.flex}>
        {message}
      </Text>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Snackbar
 * ------------------------------------------------------------------ */

export type SnackbarProps = {
  message: string;
  actionLabel: string;
  onAction: () => void;
  visible: boolean;
  onDismiss?: () => void;
  duration?: number;
  offsetBottom?: number;
};

/**
 * A toast with one reversal.
 *
 * The action's visual box is 36pt inside a 44pt row — the only place in the
 * system a sub-44 box is allowed, because the pressable extends across the
 * whole right third of the snackbar. A mis-swipe on a bus is the exact case
 * undo exists for, so the target is generous even though the box is not.
 */
export function Snackbar({
  message,
  actionLabel,
  onAction,
  visible,
  onDismiss,
  duration = 6000,
  offsetBottom = 0,
}: SnackbarProps) {
  const { colors, space, radius, touch } = useTheme();

  useEffect(() => {
    if (!visible || !onDismiss) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={SlideInDown.duration(240)}
      exiting={SlideOutDown.duration(160)}
      accessibilityLiveRegion="polite"
      style={[
        styles.floating,
        {
          bottom: offsetBottom + space[3],
          backgroundColor: colors.graphiteRaised,
          borderRadius: radius.button,
          paddingLeft: space[4],
          paddingRight: space[2],
          minHeight: touch.min + 8,
          gap: space[3],
        },
      ]}
    >
      <Text variant="body" color="onGraphite" style={styles.flex}>
        {message}
      </Text>
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        style={[styles.snackAction, { minHeight: touch.min, paddingHorizontal: space[3] }]}
      >
        <Text variant="bodyStrong" style={{ color: colors.brandOnDark }}>
          {actionLabel}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Inline alert
 * ------------------------------------------------------------------ */

export type InlineAlertProps = {
  title: string;
  body?: string;
  tone?: Tone;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
};

/**
 * In-flow and persistent — this is the banner that explains a market term or
 * a cost before the user has to ask.
 *
 * The title says what is true; the body says what it means for this person's
 * money. Neither apologises.
 */
export function InlineAlert({ title, body, tone = 'info', actionLabel, onAction, style }: InlineAlertProps) {
  const { colors, space, radius } = useTheme();

  const set =
    tone === 'success'
      ? colors.success
      : tone === 'error'
        ? colors.danger
        : tone === 'warning'
          ? colors.warning
          : colors.info;

  return (
    <View
      accessibilityRole="alert"
      style={[
        {
          backgroundColor: set.tint,
          borderColor: set.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.chip,
          padding: space[3],
          flexDirection: 'row',
          gap: space[3],
        },
        style,
      ]}
    >
      <View style={[styles.disc, { backgroundColor: set.base, borderRadius: radius.pill }]}>
        <Icon name={TONE_GLYPH[tone]} size={16} color={set.on} />
      </View>
      <View style={[styles.flex, { gap: space[1] }]}>
        <Text variant="bodyStrong" style={{ color: set.ink }}>
          {title}
        </Text>
        {body ? (
          <Text variant="caption" style={{ color: set.ink }}>
            {body}
          </Text>
        ) : null}
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text variant="bodyStrong" style={{ color: set.ink, textDecorationLine: 'underline' }}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Offline banner
 * ------------------------------------------------------------------ */

export type OfflineBannerProps = {
  offline: boolean;
  /** How stale the shown data is. A stale rent is the dangerous case. */
  ageLabel?: string;
};

/**
 * Pinned under the header.
 *
 * Offline is persistent and always states the age of what is on screen. The
 * reconnect banner auto-dismisses after two seconds. This is the one permitted
 * layout animation, because it pushes content down rather than covering it.
 */
export function OfflineBanner({ offline, ageLabel }: OfflineBannerProps) {
  const { colors, space } = useTheme();
  const [showReconnected, setShowReconnected] = React.useState(false);
  const wasOffline = React.useRef(offline);

  useEffect(() => {
    if (wasOffline.current && !offline) {
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 2000);
      wasOffline.current = offline;
      return () => clearTimeout(timer);
    }
    wasOffline.current = offline;
  }, [offline]);

  if (!offline && !showReconnected) return null;

  const set = offline ? colors.warning : colors.success;

  return (
    <Animated.View
      entering={FadeIn.duration(240)}
      exiting={FadeOut.duration(160)}
      accessibilityLiveRegion="polite"
      style={[
        styles.offline,
        { backgroundColor: set.tint, borderBottomColor: set.border, paddingHorizontal: space[4], gap: space[2] },
      ]}
    >
      <Text variant="bodyStrong" style={{ color: set.ink, flex: 1 }}>
        {offline ? 'No internet — showing saved results' : 'Back online — prices updated'}
      </Text>
      {offline && ageLabel ? (
        <Text variant="numMeta" style={{ color: set.ink }}>
          {ageLabel}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  floating: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  disc: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  snackAction: { alignItems: 'center', justifyContent: 'center' },
  offline: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
