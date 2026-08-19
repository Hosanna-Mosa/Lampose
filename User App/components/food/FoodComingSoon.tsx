import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

/**
 * What the Food tab opens in production while the module is being built.
 *
 * It borrows the state-template posture (glyph, title, body, one action) but
 * is its own component: the empties in `constants/copy` all describe a market
 * condition ("no PGs under ₹8,000"), and this is a promise instead. The red
 * set is the module's own palette — the disc is `danger.tint` with the ink on
 * it, never the solid base, because nothing here is an error and it must not
 * shout like one.
 */
export function FoodComingSoon({ onExplore }: { onExplore: () => void }) {
  const { colors, space, layout, radius } = useTheme();

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { padding: layout.gutter, paddingBottom: space[8], gap: space[4] },
      ]}
    >
      <View
        style={[
          styles.disc,
          {
            backgroundColor: colors.danger.tint,
            borderColor: colors.danger.border,
            borderRadius: radius.pill,
          },
        ]}
      >
        <Icon name="food" size={28} color={colors.danger.ink} />
      </View>

      <View style={{ gap: space[2], alignItems: 'center' }}>
        <Text variant="display2" style={styles.center}>
          Food is coming soon
        </Text>
        <Text variant="body" color="secondary" style={[styles.center, styles.measure]}>
          Tiffin plans, mess menus and one-off meals near your stay — priced monthly, the
          way your rent is. We are cooking; it is not ready to serve.
        </Text>
        <Text variant="caption" color="tertiary" style={[styles.center, styles.measure]}>
          It will appear right here, behind this button, the day it opens.
        </Text>
      </View>

      {/*
        Centred, and matched to the measure the copy above runs to.

        See `styles.action` for why `alignSelf` has to be set explicitly: a
        Button sets its own, and a child's `alignSelf` beats the parent's
        `alignItems`.
      */}
      <Button
        label="Back to Explore"
        variant="secondary"
        onPress={onExplore}
        fullWidth
        style={styles.action}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  center: { textAlign: 'center' },
  measure: { maxWidth: 300 },
  /*
   * `alignSelf` centres it; `maxWidth` alone did not.
   *
   * Two goes at this now, so worth writing down. A hugging Button sets
   * `alignSelf: 'flex-start'` on itself and `fullWidth` sets
   * `alignSelf: 'stretch'` — and a child's own `alignSelf` beats the
   * parent's `alignItems: 'center'` either way. Capping the width then made
   * it a 300pt box still pinned to the leading edge, under a centred glyph, a
   * centred title and two centred paragraphs.
   *
   * The style prop is applied after the Button's own, so this wins. `width`
   * is what gives it something to centre: a stretched box with no width
   * resolves to the container and there is no slack left to distribute.
   */
  action: { alignSelf: 'center', width: '100%', maxWidth: 300 },
});
