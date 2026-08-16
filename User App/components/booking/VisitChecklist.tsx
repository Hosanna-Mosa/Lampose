import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

/**
 * What to ask while you are standing there.
 *
 * This is the most useful block on the confirmed-visit screen and it is worth
 * being explicit about why. A first-time renter at an unfamiliar gate is
 * nervous, being shown around by someone older, and will almost always leave
 * without asking the four questions that would have told them what they were
 * signing up for. Not because they do not care — because in the moment it feels
 * rude, and they have no script.
 *
 * This is the script. It goes on the confirmed screen rather than a help page,
 * because it needs to be reachable one-handed while walking through a corridor.
 *
 * **The last item protects the product's own number.** "Confirm the deposit and
 * notice period match what's in the app" is the one line that catches a quoted
 * price quietly becoming a different price at the door — which is the single
 * most common trust complaint in this category, and the thing an app in the
 * middle exists to prevent. If a student checks nothing else, that is the one
 * worth checking.
 */

const ITEMS: readonly { title: string; body: string }[] = [
  {
    title: 'Ask to see the actual room',
    body: 'Not a sample room. The bed you would get, in the room you would share.',
  },
  {
    title: 'Run the tap and look at the bathroom',
    body: 'Water pressure and the state of the shared bathroom are what people regret, not the photos.',
  },
  {
    title: 'Ask when the rent last went up',
    body: 'And by how much. It tells you what next year costs better than any promise does.',
  },
  {
    title: 'Check the deposit and notice period against the app',
    body: 'They should match exactly. If the owner says a different number at the door, tell us before you pay anything.',
  },
];

export type VisitChecklistProps = {
  /** Overrides the default four. The last one should stay. */
  items?: readonly { title: string; body: string }[];
};

export function VisitChecklist({ items = ITEMS }: VisitChecklistProps) {
  const { colors, space, radius } = useTheme();

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.card,
        padding: space[4],
        gap: space[4],
      }}
    >
      <View style={{ gap: space[1] }}>
        <Text variant="title3">Ask on your visit</Text>
        <Text variant="caption" color="secondary">
          Four questions that are awkward for about five seconds and save a lot afterwards.
        </Text>
      </View>

      {items.map((item, index) => {
        // The last item is the one that protects the quoted number.
        const guards = index === items.length - 1;
        return (
          <View key={item.title} style={[styles.row, { gap: space[3] }]}>
            <View
              style={[
                styles.disc,
                {
                  borderRadius: radius.pill,
                  backgroundColor: guards ? colors.warning.tint : colors.surfaceSunken,
                },
              ]}
            >
              <Icon
                name={guards ? 'rupee' : 'check'}
                size={16}
                color={guards ? colors.warning.base : colors.textSecondary}
              />
            </View>
            <View style={[styles.flex, { gap: 2 }]}>
              <Text variant="bodyStrong">{item.title}</Text>
              <Text variant="caption" color="secondary">
                {item.body}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  disc: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
