import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { withAlpha } from '@/utils/color';
import { AirbnbSearchBar, type AirbnbSearchBarProps } from './AirbnbSearchBar';

// Character sets for letter-by-letter fall & arrange
const ITS_CHARS = ['i', 't', "'", 's'];
const ITS_TILTS = [-8, 7, -4, 8];

const A_CHARS = ['a'];
const A_TILTS = [-6];

const LIFESTYLE_CHARS = ['L', 'i', 'f', 'e', 's', 't', 'y', 'l', 'e'];
const LIFESTYLE_TILTS = [9, -7, 6, -8, 8, -6, 7, -5, 6];

// Stagger timing constants (ms)
const STAGGER_STEP = 32;
const ITS_START = 80;
const A_START = ITS_START + ITS_CHARS.length * STAGGER_STEP + 35; // 243ms
const LIFESTYLE_START = A_START + 1 * STAGGER_STEP + 35; // 310ms
const LIFESTYLE_END = LIFESTYLE_START + (LIFESTYLE_CHARS.length - 1) * STAGGER_STEP; // 566ms

type FallingCharProps = {
  char: string;
  delay: number;
  trigger: number;
  tilt?: number;
  style?: any;
};

function FallingChar({ char, delay, trigger, tilt = 0, style }: FallingCharProps) {
  const translateY = useSharedValue(-42);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(tilt);
  const scale = useSharedValue(1.25);

  useEffect(() => {
    translateY.value = -42;
    opacity.value = 0;
    rotate.value = tilt;
    scale.value = 1.25;

    translateY.value = withDelay(
      delay,
      withSpring(0, {
        damping: 11,
        stiffness: 240,
        mass: 0.8,
      }),
    );
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 90 }),
    );
    rotate.value = withDelay(
      delay,
      withSpring(0, { damping: 12, stiffness: 220 }),
    );
    scale.value = withDelay(
      delay,
      withSpring(1, { damping: 12, stiffness: 240 }),
    );
  }, [trigger, delay, tilt, translateY, opacity, rotate, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.Text style={[style, animatedStyle]}>
      {char}
    </Animated.Text>
  );
}

export type StayHeroSectionProps = {
  locality: string;
  city?: string;
  onPressLocality: () => void;
  onPressAlerts: () => void;
  alertCount?: number;
  onPressProfile?: () => void;
  userName?: string;
  searchBarProps: AirbnbSearchBarProps;
  style?: ViewStyle;
};

