import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { Icon, Text } from '@/components/ui';
import { easing } from '@/constants/motion';
import type { StayCategory } from '@/constants/tokens';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { AirbnbSearchBar, type AirbnbSearchBarProps } from './AirbnbSearchBar';
import { CategoryGlassBar } from './CategoryGlassBar';
import { HERO_SCENE_HEIGHT, HeroScene3D } from './HeroScene3D';

export type StayHeroSectionProps = {
  locality: string;
  city?: string;
  onPressLocality: () => void;
  onPressAlerts: () => void;
  alertCount?: number;
  onPressProfile?: () => void;
  userName?: string;
  searchBarProps: AirbnbSearchBarProps;
  /** The category the feed is showing. The glass category bar is drawn only
   *  when this and `onChangeCategory` are both given. */
  category?: StayCategory | null;
  onChangeCategory?: (category: StayCategory) => void;
  /**
   * How far down the hero its search bar starts, in points. The screen docks
   * a sticky copy of the search bar and categories once it has scrolled this
   * far, so the hand-off happens exactly where the real one leaves.
   */
  onDockPoint?: (y: number) => void;
  style?: ViewStyle;
};

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The Explore hero — light, and made of glass.
 *
 * It replaced a dark 16:9 bedroom photograph with white type on scrims. This
 * one is a pale wash of the brand's own colours that fades into the page, with
 * three soft glows drifting slowly behind it, and everything on it is a pane of
 * frosted glass: the locality, the bell, the profile mark, and the category bar
 * with its moving bubble (`CategoryGlassBar`). The type is the app's normal
 * dark ink, so nothing needs a scrim or a text shadow to be read.
 *
 * In order: where you are looking and your two header buttons, a greeting and
 * the line over a 3D street — the category's building on the right, a road
 * across the whole hero with traffic and students walking in (`HeroScene3D`), the search bar, and the categories. The filter chips are not part
 * of the hero and are untouched — they follow it in the feed.
 */
