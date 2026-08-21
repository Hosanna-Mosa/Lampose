import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, OptionCard, Text } from '@/components/ui';
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
 * ## A 2x2 grid, not four stacked rows
 *
 * Four full-width rows read as a LIST, and a list reads as ordered — the top
 * one looks recommended and the bottom one looks like an afterthought. These
 * four are peers. A student choosing a hotel for three nights is not making a
 * lesser version of the choice someone renting a bachelor room is making.
 *
 * A grid also puts all four in one glance above the fold, which matters when
 * the whole point of the screen is to compare them. The same reasoning is why
 * `CategoryTabs` has no travelling indicator.
 *
 * The tiles are `OptionCard`s in its `tile` layout rather than bespoke markup,
 * so the selected state here — accent tint, accent border, filled tick — is
 * literally the same component the sharing picker uses on a listing. That is
 * the part worth keeping whatever the arrangement: a student learns once what
 * "chosen" looks like.
 *
 * Single-select is a radio, not a checkbox: tapping a second card moves the
 * choice rather than adding to it, and the accessibility role says so.
 */
export default function CategoryChoiceScreen() {
  const { colors, space, radius, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { locality, setCategory } = useAppState();

  const [picked, setPicked] = useState<StayCategory | null>(null);

  const finish = async () => {
    if (!picked) return;
    await setCategory(picked);
    /*
     * Two destinations, and deliberately two different VERBS.
     *
     * Going on to the area question is a `push`, because the student has to be
     * able to come back and change what they just picked. `dismissTo` and
     * `replace` both destroy this screen on the way out, which is what left
     * the area screen with a dead back arrow and no way to revise a mis-tap on
     * the very first thing the app asks. A push during the first-run chain is
     * safe: the duplicate-screen bug this flow had was never about pushing, it
     * was about REPLACING onto a route that was already in the stack.
     *
     * Going back to the feed is `dismissTo`, because `/home` is already behind
     * this screen whenever the category is being changed rather than answered.
     * `replace` there would pop this and push a SECOND home on top of the
     * first — that is the duplication, and `dismissTo` returns to the existing
     * one instead. It still falls back to a replace when no home is in the
     * stack, so it is safe on either path.
     */
    if (locality) router.dismissTo('/home');
    else router.push('/(entry)/locality');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      <ScrollView
        contentContainerStyle={{
          // flexGrow rather than flex: the container fills the screen when the
          // content is short — which is what lets the cards centre — but still
          // scrolls normally once large text makes it taller than the screen.
          flexGrow: 1,
          paddingHorizontal: layout.gutter,
          paddingTop: space[6],
          paddingBottom: space[8],
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

        {/*
          The cards sit in the optical centre of what is left between the
          question and the button, rather than stacked under the question.

          The screen asks one thing and offers four equal answers, so the
          answers belong in the middle — a block pushed to the top leaves dead
          space below it that reads as content still loading. It also lands them
          closer to where a thumb already is.

          `flex: 1` here and `flexGrow: 1` on the container: when large text
          makes the cards taller than the space, there is nothing left to centre
          and this simply fills, then scrolls.
        */}
        <View style={styles.centreBand}>
          <View
            style={[styles.grid, { columnGap: space[3], rowGap: space[3] }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="Kind of place"
          >
            {CATEGORY_ORDER.map((category) => {
              const set = colors.category[category];
              return (
                <OptionCard
                  key={category}
                  layout="tile"
                  style={styles.tile}
                  /* The monogram is the category's identity, not a decoration
                     awarded to the selected one, so it is drawn in both states. */
                  leading={
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
                  }
                  label={CATEGORY_LABEL[category]}
                  description={CATEGORY_TILE_BLURB[category]}
                  selected={picked === category}
                  // Single-select: this moves the choice, it does not add to it.
                  onSelect={() => setPicked(category)}
                  // The long blurb, for a screen reader that has room for it.
                  accessibilityHint={CATEGORY_BLURB[category]}
                />
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
   * Two columns at every width the app ships to, and the tile width comes from
   * the row rather than from the device.
   *
   * `flexBasis: '46%'` puts two per row: 92% plus the column gap fits every
   * target width from 320 to 420. `flexGrow: 1` then expands both tiles to
   * consume whatever is left, so rows are flush and the tile is simply wider on
   * a wider phone — same design, more room.
   *
   * `minWidth: 130` is the only floor, and it is a CONTENT floor rather than a
   * device one: below roughly 130dp the label stops being readable. Across the
   * target widths the computed tile is 138-186dp, so it never fires. It exists
   * for a container narrower than anything we ship.
   */
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { flexGrow: 1, flexBasis: '46%', minWidth: 130 },
  monogram: {
    minWidth: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  centred: { textAlign: 'center' },
});