export function StayHeroSection({
  locality,
  city,
  onPressLocality,
  onPressAlerts,
  alertCount = 0,
  onPressProfile,
  userName,
  searchBarProps,
  style,
}: StayHeroSectionProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { space, colors, mode } = useTheme();

  /*
   * The bell and profile discs over the banner follow the theme.
   *
   * They were literal white with a literal slate glyph, in both modes. On
   * Android phones that apply a system "force dark" to anything the app did
   * not theme itself, that white disc was darkened while the glyph stayed
   * dark — both icons vanished in dark mode. In dark mode they are now a
   * near-opaque raised surface with the light ink and a hairline ring (so
   * they keep an edge on the photo); light mode is unchanged.
   */
  const isDark = mode === 'dark';
  const discStyle = isDark
    ? {
      backgroundColor: withAlpha(colors.surfaceRaised, 0.92),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: withAlpha('#FFFFFF', 0.18),
    }
    : null;
  const discInk = isDark ? colors.textPrimary : '#1E293B';

  /* Null for a guest, or an account with no name yet — the button then shows
     a person icon, never a made-up letter. */
  const userInitial = userName?.trim().charAt(0).toUpperCase() || null;
  const fullLocalityText =
    city && city.trim().length > 0
      ? `${locality}, ${city}`
      : (locality || 'All locations');

  // Exact 16:9 aspect ratio based on screen width
  const bannerWidth = screenWidth;
  const bannerHeight = Math.round((bannerWidth * 9) / 16);

  // Trigger state for kinetic falling replay
  const [animTrigger, setAnimTrigger] = useState(0);

  // Pretitle animation
  const quoteOpacity = useSharedValue(0);
  const quoteTranslateY = useSharedValue(-10);

  // Underline flourish & sparkle animation
  const flourishScale = useSharedValue(0);
  const flourishOpacity = useSharedValue(0);
  const sparkleScale = useSharedValue(0);
  const sparkleRotate = useSharedValue(0);

  // Subtitle badge animation
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(10);

  const handleReplay = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setAnimTrigger((prev) => prev + 1);
  }, []);

  // Automatically trigger the letter-by-letter falling effect every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimTrigger((prev) => prev + 1);
    }, 10000);

    return () => clearInterval(timer);
  }, [animTrigger]);

  useEffect(() => {
    // 1. Pretitle enters first
    quoteOpacity.value = withTiming(1, { duration: 300 });
    quoteTranslateY.value = withSpring(0, { damping: 14 });

    // 2. Underline flourish sweeps across right as the last letter lands
    flourishScale.value = 0;
    flourishOpacity.value = 0;
    flourishScale.value = withDelay(
      LIFESTYLE_END + 40,
      withSpring(1, { damping: 14, stiffness: 170 }),
    );
    flourishOpacity.value = withDelay(
      LIFESTYLE_END + 20,
      withTiming(1, { duration: 200 }),
    );

    // 3. Sparkle star pops and spins
    sparkleScale.value = 0;
    sparkleScale.value = withDelay(
      LIFESTYLE_END + 80,
      withSequence(
        withSpring(1.3, { damping: 10 }),
        withSpring(1, { damping: 14 }),
      ),
    );
    sparkleRotate.value = withDelay(
      LIFESTYLE_END + 80,
      withTiming(sparkleRotate.value + 180, { duration: 500 }),
    );

    // 4. Subtitle badge settles in
    subtitleOpacity.value = 0;
    subtitleTranslateY.value = 10;
    subtitleOpacity.value = withDelay(
      LIFESTYLE_END + 120,
      withTiming(1, { duration: 320 }),
    );
    subtitleTranslateY.value = withDelay(
      LIFESTYLE_END + 120,
      withSpring(0, { damping: 14, stiffness: 180 }),
    );
  }, [
    animTrigger,
    quoteOpacity,
    quoteTranslateY,
    flourishScale,
    flourishOpacity,
    sparkleScale,
    sparkleRotate,
    subtitleOpacity,
    subtitleTranslateY,
  ]);

  const pretitleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: quoteOpacity.value,
    transform: [{ translateY: quoteTranslateY.value }],
  }));

  const flourishAnimatedStyle = useAnimatedStyle(() => ({
    width: interpolate(flourishScale.value, [0, 1], [0, 112]),
    opacity: flourishOpacity.value,
    overflow: 'hidden',
  }));

  const sparkleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: sparkleScale.value },
      { rotate: `${sparkleRotate.value}deg` },
    ],
  }));

  const subtitleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  return (
    <View style={[styles.container, style]}>
      {/* 1. Hero Photo Banner Container (Exact 16:9 Explicit Pixel Geometry) */}
      <View style={[styles.bannerBox, { width: bannerWidth, height: bannerHeight }]}>
        <Image
          source={require('@/assets/images/hero-lifestyle-16-9-v8.jpg')}
          style={{
            width: bannerWidth,
            height: bannerHeight,
            position: 'absolute',
            top: 0,
            left: 0,
          }}
          resizeMode="cover"
        />

        {/* Top Subtle Scrim Gradient for Status Bar & Header Contrast */}
        <LinearGradient
          colors={[
            'rgba(0, 0, 0, 0.45)',
            'rgba(0, 0, 0, 0.15)',
            'rgba(0, 0, 0, 0)',
          ]}
          locations={[0, 0.35, 0.7]}
          style={{
            width: bannerWidth,
            height: bannerHeight,
            position: 'absolute',
            top: 0,
            left: 0,
          }}
          pointerEvents="none"
        />

        {/* Left Subtle Scrim for Text Contrast and Flawless Readability */}
        <LinearGradient
          colors={[
            'rgba(3, 18, 12, 0.35)',
            'rgba(3, 18, 12, 0.12)',
            'rgba(3, 18, 12, 0)',
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 0.7, y: 0.5 }}
          style={{
            width: bannerWidth,
            height: bannerHeight,
            position: 'absolute',
            top: 0,
            left: 0,
          }}
          pointerEvents="none"
        />

        {/* Content Container inside the banner */}
        <View
          style={[
            styles.bannerContent,
            {
              paddingTop: Math.max(insets.top + 2, 14),
              width: bannerWidth,
              height: bannerHeight,
            },
          ]}
        >
          {/* Top Bar: Locality + Notification Bell + Profile Avatar */}
          <View style={styles.topBar}>
            <Pressable
              onPress={onPressLocality}
              style={styles.localityContainer}
              accessibilityRole="button"
              accessibilityLabel={`Looking in ${fullLocalityText}. Tap to change.`}
            >
              <Text style={styles.lookingInLabel}>LOOKING IN</Text>
              <View style={styles.localityRow}>
                <Icon name="mapPin" size={16} color="#FFFFFF" />
                <Text numberOfLines={1} style={styles.localityText}>
                  {fullLocalityText}
                </Text>
                <Text style={styles.chevronIcon}>⌄</Text>
              </View>
            </Pressable>

            <View style={styles.headerActions}>
              {/* Notification Bell */}
              <Pressable
                onPress={onPressAlerts}
                style={[styles.actionCircleGlass, discStyle]}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Icon name="bell" size={18} color={discInk} />
                {alertCount > 0 ? (
                  <View
                    style={[
                      styles.redBadge,
                      isDark ? { borderColor: colors.surfaceRaised } : null,
                    ]}
                  />
                ) : null}
              </Pressable>

              {/* Profile Initial Avatar */}
              {onPressProfile ? (
                <Pressable
                  onPress={onPressProfile}
                  style={[styles.profileAvatar, discStyle]}
                  accessibilityRole="button"
                  accessibilityLabel="Your Profile"
                >
                  {userInitial ? (
                    <Text style={[styles.profileInitial, { color: discInk }]}>{userInitial}</Text>
                  ) : (
                    <Icon name="user" size={18} color={discInk} />
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Hero Headline & Subtitle with Kinetic Falling Letter Arrangement */}
          <Pressable
            onPress={handleReplay}
            style={styles.heroTextContainer}
            accessibilityRole="header"
            accessibilityLabel="More than a Stay, it's a Lifestyle."
          >
            <Animated.Text style={[styles.heroPretitle, pretitleAnimatedStyle]}>
              More than a Stay,
            </Animated.Text>

            <View style={styles.lifestyleRow}>
              {/* Word 1: "it's" */}
              <View style={styles.wordRow}>
                {ITS_CHARS.map((char, idx) => (
                  <FallingChar
                    key={`its-${idx}-${animTrigger}`}
                    char={char}
                    delay={ITS_START + idx * STAGGER_STEP}
                    trigger={animTrigger}
                    tilt={ITS_TILTS[idx]}
                    style={styles.heroMainTitle}
                  />
                ))}
              </View>

              {/* Space between "it's" and "a" */}
              <View style={styles.wordSpace} />

              {/* Word 2: "a" */}
              <View style={styles.wordRow}>
                {A_CHARS.map((char, idx) => (
                  <FallingChar
                    key={`a-${idx}-${animTrigger}`}
                    char={char}
                    delay={A_START + idx * STAGGER_STEP}
                    trigger={animTrigger}
                    tilt={A_TILTS[idx]}
                    style={styles.heroMainTitle}
                  />
                ))}
              </View>

              {/* Space between "a" and "Lifestyle" */}
              <View style={styles.wordSpace} />

              {/* Word 3: "Lifestyle" with green underline flourish */}
              <View style={styles.lifestyleWordContainer}>
                <View style={styles.wordRow}>
                  {LIFESTYLE_CHARS.map((char, idx) => (
                    <FallingChar
                      key={`life-${idx}-${animTrigger}`}
                      char={char}
                      delay={LIFESTYLE_START + idx * STAGGER_STEP}
                      trigger={animTrigger}
                      tilt={LIFESTYLE_TILTS[idx]}
                      style={styles.heroMainTitle}
                    />
                  ))}
                </View>

                {/* Highlight Sparkle Diamond Star */}
                <Animated.View style={[styles.sparkleWrapper, sparkleAnimatedStyle]} pointerEvents="none">
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M12 0L14.8 9.2L24 12L14.8 14.8L12 24L9.2 14.8L0 12L9.2 9.2L12 0Z"
                      fill="#34D399"
                    />
                  </Svg>
                </Animated.View>

                {/* Green curved brush flourish underline under "Lifestyle" */}
                <Animated.View style={[styles.flourishWrapper, flourishAnimatedStyle]} pointerEvents="none">
                  <Svg width={112} height={8} viewBox="0 0 112 8" fill="none">
                    <Path
                      d="M2 6C30 2 78 2 110 5.5"
                      stroke="#22C55E"
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                  </Svg>
                </Animated.View>
              </View>
            </View>

          </Pressable>
        </View>
      </View>

      {/* 2. Floating Capsule Search Bar Overlapping Bottom Edge of Banner */}
      <View style={styles.searchBarWrapper}>
        <AirbnbSearchBar {...searchBarProps} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    marginBottom: 4,
  },
  bannerBox: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  bannerContent: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  localityContainer: {
    flex: 1,
    marginRight: 12,
  },
  lookingInLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.9,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  localityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  localityText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: '82%',
    letterSpacing: 0.1,
  },
  chevronIcon: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
    marginTop: -2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionCircleGlass: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  redBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  profileInitial: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  heroTextContainer: {
    paddingVertical: 2,
    gap: 3,
    maxWidth: '68%',
  },
  heroPretitle: {
    fontSize: 16,
    fontStyle: 'italic',
    fontWeight: '600',
    color: '#D1FAE5',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  lifestyleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 3,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  wordSpace: {
    width: 6.5,
  },
  lifestyleWordContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  heroMainTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  sparkleWrapper: {
    position: 'absolute',
    top: -5,
    right: -14,
  },
  flourishWrapper: {
    position: 'absolute',
    bottom: -5,
    right: 0,
    height: 8,
  },
  subtitleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(4, 28, 22, 0.78)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    alignSelf: 'flex-start',
    marginTop: 2,
    maxWidth: '92%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  subtitleGlowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  subtitleBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#F8FAFC',
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  searchBarWrapper: {
    marginTop: -26,
    paddingHorizontal: 16,
    zIndex: 10,
    elevation: 6,
  },
});
