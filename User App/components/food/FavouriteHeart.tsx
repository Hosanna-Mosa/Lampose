import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon, Text, type IconSize } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';

/**
 * The heart on a dish and on a kitchen.
 *
 * ## Why a heart and not the bookmark used on the stay side
 *
 * They are two different lists on the account — `saved` is the stay shortlist,
 * whose whole job is comparing rent over time, and `foodFavourites` is "take me
 * back to this". Giving them one glyph would suggest one list, and a student
 * who hearted a dosa would go looking for it under saved rooms.
 *
 * ## Filled means saved. Nothing else does.
 *
 * The outline/fill pair is the entire state signal, because colour alone is
 * not one: this sits on photographs, and a tinted outline over a bright dish
 * photo is unreadable at a glance. A filled heart reads at any size and on any
 * background.
 *
 * ## It never waits for the network to look pressed
 *
 * `useFoodFavourites` writes its cache first and rolls back on failure, so this
 * button re-renders on the tap. A heart that waits for a round trip reads as a
 * dropped press on a train, which produces a second tap — and a second tap
 * un-hearts. See the hook for the rollback.
 *
 * ## Signed out, the tap is the ask
 *
 * Favourites live on the account, so there is nowhere to put one without a
 * session. Rather than hiding the heart — which would make the feature
 * invisible to exactly the people who have not signed up — it is shown, and
 * tapping it goes to sign-in. The ask lands at the moment of intent instead of
 * as a wall in front of a menu.
 */
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
  const router = useRouter();
  const { status } = useAuth();
  const { isFavouriteDish, isFavouriteKitchen, toggleFavouriteDish, toggleFavouriteKitchen } = useFood();

  const signedIn = status === 'signedIn';
  const saved = signedIn && (kind === 'dish' ? isFavouriteDish(id) : isFavouriteKitchen(id));

  const press = () => {
    if (!signedIn) {
      router.push('/(entry)/auth');
      return;
    }
    if (kind === 'dish') toggleFavouriteDish(id);
    else toggleFavouriteKitchen(id);
  };

  return (
    <Pressable
      onPress={press}
      /* A heart is a small target on a scrolling list and it sits next to an
         Add control — a mis-tap that adds food is a mis-tap somebody pays for,
         so the touch area is grown well past the glyph. */
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
