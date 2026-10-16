import React, { memo, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Icon, Text, type IconSize } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { HEART_REPEAT_MS } from '@/components/discovery/ListingCard';

export type FavouriteHeartProps = {
  kind: 'dish' | 'kitchen';
  id: string;
  /** What it is, for the screen reader: "Masala Dosa". */
  label: string;
  /* The kit's icon sizes are a fixed union, not any number. */
  size?: IconSize;
  /**
   * `plain` is the bare glyph, for a row that already has its own surface.
   * `overlay` is the one that sits ON a photograph and needs its own scrim to
   * stay visible over whatever the kitchen uploaded.
   */
  tone?: 'plain' | 'overlay';
  style?: ViewStyle;
};

/*
 * Two layers, and the split is the point.
 *
 * Every heart reads `useFood()`, which changes on every cart tap and every
 * poll of a live order — and there is one heart on every kitchen card and every
 * dish row. As one component, all of them redrew (animated style, pressable,
 * icon) on each "+" anywhere on the menu, through rows that were themselves
 * memoised. Now the context read is this thin outer layer, which only works out
 * `saved`; the button below is memoised on that and redraws only when THIS
 * heart changes.
 */
export function FavouriteHeart({
  kind,
  id,
  label,
  size = 18,
  tone = 'plain',
  style,
}: FavouriteHeartProps) {
  const { status, requireSignIn } = useAuth();
  const { isFavouriteDish, isFavouriteKitchen, toggleFavouriteDish, toggleFavouriteKitchen } = useFood();

  const signedIn = status === 'signedIn';
  const saved = signedIn && (kind === 'dish' ? isFavouriteDish(id) : isFavouriteKitchen(id));

  /* The latest of everything the tap needs, read at tap time, so the handler
     handed to the button never changes identity. */
  const latest = useRef({ kind, id, requireSignIn, toggleFavouriteDish, toggleFavouriteKitchen });
  latest.current = { kind, id, requireSignIn, toggleFavouriteDish, toggleFavouriteKitchen };
  const toggle = useCallback((animate: () => void) => {
    const now = latest.current;
    now.requireSignIn(() => {
      animate();
      if (now.kind === 'dish') now.toggleFavouriteDish(now.id);
      else now.toggleFavouriteKitchen(now.id);
    });
  }, []);

  return <HeartButton saved={saved} label={label} size={size} tone={tone} style={style} onToggle={toggle} />;
}

const HeartButton = memo(function HeartButton({
  saved,
  label,
  size,
  tone,
  style,
  onToggle,
}: {
  saved: boolean;
  label: string;
  size: IconSize;
  tone: 'plain' | 'overlay';
  style?: ViewStyle;
  onToggle: (animate: () => void) => void;
}) {
  const { colors, mode } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  /* A double tap saved and at once unsaved — the heart looked broken. */
  const lastTap = useRef(0);
  const press = () => {
    const now = Date.now();
    if (now - lastTap.current < HEART_REPEAT_MS) return;
    lastTap.current = now;
    onToggle(() => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
      scale.value = withSequence(
        withSpring(1.38, { damping: 9, stiffness: 350 }),
        withSpring(1.0, { damping: 12, stiffness: 220 })
      );
    });
  };

  const isOverlay = tone === 'overlay';

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={press}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={
          saved ? `Remove ${label} from favourites` : `Save ${label} to favourites`
        }
        style={({ pressed }) => [
          styles.button,
          isOverlay
            ? {
                backgroundColor: pressed ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.42)',
                borderColor: 'rgba(255, 255, 255, 0.18)',
                borderWidth: StyleSheet.hairlineWidth,
              }
            : {
                backgroundColor: saved
                  ? (mode === 'dark' ? 'rgba(255, 56, 92, 0.18)' : 'rgba(255, 56, 92, 0.08)')
                  : (pressed ? colors.surfaceSunken : colors.surfaceRaised),
                borderColor: saved ? 'rgba(255, 56, 92, 0.25)' : colors.borderSubtle,
                borderWidth: StyleSheet.hairlineWidth,
              },
          pressed && { opacity: 0.85 },
          style,
        ]}
      >
        <Icon
          name="heart"
          size={size}
          color={saved ? '#FF385C' : (isOverlay ? '#FFFFFF' : colors.textSecondary)}
          fill={saved ? '#FF385C' : 'none'}
        />
      </Pressable>
    </Animated.View>
  );
});

/**
 * The line a favourites screen shows when some of its rows cannot be drawn.
 *
 * A favourite whose kitchen has been delisted is withheld by the server and
 * KEPT in the record — a suspension is usually temporary, and deleting
 * somebody's favourites as a side effect of a moderation action we may reverse
 * tomorrow is not a trade worth making silently. Saying so is the difference
 * between a list that is explicably short and one that looks like it lost
 * something.
 */
export function FavouritesUnavailableNote({ count }: { count: number }) {
  const { colors, space, radius } = useTheme();
  if (count <= 0) return null;

  return (
    <View
      style={[
        styles.note,
        { backgroundColor: colors.surfaceSunken, borderRadius: radius.card, padding: space[3], gap: space[2] },
      ]}
    >
      <Icon name="clock" size={16} color={colors.textTertiary} />
      <Text variant="caption" color="tertiary" style={{ flex: 1 }}>
        {count === 1
          ? '1 favourite is not available right now — its kitchen is closed to orders.'
          : `${count} favourites are not available right now — their kitchens are closed to orders.`}
        {' '}
        They are still saved.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { flexDirection: 'row', alignItems: 'flex-start' },
});
