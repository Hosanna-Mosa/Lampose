import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { usePendingRequest } from '@/context/PendingRequestContext';
import { useBottomBar } from '@/context/BottomBarContext';

/**
 * Animated Real Analog Clock Icon with continuously rotating minute and hour hands.
 * Rendered directly without any surrounding square box.
 */
function RealClockIcon({ size = 32, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  const resolvedColor = color ?? colors.brand;
  const minuteRotation = useSharedValue(0);
  const hourRotation = useSharedValue(0);

  useEffect(() => {
    /* Continuous smooth real clock rotation on UI thread */
    minuteRotation.value = withRepeat(
      withTiming(360, { duration: 4000, easing: Easing.linear }),
      -1,
      false,
    );
    hourRotation.value = withRepeat(
      withTiming(360, { duration: 48000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [minuteRotation, hourRotation]);

  const minuteStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${minuteRotation.value}deg` }],
  }));

  const hourStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${hourRotation.value}deg` }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {/* Outer Clock Face & Hour Ticks */}
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={9.5} stroke={resolvedColor} strokeWidth={1.8} fill="none" />
        <Line x1={12} y1={3.8} x2={12} y2={5.2} stroke={resolvedColor} strokeWidth={1.6} strokeLinecap="round" />
        <Line x1={20.2} y1={12} x2={18.8} y2={12} stroke={resolvedColor} strokeWidth={1.6} strokeLinecap="round" />
        <Line x1={12} y1={20.2} x2={12} y2={18.8} stroke={resolvedColor} strokeWidth={1.6} strokeLinecap="round" />
        <Line x1={3.8} y1={12} x2={5.2} y2={12} stroke={resolvedColor} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>

      {/* Rotating Hour Hand */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { alignItems: 'center', justifyContent: 'center' },
          hourStyle,
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Line x1={12} y1={12} x2={12} y2={7.2} stroke={resolvedColor} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
      </Animated.View>

      {/* Rotating Minute Hand */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { alignItems: 'center', justifyContent: 'center' },
          minuteStyle,
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Line x1={12} y1={12} x2={12} y2={4.8} stroke={resolvedColor} strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      </Animated.View>

      {/* Center Pin Dot */}
      <View
        style={{
          position: 'absolute',
          width: size * 0.15,
          height: size * 0.15,
          borderRadius: (size * 0.15) / 2,
          backgroundColor: resolvedColor,
        }}
      />
    </View>
  );
}

export type OngoingTone = 'waiting' | 'action';

export type OngoingItem = {
  /** Stable across renders — the booking or request id. */
  key: string;
  /** The property. What a student recognises the booking by. */
  title: string;
  /** The state, in the words of what to do next. Never a status code. */
  status: string;
  /**
   * `action` means the next move is the student's, and it wears the accent.
   * `waiting` means somebody else is holding it, and it stays quiet.
   */
  tone: OngoingTone;
};

export type OngoingStripProps = {
  items: readonly OngoingItem[];
  onPress: (item: OngoingItem) => void;
};

export function OngoingStrip({ items, onPress }: OngoingStripProps) {
  const { space, radius, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { reservedBottom } = usePendingRequest();
  const { hidden, height: barHeight } = useBottomBar();

  const effectiveBarHeight = barHeight > 0 ? barHeight : reservedBottom || 80;
  const bottomInset = Math.max(insets.bottom, 8);

  /* Radar Pulse Animation for Icon Glow */
  const radarScale = useSharedValue(1);
  const radarOpacity = useSharedValue(0.6);

  /* Status Dot Pulse Animation */
  const dotOpacity = useSharedValue(1);

  useEffect(() => {
    /* Radar wave expanding outward continuously */
    radarScale.value = withRepeat(
      withTiming(1.8, { duration: 1600, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    radarOpacity.value = withRepeat(
      withTiming(0, { duration: 1600, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );

    /* Dot blinking pulse */
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 750 }),
        withTiming(1, { duration: 750 }),
      ),
      -1,
      true,
    );
  }, [radarScale, radarOpacity, dotOpacity]);

  const radarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: radarScale.value }],
    opacity: radarOpacity.value,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  /*
   * When the bottom bar hides on scroll (hidden.value === 1), this strip slides down
   * to sit smoothly at the very bottom edge of the screen.
   * When the bottom bar is shown (hidden.value === 0), this strip sits right above the tab bar.
   */
  const animatedStyle = useAnimatedStyle(() => {
    const travelDistance = Math.max(0, effectiveBarHeight - bottomInset);
    return {
      transform: [
        {
          translateY: hidden.value * travelDistance,
        },
      ],
    };
  });

  if (!items.length) return null;

  const single = items.length === 1;

  const card = (item: OngoingItem) => {
    const acting = item.tone === 'action';

    /* Official Lampose App Theme Palette Integration:
       Clean surface background with official `colors.brand` (#0E6E5C) green accents */
    const cardGradients: [string, string] = [colors.surface || '#FFFFFF', '#F8FAFC'];

    const brandColor = colors.brand || '#0E6E5C';
    const brandTintBg = colors.brandTint || '#E3F0EB';
    const borderColor = acting ? brandColor : `${brandColor}40`;

    return (
      <Pressable
        key={item.key}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.status}. Opens the booking.`}
        style={({ pressed }) => [
          styles.cardWrapper,
          {
            transform: [{ scale: pressed ? 0.985 : 1 }],
            borderRadius: radius.card || 16,
            width: single ? undefined : 284,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.12,
            shadowRadius: 10,
            elevation: 6,
          },
        ]}
      >
        <LinearGradient
          colors={cardGradients}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.cardGradient,
            {
              borderRadius: radius.card || 16,
              borderColor: borderColor,
            },
          ]}
        >
          {/* Left Vertical App Theme Brand Accent Bar */}
          <View style={[styles.leftAccentBar, { backgroundColor: brandColor }]} />

          {/* Direct Animated Clock in Official App Theme Brand Green */}
          <View style={styles.iconContainer}>
            {/* Animated Radar Pulse Ring behind clock */}
            <Animated.View
              style={[
                styles.radarRing,
                { backgroundColor: `${brandColor}25` },
                radarStyle,
              ]}
            />
            {acting ? (
              <Icon name="check" size={26} color={brandColor} />
            ) : (
              <RealClockIcon size={32} color={brandColor} />
            )}
          </View>

          {/* Body Info */}
          <View style={styles.body}>
            <Text
              variant="bodyStrong"
              numberOfLines={1}
              style={{ color: colors.textPrimary || '#1A1917', fontSize: 15, fontWeight: '700', letterSpacing: 0.1 }}
            >
              {item.title}
            </Text>

            {/* Status Pill Badge in App Theme Brand Tint */}
            <View style={[styles.statusBadge, { backgroundColor: brandTintBg, borderColor: `${brandColor}30` }]}>
              <Animated.View style={[styles.pulseDot, { backgroundColor: brandColor }, dotStyle]} />
              <Text
                variant="caption"
                numberOfLines={1}
                style={{ color: colors.brandInk || brandColor, fontWeight: '700', fontSize: 11.5 }}
              >
                {item.status}
              </Text>
            </View>
          </View>

          {/* Subtle Clean Right Chevron */}
          <Icon name="chevronRight" size={20} color={colors.textTertiary} />
        </LinearGradient>
      </Pressable>
    );
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.band,
        animatedStyle,
        {
          paddingBottom: effectiveBarHeight + (space[2] || 8),
        },
      ]}
    >
      {single ? (
        <View style={{ paddingHorizontal: space[4] || 16 }}>{card(items[0])}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space[4] || 16, gap: space[3] || 12 }}
        >
          {items.map(card)}
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
    backgroundColor: 'transparent',
  },
  cardWrapper: {
    overflow: 'visible',
  },
  cardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
    position: 'relative',
  },
  leftAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  iconContainer: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justify: 'center',
    position: 'relative',
    marginLeft: 2,
  },
  radarRing: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  body: {
    flex: 1,
    gap: 3,
    justify: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justify: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
});
