import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

export type ToastTone = 'error' | 'success' | 'info';

/**
 * Floats below the status bar and dismisses itself after 4s. Used for messages
 * that aren't tied to one field — when the message belongs to a specific input,
 * the inline field error is the right control instead.
 */
export function Toast({
  message,
  tone = 'error',
  onDismiss,
  duration = 4000,
}: {
  message: string;
  tone?: ToastTone;
  onDismiss?: () => void;
  duration?: number;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => dismiss.current?.(), duration);
    return () => clearTimeout(timer);
    // Re-arm whenever a new message replaces the current one.
  }, [message, duration]);

  const skin: Record<ToastTone, { bg: string; fg: string; icon: IconName }> = {
    error: { bg: c.errorTint, fg: c.errorInk, icon: 'alert-circle' },
    success: { bg: c.successTint, fg: c.successInk, icon: 'check-circle' },
    info: { bg: c.accentTint, fg: c.accentInkDeep, icon: 'info' },
  };
  const s = skin[tone];

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.toast, { top: insets.top + 8, backgroundColor: s.bg }]}
    >
      <Icon name={s.icon} size={16} color={s.fg} strokeWidth={2} />
      <Text variant="badge" style={[styles.text, { color: s.fg }]}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: radius.control,
  },
  text: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17.5,
  },
});
