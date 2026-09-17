import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Icon, IconButton, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { withAlpha } from '@/utils/color';

/** Content height, above the status bar inset. */
/** The bar's own height, above the safe-area inset. Exported because a screen
 *  that draws artwork UNDER a pinned header has to leave room for it, and the
 *  only alternative is measuring on layout — a frame of the search field
 *  sitting on the locality line before it corrects itself. */
export const HEADER_HEIGHT = 56;

/* ------------------------------------------------------------------ *
 * (a) Explore — locality selector + bell
 * ------------------------------------------------------------------ */

export type ExploreHeaderProps = {
  locality: string;
  /** The city, when the locality alone would be ambiguous. */
  city?: string;
  onPressLocality: () => void;
  onPressAlerts: () => void;
  alertCount?: number;
  /**
   * Account access. Present since the Food pivot took Profile's slot in the
   * tab bar — the header is now the one door to the account, the same
   * demotion Alerts went through when Saved took its tab.
   */
  onPressProfile?: () => void;
  /**
   * The signed-in diner's name, shown as an initial in place of a generic
   * person glyph — the way Gmail, Slack and most accounts-first apps mark
   * "this is you" rather than "this is a person icon". Only the first
   * character is drawn; the rest of the name is not this control's job.
   * Missing or blank falls back to the plain glyph rather than an empty or
   * "?" circle, which is the ordinary case for an account that has not
   * finished onboarding yet.
   */
  userName?: string;
  /**
   * How the bar is painted.
   *
   * `surface` is the bar as every stay screen has always had it — its own
   * background, its own hairline, theme ink. `overlay` paints nothing and
   * switches the ink to white, for the one case where the bar sits ON
   * artwork: Food Home, whose banner now runs to the top of the screen with
   * this floating over it.
   *
   * Overlay carries its OWN scrim rather than leaving that to the caller.
   * The four banners behind it run from a bright pink sky to a dark blue
   * one, so neither white nor dark ink is safe on its own; the gradient is
   * what makes one choice work on all of them. A caller that wanted to
   * supply the scrim would have to know the bar's height, which only the
   * bar knows.
   *
   * `hero` paints NOTHING and keeps theme ink — the third case, for Explore,
   * where the bar is the top of a tinted block that also holds the search
   * field and the category row. The band and its closing hairline belong to
   * that block, not to the bar: the bar drawing its own opaque surface would
   * cut the block in two, and drawing its own hairline would put a rule
   * between the locality and the field it scopes.
   */
  variant?: 'surface' | 'overlay' | 'hero';
};

/**
 * The locality is the largest thing here because it is the one setting that
 * changes every result below it.
 *
 * It used to carry the saved college alongside, because every distance in the
 * product was measured from it. The college was removed with the distance
 * model, so the header now states where you are looking and nothing else.
 */
