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
  size = 20,
  tone = 'plain',
  style,
}: FavouriteHeartProps) {
  const { colors, space, radius } = useTheme();
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
        withSpring(1.38, { damping: 8, stiffness: 350 }),
        withSpring(1.0, { damping: 12, stiffness: 220 })
      );
      if (kind === 'dish') toggleFavouriteDish(id);
      else toggleFavouriteKitchen(id);
    });
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={press}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={
          saved ? `Remove ${label} from favourites` : `Save ${label} to favourites`
        }
        style={({ pressed }) => [
          styles.button,
          tone === 'overlay' && {
            backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
            borderRadius: radius.chip,
            padding: space[1] + 2,
          },
          pressed && tone === 'plain' && { opacity: 0.6 },
          style,
        ]}
      >
        <Icon
          name="heart"
          size={size}
          color={saved ? colors.danger.ink : colors.textTertiary}
          fill={saved ? colors.danger.ink : 'none'}
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
  button: { alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start' },
});
