import React from 'react';
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

export function FavouriteHeart({
  kind,
  id,
  label,
  size = 18,
  tone = 'plain',
  style,
}: FavouriteHeartProps) {
  const { colors, mode } = useTheme();
  const { status, requireSignIn } = useAuth();
  const { isFavouriteDish, isFavouriteKitchen, toggleFavouriteDish, toggleFavouriteKitchen } = useFood();

  const scale = useSharedValue(1);

  const signedIn = status === 'signedIn';
  const saved = signedIn && (kind === 'dish' ? isFavouriteDish(id) : isFavouriteKitchen(id));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const press = () => {
    requireSignIn(() => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
      scale.value = withSequence(
        withSpring(1.38, { damping: 9, stiffness: 350 }),
        withSpring(1.0, { damping: 12, stiffness: 220 })
      );
      if (kind === 'dish') toggleFavouriteDish(id);
      else toggleFavouriteKitchen(id);
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
}

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