export function ExploreHeader({
  locality,
  city,
  onPressLocality,
  onPressAlerts,
  alertCount,
  onPressProfile,
  userName,
  variant = 'surface',
}: ExploreHeaderProps) {
  const { colors, space, layout, touch, radius } = useTheme();
  const insets = useSafeAreaInsets();

  const initial = userName?.trim().charAt(0).toUpperCase() || null;

  /* The appearance toggle used to sit here — a moon/sun button between the
     locality and the bell. It has moved to "App appearance" on both
     profiles: it is a set-once setting rather than something a thumb
     reaches for from a feed, it could only ever reach two of the
     preference's three states ("follow my phone" was unreachable, and it
     is the default), and this bar has to stay legible over Food Home's
     artwork, where every mark it carries costs contrast. See
     `AppearanceRow`. */

  /* Over artwork every mark goes white — icons, both lines of the locality,
     the initial. The scrim below is what makes that a safe single choice
     across four banners that do not agree on a background brightness. */
  const over = variant === 'overlay';
  /* Both non-`surface` variants are transparent and neither draws a rule;
     only `overlay` also flips the ink, because only it sits on a photograph. */
  const bare = over || variant === 'hero';
  const ink = over ? '#FFFFFF' : undefined;

  return (
    <View
      style={[
        bare ? null : styles.bar,
        {
          paddingTop: insets.top,
          backgroundColor: bare ? 'transparent' : colors.surface,
          borderBottomColor: bare ? undefined : colors.borderSubtle,
          paddingHorizontal: layout.gutter,
        },
      ]}
    >
      {over ? (
        /*
         * Top-weighted and fading out by the bar's own bottom edge, so it
         * darkens what is behind the WORDS and stops before it becomes a band
         * lying across the picture.
         *
         * Halved from 0.55/0.28. At the old strength it read as a black wash
         * over the top of the artwork rather than as contrast behind two lines
         * of text — and it used to have a second gradient stacked under it on
         * Food Home, which is what turned "a bit dark" into a visible dark
         * rectangle. That one is gone; this one is now as light as it can be
         * and still carry white ink over the brightest of the four banners.
         */
        <LinearGradient
          colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}

      <View style={styles.content}>
        <Pressable
          onPress={onPressLocality}
          accessibilityRole="button"
          accessibilityLabel={`Looking in ${locality}${city ? `, ${city}` : ''}. Change location.`}
          style={[styles.flex, { gap: 1, marginRight: space[3] }]}
        >
          <Text
            variant="caption"
            color={over ? undefined : 'tertiary'}
            style={over ? { color: ink, opacity: 0.88 } : undefined}
          >
            Looking in
          </Text>
          <View style={[styles.row, { gap: space[1] }]}>
            <Text
              variant="title3"
              numberOfLines={1}
              style={over ? { flexShrink: 1, color: ink } : { flexShrink: 1 }}
            >
              {locality}
              {city ? `, ${city}` : ''}
            </Text>
            <Icon name="chevronRight" size={16} color={over ? ink : colors.textSecondary} />
          </View>
        </Pressable>

        <View style={styles.row}>
          <View>
            {/* 20, matching the chevron on the locality beside it.
                At the IconButton default of 24 the bell was the largest mark in
                the bar — heavier than the row it sits next to and heavier than
                the title it shares the line with, which read as the alert being
                the header's main affordance rather than its secondary one. The
                tap target is still the full 44pt; only the glyph moved. */}
            <IconButton
              name="bell"
              size={20}
              ink={ink}
              onPress={onPressAlerts}
              accessibilityLabel="Notifications"
            />
            {alertCount ? (
              <View style={styles.headerBadge} pointerEvents="none">
                <Badge count={alertCount} tone="danger" size="sm" />
              </View>
            ) : null}
          </View>
          {onPressProfile ? (
            initial ? (
              <Pressable
                onPress={onPressProfile}
                accessibilityRole="button"
                accessibilityLabel="Your profile"
                style={{ width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' }}
              >
                <View
                  style={{
                    width: touch.iconButtonVisual,
                    height: touch.iconButtonVisual,
                    borderRadius: radius.pill,
                    /* Translucent white over artwork rather than the sunken
                       surface token — that token is near-black in dark mode
                       and would sit on the banner as a hole. */
                    backgroundColor: over ? 'rgba(255,255,255,0.22)' : colors.surfaceSunken,
                    borderWidth: over ? StyleSheet.hairlineWidth : 0,
                    borderColor: over ? 'rgba(255,255,255,0.5)' : undefined,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    variant="label"
                    color={over ? undefined : 'secondary'}
                    style={over ? { color: ink } : undefined}
                  >
                    {initial}
                  </Text>
                </View>
              </Pressable>
            ) : (
              <IconButton
                name="sharing"
                ink={ink}
                onPress={onPressProfile}
                accessibilityLabel="Your profile"
              />
            )
          ) : null}
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * (b) Standard — back + title
 * ------------------------------------------------------------------ */

export type StandardHeaderProps = {
  title: string;
  /** Carries the chosen sharing type and rent, so the number never leaves. */
  subtitle?: string;
  onBack?: () => void;
  /** Text when the verb matters ("Edit", "Skip"). */
  actionLabel?: string;
  onAction?: () => void;
  /** For the universally understood ones only — share, help. */
  actionIcon?: 'close' | 'phone' | 'bookmark';
};

/**
 * Left-aligned, never centred: a centred title truncates a 34-character PG
 * name at about 22.
 *
 * The right side gets exactly one job — a text action or an icon action, never
 * both.
 */
export function StandardHeader({
  title,
  subtitle,
  onBack,
  actionLabel,
  onAction,
  actionIcon,
}: StandardHeaderProps) {
  const { colors, space, layout, touch } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top,
          backgroundColor: colors.surface,
          borderBottomColor: colors.borderSubtle,
          paddingHorizontal: onBack ? space[1] : layout.gutter,
        },
      ]}
    >
      <View style={styles.content}>
        {onBack ? <IconButton name="chevronLeft" onPress={onBack} accessibilityLabel="Back" /> : null}

        <View style={[styles.flex, { gap: 1, paddingHorizontal: onBack ? space[1] : 0 }]}>
          <Text variant="title2" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={{ minHeight: touch.min, justifyContent: 'center', paddingHorizontal: space[3] }}
          >
            <Text variant="bodyStrong" color="brand">
              {actionLabel}
            </Text>
          </Pressable>
        ) : actionIcon && onAction ? (
          <IconButton name={actionIcon} onPress={onAction} accessibilityLabel={actionIcon} />
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * (c) Photo — transparent over a hero, solid on scroll
 * ------------------------------------------------------------------ */

/**
 * The photo hero's share of the screen, and its bounds.
 *
 * It used to be a flat 280 units. That is wrong in both directions: on a tall
 * phone the photo under-uses the screen, and on a short one — which is what
 * Android's Display size setting produces — a fixed 280 plus the header plus a
 * stacked action bar left only 20% of the viewport for content.
 *
 * 0.396 is derived, not picked: it is the share that leaves 38% of a
 * 411 × 891 screen for content, which is the density the product owner asked
 * for. Being a share rather than a number is what stops a short screen from
 * inheriting a tall screen's photo.
 */
const HERO_SHARE = 0.396;
const HERO_MIN = 240;
const HERO_MAX = 400;

/**
 * The nominal height, for the few places that need a constant rather than a
 * hook — preview sheets and layout maths outside a component. Screens should
 * use `usePhotoHeroHeight()` so the value tracks the actual viewport.
 */
export const PHOTO_HERO_HEIGHT = 352;

/** The hero height for this device. Re-renders when the window changes. */
export function usePhotoHeroHeight(): number {
  const { height } = useWindowDimensions();
  return Math.round(Math.min(HERO_MAX, Math.max(HERO_MIN, height * HERO_SHARE)));
}

/**
 * The scroll thresholds, derived rather than guessed.
 *
 * threshold  = heroHeight − headerHeight
 * fadeWindow = [threshold − 60, threshold]
 *
 * The title starts 30pt after the background so the two changes read as one
 * gesture rather than a simultaneous flip.
 */
export function photoHeaderWindows(heroHeight: number, headerHeight: number) {
  const threshold = heroHeight - headerHeight;
  return {
    background: [threshold - 60, threshold] as const,
    title: [threshold - 30, threshold + 10] as const,
  };
}

/**
 * The OS status bar's style to pair with `PhotoHeader` / `PhotoHero`.
 *
 * `PhotoHeader`'s own back and action glyphs already crossfade from white
 * (over the photo) to ink (once the header goes solid) — see `glyphStyle`
 * below. The system status bar row — the clock, signal, battery — is a
 * native surface `expo-status-bar`'s `<StatusBar>` controls from OUTSIDE
 * this render tree, and on its own it knows nothing about `scrollY`: a
 * screen that hardcodes `style="light"` for the photo keeps WHITE icons
 * long after the header has scrolled solid, and white-on-white is
 * unreadable. This is that fix.
 *
 * The crossing point is the SAME threshold `PhotoHeader` itself uses
 * (`photoHeaderWindows`), so the OS row and the in-app header cross at one
 * scroll position rather than two that could drift apart.
 *
 * Bridged to React state — unlike everything else in this file — because
 * `<StatusBar style>` is a plain prop, not a worklet-driven style. `runOnJS`
 * only actually crosses to JS when the boolean itself flips, not on every
 * scroll frame, so this costs nothing while scrolling within either zone.
 */
export function usePhotoHeaderStatusBarStyle(
  scrollY: SharedValue<number>,
  heroHeight?: number,
): 'light' | 'dark' {
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();
  const measured = usePhotoHeroHeight();
  const hero = heroHeight ?? measured;
  const windows = photoHeaderWindows(hero, HEADER_HEIGHT + insets.top);
  const crossing = windows.background[1];

  const [solid, setSolid] = useState(false);

  useAnimatedReaction(
    () => scrollY.value >= crossing,
    (next, previous) => {
      if (next !== previous) runOnJS(setSolid)(next);
    },
    [crossing],
  );

  // Over the photo: always light content, in either theme — a dark-mode icon
  // reads no better against a bright photograph than a light-mode one does.
  if (!solid) return 'light';
  // Header solid: pair with `colors.surface`, which is what the header
  // actually turned — white in light mode, near-black in dark mode.
  return mode === 'dark' ? 'light' : 'dark';
}

export type PhotoHeaderProps = {
  title: string;
  /** The scroll offset, owned by the screen and driven on the UI thread. */
  scrollY: SharedValue<number>;
  onBack?: () => void;
  onAction?: () => void;
  actionIcon?: 'bookmark' | 'phone' | 'heart';
  actionActive?: boolean;
  heroHeight?: number;
};

/**
 * Transparent over the photo, solid once the hero has passed.
 *
 * Everything here is scroll-linked and runs on the UI thread: a JS round trip
 * per scroll frame tears on exactly the hardware this app targets, so no part
 * of the threshold logic may touch component state.
 *
 * There is no blur. `expo-blur` is a native module that does not run in Expo
 * Go at all, and its Android path is poor even in a dev build.
 *
 * Reduced motion changes nothing here. This is legibility, not decoration — a
 * white icon over a bright photo edge is unreadable regardless of preference.
 */
export function PhotoHeader({
  title,
  scrollY,
  onBack,
  onAction,
  actionIcon,
  actionActive,
  heroHeight,
}: PhotoHeaderProps) {
  const { colors, space, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const measured = usePhotoHeroHeight();
  const hero = heroHeight ?? measured;
  const windows = photoHeaderWindows(hero, HEADER_HEIGHT + insets.top);

  /*
   * Resolved on the JS thread, then captured by the worklet.
   *
   * `useAnimatedStyle` runs on the UI runtime, which cannot reach a plain
   * imported function — `withAlpha` arrives there as an object and calling it
   * throws. Hoisting is also simply cheaper: these two strings depend on the
   * theme, not on the scroll position, so computing them per frame would be
   * work done sixty times a second for a value that changes twice a year.
   */
  const surfaceFrom = withAlpha(colors.surface, 0);
  const borderFrom = withAlpha(colors.border, 0);

  const surfaceStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(
        scrollY.value,
        [windows.background[0], windows.background[1]],
        [surfaceFrom, colors.surface],
      ),
      borderBottomColor: interpolateColor(
        scrollY.value,
        [windows.background[0], windows.background[1]],
        [borderFrom, colors.border],
      ),
    }),
    [surfaceFrom, borderFrom, colors.surface, colors.border, windows.background],
  );

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [windows.title[0], windows.title[1]],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  // The glyph colour crosses from white to ink over the same window as the
  // background, so it is never white-on-white or ink-on-photo.
  const glyphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [windows.background[0], windows.background[1]],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Animated.View
      style={[
        styles.absoluteHeader,
        surfaceStyle,
        { paddingTop: insets.top, paddingHorizontal: space[1] },
      ]}
    >
      <View style={styles.content}>
        <View>
          {/* Two stacked glyphs crossfading is cheaper and steadier than
              interpolating a colour prop through the icon library. */}
          {onBack ? (
            <>
              <IconButton name="chevronLeft" onPress={onBack} accessibilityLabel="Back" variant="onImage" />
              <Animated.View style={[StyleSheet.absoluteFill, glyphStyle]} pointerEvents="none">
                <IconButton name="chevronLeft" accessibilityLabel="Back" />
              </Animated.View>
            </>
          ) : null}
        </View>

        <Animated.View style={[styles.flex, titleStyle, { paddingHorizontal: space[1] }]}>
          <Text variant="title2" numberOfLines={1}>
            {title}
          </Text>
        </Animated.View>

        <View>
          {actionIcon && onAction ? (
            <>
              <IconButton name={actionIcon} onPress={onAction} accessibilityLabel={actionIcon} variant="onImage" active={actionActive} />
              <Animated.View style={[StyleSheet.absoluteFill, glyphStyle]} pointerEvents="none">
                <IconButton name={actionIcon} accessibilityLabel={actionIcon} active={actionActive} />
              </Animated.View>
            </>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

export type PhotoHeroProps = {
  scrollY: SharedValue<number>;
  heroHeight?: number;
  children?: React.ReactNode;
};

/**
 * The hero image slot, with its parallax and its scrim.
 *
 * The scrim is a top-down linear gradient rather than a flat fill. A flat
 * scrim shows a hard edge where it terminates, and bands visibly on the 8-bit
 * panels common at this price point.
 */
export function PhotoHero({ scrollY, heroHeight, children }: PhotoHeroProps) {
  const measured = usePhotoHeroHeight();
  const hero = heroHeight ?? measured;
  const insets = useSafeAreaInsets();
  const windows = photoHeaderWindows(hero, HEADER_HEIGHT + insets.top);

  const parallaxStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value * 0.35 }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [windows.background[0], windows.background[1]],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    /*
     * Clipped to its own slot.
     *
     * The slot's height is measured from the viewport, and a caller that hands
     * it a fixed-height child — a placeholder block sized from
     * `PHOTO_HERO_HEIGHT` — hands it something taller than the slot on a short
     * screen. Without clipping that child simply draws past the bottom edge and
     * over the first section of the body.
     */
    <Animated.View style={[styles.hero, { height: hero }, parallaxStyle]}>
      {children}
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(26,25,23,0.55)', 'rgba(26,25,23,0)']}
          style={{ height: 140 }}
        />
      </Animated.View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * (d) Search — collapsed criteria summary
 * ------------------------------------------------------------------ */

export type SearchHeaderProps = {
  /** What was searched: "Gachibowli · PG · Boys". */
  query: string;
  /** What was constrained: both ceilings, always. */
  constraints: string;
  onPress: () => void;
  onBack?: () => void;
  filterCount?: number;
};

/**
 * Two lines inside the field: what you searched, then the numbers you
 * constrained.
 *
 * Both ceilings stay visible, because a filter you cannot see is a filter you
 * forget you set — and "why am I seeing nothing" is usually a forgotten
 * deposit cap. The count badge is brand rather than red: five active filters
 * is a state, not a problem.
 */
export function SearchHeader({ query, constraints, onPress, onBack, filterCount }: SearchHeaderProps) {
  const { colors, space, radius, layout } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top,
          backgroundColor: colors.surface,
          borderBottomColor: colors.borderSubtle,
          paddingHorizontal: onBack ? space[1] : layout.gutter,
        },
      ]}
    >
      <View style={[styles.content, { gap: space[2] }]}>
        {onBack ? <IconButton name="chevronLeft" onPress={onBack} accessibilityLabel="Back" /> : null}

        <Pressable
          onPress={onPress}
          accessibilityRole="search"
          accessibilityLabel={`${query}. ${constraints}. Change search.`}
          style={[
            styles.searchPill,
            {
              backgroundColor: colors.surfaceSunken,
              // Matches `SearchField` — see the note on it for why neither of
              // them is a pill any more.
              borderRadius: radius.button,
              borderColor: colors.border,
              paddingHorizontal: space[4],
              gap: space[2],
            },
          ]}
        >
          <Icon name="search" size={20} color={colors.textSecondary} />
          <View style={styles.flex}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {query}
            </Text>
            <Text variant="numMeta" color="secondary" numberOfLines={1}>
              {constraints}
            </Text>
          </View>
          {filterCount ? <Badge count={filterCount} tone="brand" /> : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  absoluteHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: { minHeight: HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center' },
  hero: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  headerBadge: { position: 'absolute', top: 2, right: 2 },
  searchPill: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