export function StayHeroSection({
  locality,
  city,
  onPressLocality,
  onPressAlerts,
  alertCount = 0,
  onPressProfile,
  userName,
  searchBarProps,
  category,
  onChangeCategory,
  onDockPoint,
  style,
}: StayHeroSectionProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { colors, mode, layout } = useTheme();
  const reduceMotion = useReduceMotion();
  const dark = mode === 'dark';

  /* Null for a guest, or an account with no name yet — the button then shows
     a person icon, never a made-up letter. */
  const userInitial = userName?.trim().charAt(0).toUpperCase() || null;
  const firstName = userName?.trim().split(/\s+/)[0] || null;
  const greeting = useMemo(() => greetingFor(new Date().getHours()), []);
  const fullLocalityText =
    city && city.trim().length > 0 ? `${locality}, ${city}` : locality || 'All locations';

  const glass = glassStyle(dark);

  return (
    <View style={[styles.container, style]}>
      {/* The wash: a pale brand tint at the top, fading into the page. The
          faint mint holds until the very bottom, so the glass category bar
          still has a colour behind it to be glass against. */}
      <LinearGradient
        colors={dark ? ['#0E231C', '#111A17', '#101513', colors.bg] : ['#DDF1E8', '#EAF6F0', '#F2F9F5', colors.bg]}
        locations={[0, 0.5, 0.9, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Three soft glows drifting behind the glass. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glowClip]}>
        <Glow
          id="heroGlowBrand"
          size={260}
          color={colors.brand}
          opacity={dark ? 0.28 : 0.22}
          style={{ top: -90, left: -80 }}
          drift={22}
          duration={9000}
          still={reduceMotion}
        />
        <Glow
          id="heroGlowSun"
          size={210}
          color={colors.deal.base}
          opacity={dark ? 0.16 : 0.42}
          style={{ top: 10, right: -70 }}
          drift={16}
          duration={11000}
          still={reduceMotion}
        />
        <Glow
          id="heroGlowSky"
          size={180}
          color={colors.link.base}
          opacity={dark ? 0.2 : 0.14}
          style={{ top: 150, left: screenWidth * 0.35 }}
          drift={14}
          duration={8000}
          still={reduceMotion}
        />
      </View>

      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 8, paddingHorizontal: layout.gutter },
        ]}
      >
        {/* Where you are looking, and the two header buttons. */}
        <View style={styles.topBar}>
          <Pressable
            onPress={onPressLocality}
            style={[styles.localityPill, glass]}
            accessibilityRole="button"
            accessibilityLabel={`Looking in ${fullLocalityText}. Tap to change.`}
          >
            <View style={[styles.pinDisc, { backgroundColor: colors.brand }]}>
              <Ionicons name="location" size={15} color={colors.onBrand} />
            </View>
            <View style={styles.localityText}>
              <Text variant="caption" color="tertiary" style={styles.lookingIn}>
                Looking in
              </Text>
              <View style={styles.localityRow}>
                <Text variant="title3" numberOfLines={1} style={styles.localityName}>
                  {fullLocalityText}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
              </View>
            </View>
          </Pressable>

          <View style={styles.actions}>
            <Pressable
              onPress={onPressAlerts}
              style={[styles.disc, glass]}
              accessibilityRole="button"
              accessibilityLabel={alertCount > 0 ? `Notifications, ${alertCount} unread` : 'Notifications'}
            >
              <Icon name="bell" size={18} color={colors.textPrimary} />
              {alertCount > 0 ? (
                <View
                  style={[
                    styles.badgeDot,
                    { backgroundColor: colors.danger.base, borderColor: dark ? colors.surfaceRaised : '#FFFFFF' },
                  ]}
                />
              ) : null}
            </Pressable>

            {onPressProfile ? (
              <Pressable
                onPress={onPressProfile}
                style={[styles.disc, glass]}
                accessibilityRole="button"
                accessibilityLabel="Your profile"
              >
                {userInitial ? (
                  <Text variant="title3" style={{ color: colors.brandInk }}>
                    {userInitial}
                  </Text>
                ) : (
                  <Icon name="user" size={18} color={colors.textPrimary} />
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* The greeting and the line, over the street: the category's
            building on the right and a road across the whole hero. The scene
            sits behind the type, edge to edge, and takes no touches. */}
        <View style={[styles.headline, styles.stage]}>
          <HeroScene3D
            category={category ?? 'PG_HOSTEL'}
            width={screenWidth}
            style={{ position: 'absolute', left: -layout.gutter, bottom: -6 }}
          />
          <Text variant="caption" color="secondary">
            {firstName ? `${greeting}, ${firstName}` : greeting}
          </Text>
          <Text variant="display1" accessibilityRole="header" style={styles.title}>
            More than a stay,{'\n'}it&apos;s a{' '}
            <Text variant="display1" color="brand" style={styles.title}>
              lifestyle.
            </Text>
          </Text>
        </View>

        <View onLayout={(event) => onDockPoint?.(event.nativeEvent.layout.y)}>
          <AirbnbSearchBar {...searchBarProps} />
        </View>

        {category && onChangeCategory ? (
          <CategoryGlassBar value={category} onChange={onChangeCategory} />
        ) : null}
      </View>
    </View>
  );
}

/** Frosted glass for the small panes on the hero. See `CategoryGlassBar` for
 *  why Android gets a more opaque fill and no elevation. */
function glassStyle(dark: boolean): ViewStyle {
  if (dark) {
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.07)',
      borderColor: 'rgba(255, 255, 255, 0.14)',
      borderWidth: 1,
    };
  }
  return Platform.OS === 'android'
    ? { backgroundColor: 'rgba(255, 255, 255, 0.82)', borderColor: 'rgba(0, 0, 0, 0.06)', borderWidth: 1 }
    : {
        backgroundColor: 'rgba(255, 255, 255, 0.62)',
        borderColor: 'rgba(255, 255, 255, 0.95)',
        borderWidth: 1,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      };
}

/**
 * A soft round glow that drifts back and forth, slowly.
 *
 * A radial gradient rather than a translucent circle, so it has no edge — a
 * flat disc reads as a shape, a glow reads as light. Still under reduced
 * motion.
 */
function Glow({
  id,
  size,
  color,
  opacity,
  style,
  drift,
  duration,
  still,
}: {
  /** Unique per glow: SVG gradient ids are global to the document. */
  id: string;
  size: number;
  color: string;
  opacity: number;
  style: ViewStyle;
  /** How far it wanders, in points. */
  drift: number;
  duration: number;
  still: boolean;
}) {
  const t = useSharedValue(0.5);

  useEffect(() => {
    if (still) {
      cancelAnimation(t);
      t.value = 0.5;
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration, easing: easing.inOut }), -1, true);
    return () => cancelAnimation(t);
  }, [still, duration, t]);

  const drifting = useAnimatedStyle(() => ({
    transform: [
      { translateX: (t.value - 0.5) * drift * 2 },
      { translateY: (0.5 - t.value) * drift },
      { scale: 0.96 + t.value * 0.08 },
    ],
  }));

  const r = size / 2;
  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size }, style, drifting]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', position: 'relative' },
  glowClip: { overflow: 'hidden' },
  content: { paddingBottom: 12, gap: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  localityPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
    borderRadius: 999,
  },
  pinDisc: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  localityText: { flexShrink: 1 },
  lookingIn: { fontSize: 10, lineHeight: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
  localityRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  localityName: { flexShrink: 1, fontSize: 14, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disc: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badgeDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  headline: { gap: 2 },
  /* The street scene's height, less the 6 pt it tucks under the search bar:
     the building on the right, the road edge to edge along the bottom. */
  stage: { minHeight: HERO_SCENE_HEIGHT - 6 },
  title: { fontSize: 25, lineHeight: 31, letterSpacing: -0.4 },
});
