import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { usePendingRequest } from '@/context/PendingRequestContext';

/**
 * What is still in progress, docked above the tab bar.
 *
 * ## The problem it solves
 *
 * A booking is four screens long — request, wait, pay, confirm you moved in —
 * and a student leaves the middle of it constantly: to compare one more
 * place, to answer a call, because the bus arrived. Coming back meant
 * remembering which listing it was and finding it again through Bookings,
 * and the commonest outcome of forgetting is a paid booking nobody ever
 * confirms moving into.
 *
 * ## Why here and not floating over everything
 *
 * There WAS a floating version of this — `WaitingPill` — and it was removed
 * for good reason: a control that hovers over every screen in the product,
 * and has to be dragged out of the way, is in the way. This is the other
 * answer to the same question. It lives in the layout, on ONE screen, in the
 * strip of the home screen directly above the tab bar: the place somebody
 * returns to, and nowhere else.
 *
 * ## Why it is drawn the way it is
 *
 * `bg` and `surface` are both pure white in this theme, so the first version
 * of this — a `surfaceSunken` fill behind a hairline border — was a #F0F0F0
 * card on a #FFFFFF page, which is to say invisible. It read as part of the
 * feed rather than as chrome.
 *
 * Three things fix that, and each does a different job:
 *
 *   the BAND    an opaque ground with a hairline along its top edge, so the
 *               feed visibly ends and the docked strip begins. It is what
 *               makes this read as chrome rather than as one more card that
 *               happened to scroll to the bottom.
 *   the TILE    a filled 40pt square holding an icon. This is where the
 *               colour lives — one saturated block reads at a glance from
 *               across a room, where a tinted card fill just looks like a
 *               slightly different white.
 *   the LIFT    a real shadow and a full-weight border, not a hairline.
 *
 * ## The status is the message
 *
 * "You have a booking" is not actionable. "Waiting for Padma" and "Confirm
 * your move-in" are two completely different things to do next, and which one
 * it says is the reason to tap it. It sits under the name in the accent, so
 * the eye lands on what to do rather than on which place it was.
 *
 * More than one is possible — a student can be waiting on one owner while
 * another booking waits on them — so this is a row rather than a single bar,
 * and scrolls sideways when there are several.
 */

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
   * `waiting` means somebody else is holding it, and it stays quiet — an
   * urgent-looking chip for something nobody can act on is noise.
   */
  tone: OngoingTone;
};

export type OngoingStripProps = {
  items: readonly OngoingItem[];
  onPress: (item: OngoingItem) => void;
};

export function OngoingStrip({ items, onPress }: OngoingStripProps) {
  const { colors, space, radius, elevation } = useTheme();
  const { reservedBottom } = usePendingRequest();

  if (!items.length) return null;

  const single = items.length === 1;

  const card = (item: OngoingItem) => {
    const acting = item.tone === 'action';
    return (
      <Pressable
        key={item.key}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.status}. Opens the booking.`}
        style={({ pressed }) => [
          styles.card,
          elevation.card,
          {
            transform: [{ scale: pressed ? 0.985 : 1 }],
            borderRadius: radius.card,
            padding: space[2],
            gap: space[3],
            backgroundColor: colors.surface,
            /* A full-weight border, not a hairline. On a white page a
               hairline is the difference between a card and nothing. */
            borderWidth: 1,
            borderColor: acting ? colors.brand : colors.border,
            width: single ? undefined : 268,
          },
        ]}
      >
        {/* The colour lives here rather than in the card's fill — one
            saturated block reads instantly; a tinted white does not. */}
        <View
          style={[
            styles.tile,
            {
              borderRadius: radius.button,
              backgroundColor: acting ? colors.brand : colors.surfaceSunken,
            },
          ]}
        >
          <Icon
            name={acting ? 'check' : 'clock'}
            size={20}
            color={acting ? colors.onBrand : colors.textSecondary}
          />
        </View>

        <View style={styles.body}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {item.title}
          </Text>
          <Text
            variant="caption"
            numberOfLines={1}
            style={{ color: acting ? colors.brandInk : colors.textSecondary }}
          >
            {item.status}
          </Text>
        </View>

        <Icon name="chevronRight" size={20} color={colors.textTertiary} />
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.band,
        {
          backgroundColor: colors.bg,
          borderTopColor: colors.borderSubtle,
          paddingTop: space[3],
          /*
           * The tab bar's MEASURED height, plus the strip's own padding.
           *
           * This was a flat `space[3]`. The strip sits in normal flow, but the
           * tab bar FLOATS over the content absolutely — so a fixed padding
           * left the lower part of the card behind the bar, and on a booking
           * that was the "Payment pending" line and the chevron: the two
           * things the strip exists to show.
           *
           * `reservedBottom` is the same registry the undo snackbar reads, and
           * `TabBar` writes its own laid-out height into it under 'tabbar' on
           * every layout pass. Taking the number from there rather than
           * hardcoding one means it cannot disagree with the bar, and it
           * follows the bar across devices — 56pt of content plus
           * `insets.bottom` plus `layout.bottomInsetExtra`, which is 90-100pt
           * on a handset with gesture navigation and less on one without.
           *
           * The registry keeps the TALLEST claim, so during a transition where
           * two things are pinned at once the strip clears both. Falling back
           * to 0 before the bar has measured is correct: on that first frame
           * there is no bar laid out to be behind.
           */
          paddingBottom: space[3] + reservedBottom,
        },
      ]}
    >
      {single ? (
        <View style={{ paddingHorizontal: space[4] }}>{card(items[0])}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space[4], gap: space[3] }}
        >
          {items.map(card)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { borderTopWidth: StyleSheet.hairlineWidth },
  card: { flexDirection: 'row', alignItems: 'center' },
  tile: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 1 },
});
