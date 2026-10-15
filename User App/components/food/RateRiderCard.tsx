import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, TextField } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { FoodOrder } from '@/types/food';

/** How long after delivery the server still takes a rating — see `RATING_WINDOW_MS`. */
const RATING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const WORDS = ['', 'Poor', 'Not great', 'Okay', 'Good', 'Excellent'] as const;

export type RateRiderCardProps = {
  order: FoodOrder;
  /** `useFood().rateRider`. Throws the server's refusal, in its own words. */
  onRate: (id: string, stars: number, comment: string) => Promise<void>;
};

/**
 * "How was your delivery?" — the one place a rider's rating comes from.
 *
 * Asked only where there is somebody to rate and it can still be given: the
 * order was DELIVERED, by a Lampose rider (not the restaurant's own person,
 * who has no rating to land on), within the last week. After that it is a
 * one-line record of what the diner said, and outside it nothing is drawn —
 * a card offering stars the server will refuse is a dead control.
 *
 * Stars are the deal yellow, as every rating star in the app is.
 */
export function RateRiderCard({ order, onRate }: RateRiderCardProps) {
  const { colors, radius, space } = useTheme();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rider = order.rider;
  if (order.status !== 'delivered' || !rider || order.restaurantDelivers) return null;

  const firstName = rider.name?.trim().split(/\s+/)[0] || 'your rider';

  const frame = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: space[4],
    gap: space[3],
  } as const;

  /* Already rated: say what was said, and nothing more to tap. */
  if (order.riderRating) {
    return (
      <View style={[frame, styles.row, { gap: space[2] }]}>
        <Icon name="star" size={18} color={colors.deal.ink} fill={colors.deal.base} />
        <Text variant="body" color="secondary" style={styles.flex}>
          You rated {firstName} {order.riderRating.stars} out of 5. Thank you.
        </Text>
      </View>
    );
  }

  const deliveredAt = rider.deliveredAt ? new Date(rider.deliveredAt).getTime() : NaN;
  if (Number.isFinite(deliveredAt) && Date.now() - deliveredAt > RATING_WINDOW_MS) return null;

  const submit = () => {
    if (busy || stars < 1) return;
    setBusy(true);
    setError(null);
    onRate(order.id, stars, comment.trim())
      .catch((err: Error) => setError(err?.message || 'We could not save your rating. Please try again.'))
      .finally(() => setBusy(false));
  };

  return (
    <View style={frame}>
      <View style={{ gap: space[1] }}>
        <Text variant="title3">How was your delivery?</Text>
        <Text variant="body" color="secondary">
          Rate {firstName}, who brought your order.
        </Text>
      </View>

      <View style={[styles.row, { gap: space[2] }]} accessibilityRole="radiogroup" accessibilityLabel="Rating">
        {[1, 2, 3, 4, 5].map((value) => {
          const on = value <= stars;
          return (
            <Pressable
              key={value}
              onPress={() => setStars(value)}
              hitSlop={6}
              accessibilityRole="radio"
              accessibilityState={{ selected: stars === value }}
              accessibilityLabel={`${value} star${value === 1 ? '' : 's'}, ${WORDS[value]}`}
              style={styles.star}
            >
              <Icon
                name="star"
                size={28}
                color={on ? colors.deal.ink : colors.textTertiary}
                fill={on ? colors.deal.base : 'transparent'}
              />
            </Pressable>
          );
        })}
        {stars > 0 ? (
          <Text variant="bodyStrong" style={{ marginLeft: space[1] }}>
            {WORDS[stars]}
          </Text>
        ) : null}
      </View>

      {stars > 0 ? (
        <TextField
          label="Anything to add?"
          optional
          multiline
          maxLength={300}
          showCount
          value={comment}
          onChangeText={setComment}
          placeholder={stars >= 4 ? 'What did they do well?' : 'What went wrong?'}
        />
      ) : null}

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}

      <Button
        label="Submit rating"
        fullWidth
        loading={busy}
        disabled={busy || stars < 1}
        onPress={submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  star: { padding: 2 },
});
