import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle } from 'react-native-reanimated';

import { Icon, Text } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { pressScale, usePressAnimation } from '@/hooks/usePressAnimation';
import type { Dish, Kitchen } from '@/types/food';
import { metaLine, walkLabel } from '@/services/adapters/food.adapter';
import { formatRupees } from '@/utils/money';

import { FavouriteHeart } from './FavouriteHeart';
import { DietMark, FoodPhoto, RatingPill } from './FoodMarks';

/** Photo width : height. The reference card's photo is close to 8:5, which is
 *  wide enough to hold a plated dish and short enough that two cards still
 *  meet on one screen. */
const PHOTO_ASPECT = 1.62;

export type RestaurantListCardProps = {
  kitchen: Kitchen;
  open: boolean;
  onPress: () => void;
  /**
   * One dish to name on the photo, with its price.
   *
   * Chosen by the CALLER, not here: picking it means reading the kitchen's
   * menu, and the feed has every menu in hand already — a card that fetched
   * its own would do it once per card on every render. Absent is fine and
   * normal; the badge simply does not draw, which is the case for a kitchen
   * whose menu has not loaded or is empty.
   */
  highlight?: Dish;
  /** Staggers the entrance fade. */
  index?: number;
};

/**
 * A kitchen in the feed, as a full-width card.
 *
 * ## What this is a copy of, and what it is not
 *
 * The shape is the delivery-app listing card: one photo the width of the
 * screen, a dish named on it, and a block of facts underneath. It replaced a
 * two-column grid because a grid tile is too small to carry a photograph
 * anybody would order from — at half the screen's width a plated dish is a
 * smudge.
 *
 * What did NOT come across is everything in that layout with no data behind
 * it. The reference card carries "Free delivery with Gold" (no loyalty
 * programme here), "Flat ₹60 OFF above ₹99" (no discount system — every
 * order this app has written carries `discount: 0`), and a row of dots for a
 * photo carousel (one photo per kitchen, and roughly half of those are
 * missing). Drawing any of them would be the same mistake this module found
 * and removed once already. The badge rule this inherits from the grid card
 * it replaced is unchanged: a card shows a badge only when there is
 * something true to put in it, and no badge at all is a normal card.
 *
 * So the ribbon says "Free delivery" and only when `deliveryFee` is actually
 * zero; the dish badge names a real dish at its real price; the time is the
 * kitchen's own, and is a single number rather than the reference's
 * comfortable-looking range, because a range would be two numbers where the
 * data has one.
 */
export function RestaurantListCard({
  kitchen,
  open,
  onPress,
  highlight,
  index = 0,
}: RestaurantListCardProps) {
  const { colors, space, radius, layout } = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const { onPressIn, onPressOut, progress } = usePressAnimation('card');

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - progress.value * (1 - pressScale.card) }],
  }));

  const photoHeight = Math.round((width - layout.gutter * 2) / PHOTO_ASPECT);

  /* `deliveryMinutes` is 0 on every kitchen the adapter builds today, so this
     is `prepMinutes` in practice — and it stays written as the sum so it is
     still right on the day the backend starts sending travel time. Null when
     the kitchen has neither, which `metaLine` then drops rather than printing
     "0 mins". */
  const minutes = kitchen.prepMinutes + kitchen.deliveryMinutes;
  const timeLabel = minutes > 0 ? `${minutes} mins` : null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.delay(Math.min(index, 8) * 60).duration(280)}
    >
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={metaLine(
          kitchen.name,
          kitchen.cuisine,
          open ? 'open now' : 'closed',
          timeLabel,
        )}
      >
        <Animated.View
          style={[
            styles.card,
            pressStyle,
            {
              borderRadius: radius.card,
              backgroundColor: open ? colors.surface : colors.surfaceRaised,
              borderColor: open ? colors.border : colors.borderSubtle,
            },
          ]}
        >
          <View>
            {/* Square corners: the card clips, so a radius here would show as
                a second, smaller curve inside the first. */}
            <FoodPhoto height={photoHeight} radius={0} uri={kitchen.photo} muted={!open} />

            {/* The dish, named on the photo. The one piece of this layout that
                answers "what would I actually order here", which a cuisine tag
                never does. */}
            {highlight ? (
              <View
                style={[
                  styles.dishBadge,
                  { borderRadius: radius.chip, paddingHorizontal: space[2], gap: space[1] + 2 },
                ]}
              >
                <DietMark diet={highlight.diet} size={14} ink="#FFFFFF" />
                <Text variant="numMeta" numberOfLines={1} style={styles.onPhotoInk}>
                  {highlight.name} · {formatRupees(highlight.price)}
                </Text>
              </View>
            ) : null}

            <View style={styles.heart}>
              <FavouriteHeart kind="kitchen" id={kitchen.id} label={kitchen.name} size={20} />
            </View>

            {/* Real facts only. Free delivery is a thing this kitchen actually
                does; there is no membership to qualify it with. */}
            {open && kitchen.deliveryFee === 0 ? (
              <View style={[styles.ribbon, { backgroundColor: colors.brand, paddingHorizontal: space[3] }]}>
                <Text variant="numMeta" style={{ color: colors.onBrand }}>
                  Free delivery
                </Text>
              </View>
            ) : null}

            {open ? null : (
              <View
                style={[
                  styles.ribbon,
                  { backgroundColor: colors.graphite, paddingHorizontal: space[3] },
                ]}
              >
                <Text variant="numMeta" style={{ color: colors.onGraphite }}>
                  Closed
                </Text>
              </View>
            )}
          </View>

          <View style={{ padding: space[3], gap: space[1] }}>
            <View style={styles.titleRow}>
              <Text
                variant="title2"
                numberOfLines={1}
                style={{ flex: 1, color: open ? colors.textPrimary : colors.textTertiary }}
              >
                {kitchen.name}
              </Text>
              {open ? <RatingPill rating={kitchen.rating} count={kitchen.ratingCount} /> : null}
            </View>

            {timeLabel || walkLabel(kitchen) ? (
              <View style={[styles.metaRow, { gap: space[1] + 2 }]}>
                <Icon name="clock" size={16} color={colors.textTertiary} />
                <Text variant="caption" color="tertiary" numberOfLines={1}>
                  {metaLine(timeLabel, walkLabel(kitchen))}
                </Text>
              </View>
            ) : null}

            <Text variant="caption" color="tertiary" numberOfLines={1}>
              {kitchen.cuisine}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  dishBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    maxWidth: '75%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    /* Literal, not a token: this sits on owner-uploaded photography in both
       themes, and a dark-mode surface token would put a near-black pill on a
       near-black photo. Same reasoning as `IconButton`'s `onImage` disc. */
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  onPhotoInk: { color: '#FFFFFF', flexShrink: 1 },
  heart: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  ribbon: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    paddingVertical: 5,
    borderTopRightRadius: 10,
  },
});
