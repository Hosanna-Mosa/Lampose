import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/common';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { boldBody } from '@/components/common/utils/styles';

/**
 * What is still open, docked above the tab bar on Today.
 *
 * ## Why an owner needs this and the badge is not enough
 *
 * Two things in this app wait on somebody and then go quiet. A request gives
 * the owner minutes to answer — the Requests tab badges that one. The other
 * has no badge anywhere: a guest the owner has marked in, whose stay does not
 * start until the guest confirms from their own phone. The owner taps "mark
 * as moved in", the booking stays in Upcoming, and unless they happen to
 * reopen that exact booking there is nothing in the product that says it is
 * still half-done.
 *
 * ## In the layout, on one screen
 *
 * `Screen`'s footer band, so it sits directly above the tab bar and covers
 * nothing. Today is where an owner starts; a strip that followed them onto
 * every screen would be in the way of the work it is reminding them about.
 *
 * ## Why it is drawn the way it is
 *
 * The first version was a plain `surface` card with a 1px `borderCard` line,
 * which is #FFFFFF on the #EFEDE9 ground behind a nearly-#EFEDE9 border —
 * one more card in a screen already made of cards, and it disappeared into
 * the page. Three things fix it:
 *
 *   the TILE    a filled 38pt square holding an icon. The colour lives in one
 *               saturated block, which reads from across a counter; a tinted
 *               card fill just looks like a slightly different white.
 *   the LIFT    a real shadow, so the strip sits ABOVE the screen rather than
 *               in it — the thing that makes it read as chrome.
 *   the EDGE    the accent border on the card whose move is the owner's.
 *
 * ## The status is the message
 *
 * "1 booking in progress" tells an owner nothing they can act on. "Waiting
 * for Sunand to confirm" and "Waiting on your answer" are different jobs, and
 * which one it says is why it is worth a tap.
 */

export type OwnerOngoingItem = {
  key: string;
  /** Who — the guest or the requester. An owner recognises a booking by name. */
  title: string;
  /** What is happening, in the words of what to do next. */
  status: string;
  /** `action` is the owner's move and takes the accent; `waiting` is somebody
      else's and stays quiet, because an urgent chip on something nobody here
      can act on is noise. */
  tone: 'waiting' | 'action';
  /**
   * The glyph, per state rather than per tone.
   *
   * Tone alone gave every actionable row a bell, which is a NOTIFICATION —
   * right for a request waiting on an answer, wrong for a guest turning up at
   * the door this afternoon. Four states share this strip and the icon is the
   * part read before the words are.
   */
  icon: IconName;
  /**
   * Exactly the screen this row was left on.
   *
   * Carried by the item rather than worked out from the key at press time,
   * because the STAGE knows the destination and a parser does not: a booking
   * whose guest has not confirmed belongs on `booking/checked-in`, not on the
   * booking detail that merely links to it. Deriving it here is what makes
   * tapping a row resume the flow rather than land near it.
   */
  href: { pathname: string; params: { id: string } };
};

export function OngoingStrip({
  items,
  onPress,
}: {
  items: readonly OwnerOngoingItem[];
  onPress: (item: OwnerOngoingItem) => void;
}) {
  const c = useColors();

  if (!items.length) return null;

  const single = items.length === 1;

  const card = (item: OwnerOngoingItem) => {
    const acting = item.tone === 'action';
    return (
      <Pressable
        key={item.key}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.status}.`}
        style={({ pressed }) => [
          styles.card,
          styles.lift,
          {
            shadowColor: c.textPrimary,
            transform: [{ scale: pressed ? 0.985 : 1 }],
            borderRadius: radius.card,
            backgroundColor: c.surface,
            borderColor: acting ? c.accent : c.borderCard,
            borderWidth: acting ? 1.5 : 1,
            width: single ? undefined : 268,
          },
        ]}
      >
        <View
          style={[
            styles.tile,
            { backgroundColor: acting ? c.accent : c.surfaceSunken },
          ]}
        >
          <Icon name={item.icon} size={18} color={acting ? c.surface : c.textSecondary} />
        </View>

        <View style={styles.body}>
          <Text numberOfLines={1} style={styles.name}>
            {item.title}
          </Text>
          <Text
            variant="caption"
            numberOfLines={1}
            style={{ color: acting ? c.accentInk : c.textSecondary }}
          >
            {item.status}
          </Text>
        </View>

        <Icon name="chevron-right" size={18} color={c.textTertiary} />
      </Pressable>
    );
  };

  if (single) return card(items[0]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map(card)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
  },
  /* Separates the strip from the screen it is docked over. `Screen`'s footer
     band is the same ground as the page, so without this the card is one more
     white rectangle among several. */
  lift: {
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  tile: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 1 },
  name: { ...boldBody },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
});
