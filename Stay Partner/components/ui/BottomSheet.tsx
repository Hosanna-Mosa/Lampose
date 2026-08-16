import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { radius, shadow } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Bottom sheet — block/unblock dates, reject reason, checkout confirmation,
 * date-range picker.
 *
 * Meant to be rendered by a route declared as a `transparentModal`, so the
 * hardware back button and the swipe-back gesture dismiss it for free rather
 * than being reimplemented here.
 */
export function BottomSheet({
  title,
  subtitle,
  onClose,
  children,
  /** Pinned actions, kept outside the scrolling body. */
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.scrimLayer}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
      </Animated.View>

      <Animated.View
        entering={SlideInDown.duration(260)}
        exiting={SlideOutDown.duration(200)}
        accessibilityViewIsModal
        style={[
          styles.sheet,
          shadow.sheet,
          {
            backgroundColor: c.surface,
            paddingBottom: Math.max(insets.bottom, 20) + 16,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: c.border }]} />

        <Text style={styles.title}>{title}</Text>
        {subtitle ? (
          <Text color="textSecondary" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}

        {children}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrimLayer: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: 14,
    paddingHorizontal: 22,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: { fontFamily: fonts.extrabold, fontSize: 19, lineHeight: 25, marginBottom: 6 },
  subtitle: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginBottom: 18 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
