import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import {
  CATEGORY_BLURB,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CATEGORY_TILE_BLURB,
} from '@/components/discovery';
import { useAppState } from '@/context/AppStateContext';
import { useTheme } from '@/context/ThemeContext';
import type { StayCategory } from '@/constants/tokens';

/**
 * What kind of place are you looking for?
 *
 * **Required, single choice, and it filters the feed.** This screen used to be
 * skippable and only reordered the rows — it now decides what is on home at
 * all, so there is no Skip and the button stays disabled until something is
 * picked.
 *
 * A required question has to earn the friction, and it earns it by being honest
 * about two things the old copy could afford to leave out:
 *
 *  1. **It says the feed will show only this.** A filter the user was not told
 *     about is the reason people conclude an app "has nothing".
 *  2. **It says the choice is changeable from home.** That single line turns a
 *     gate into a starting point — nobody has to get it right, and nobody is
 *     punished for guessing. Without it, a required first choice makes people
 *     hesitate over a decision that costs nothing.
 *
 * ## Why a 2x2 grid rather than four rows
 *
 * Four full-width rows read as a list, and a list reads as *ordered* — the top
 * one looks recommended and the bottom one looks like an afterthought. These
 * four are peers. A student choosing a dormitory for three nights is not making
 * a lesser version of the choice someone renting a bachelor room is making.
 *
 * A grid also puts all four in one glance above the fold, which matters when
 * the point of the screen is to compare them. The same reasoning is why
 * `CategoryTabs` has no travelling indicator.
 *
 * Single-select is a radio, not a checkbox: tapping a second tile moves the
 * choice rather than adding to it, and the accessibility role says so.
 */
export default function CategoryChoiceScreen() {
  const { colors, space, radius, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setCategory } = useAppState();

  const [picked, setPicked] = useState<StayCategory | null>(null);

  const finish = async () => {
    if (!picked) return;
    await setCategory(picked);
    router.replace('/home');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      <ScrollView
        contentContainerStyle={{
          // flexGrow rather than flex: the container fills the screen when the
          // content is short — which is what lets the grid centre — but still
          // scrolls normally once large text makes it taller than the screen.
          flexGrow: 1,
          paddingHorizontal: layout.gutter,
          paddingTop: space[6],
          paddingBottom: insets.bottom + space[8],
          gap: space[5],
        }}
      >
        <View style={{ gap: space[2] }}>
          <Text variant="display2">What kind of place?</Text>
          <Text variant="bodyLg" color="secondary">
            We&apos;ll show you these and nothing else — you can switch at the top of the next
            screen whenever you like.
          </Text>
        </View>

        {/* The grid sits in the middle of what is left between the question
            and the button, rather than stacked under the question.

            The screen asks one thing and offers four equal answers, so the
            answers belong in the optical centre — a block pushed to the top
            leaves dead space below it that reads as content still loading. It
            also lands the tiles closer to where a thumb already is.

            `flex: 1` here and `flexGrow: 1` on the container: when large text
            makes the tiles taller than the space, there is nothing left to
            centre and this simply fills, then scrolls. */}
        <View style={styles.centreBand}>
          <View
            style={[styles.grid, { columnGap: space[3], rowGap: space[3] }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="Kind of place"
          >
            {CATEGORY_ORDER.map((category) => {
              const set = colors.category[category];
              const active = picked === category;
              return (
                <Pressable
                  key={category}
                  // Single-select: this moves the choice, it does not add to it.
                  onPress={() => setPicked(category)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={CATEGORY_LABEL[category]}
                  // The long blurb, for a screen reader that has room for it.
                  accessibilityHint={CATEGORY_BLURB[category]}
                  style={[
                    styles.tile,
                    {
                      minHeight: 148,
                      borderRadius: radius.card,
                      borderWidth: active ? 1.5 : 1,
                      borderColor: active ? set.mark : colors.border,
                      backgroundColor: active ? set.tint : colors.surface,
                      padding: space[4],
                      gap: space[3],
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      // The mark sits at the top of the tile and the name at the
                      // bottom, so the four names land on one horizontal line
                      // across the grid and can be read as a set.
                      justifyContent: 'space-between',
                    },
                  ]}
                >
                  {/* The tick rides the monogram's row, so selecting a tile
                      never displaces the text under it — a tile that reflows on
                      selection reads as a different tile. */}
                  <View style={styles.monogramRow}>
                    <View
                      style={[
                        styles.monogram,
                        { backgroundColor: set.mark, borderRadius: radius.chip },
                      ]}
                    >
                      <Text variant="label" style={{ color: colors.onBrand, letterSpacing: 0 }}>
                        {set.code}
                      </Text>
                    </View>
                    {active ? <Icon name="check" size={20} color={set.mark} /> : null}
                  </View>
                  <View style={{ gap: 2 }}>
                    <Text variant="title3" style={active ? { color: set.ink } : {}}>
                      {CATEGORY_LABEL[category]}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {CATEGORY_TILE_BLURB[category]}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: space[2] }}>
          <Button
            label={
              picked ? `Show me ${CATEGORY_LABEL[picked].toLowerCase()}` : 'Pick one to continue'
            }
            onPress={finish}
            disabled={!picked}
            fullWidth
          />
          {/* The line that turns a gate into a starting point. */}
          <Text variant="caption" color="tertiary" style={styles.centred}>
            You can change this any time from the tabs above the feed.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centreBand: { flex: 1, justifyContent: 'center' },
  /*
   * Two columns at every width the app ships to, and the card width comes from
   * the row rather than from the device.
   *
   * This screen used to consult `useShouldStack()`, which asks "is this device
   * narrow?" and answered yes below 380dp — so a 360dp phone collapsed to one
   * column even though each tile would have been 157dp and perfectly usable.
   * The column count was being decided by a threshold chosen for the action
   * bar's arithmetic on a different screen.
   *
   * `flexBasis: '46%'` puts two per row: 92% plus the column gap fits every
   * target width from 320 to 420. `flexGrow: 1` then expands both tiles to
   * consume whatever is left, so rows are flush and the card is simply wider on
   * a wider phone — same design, more room.
   *
   * `minWidth: 130` is the only floor, and it is a content floor rather than a
   * device one: below roughly 130dp the label stops being readable. Across the
   * target widths the computed tile is 138-186dp, so it never fires. It exists
   * for a container narrower than anything we ship.
   */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: { flexGrow: 1, flexBasis: '46%', minWidth: 130 },
  monogramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  monogram: {
    minWidth: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  centred: { textAlign: 'center' },
});
