import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { MealWindow, MealWindowId } from '@/types/food';
import { clockLabel, minutesUntilClose, minutesUntilOpen, railFor } from '@/types/food';

/**
 * The meal-window rail — the module's spine.
 *
 * Four cells, always four, and the current window is one of them no matter
 * what time it is. The rail ROLLS rather than resetting to breakfast: at 11:52
 * pm it reads Snacks · Dinner · **Late night** · Breakfast, so the window the
 * student is in and the one they will use next are both on screen. Windows
 * already past keep their cell and get struck through — a rail that hid them
 * would change width four times a day and stop being a fixed landmark.
 *
 * The current cell is the inverted surface (`graphite`), which is the app's
 * existing "this is the one" treatment for a bar sitting on the ground colour.
 * It is not the brand green, because green in this app means confirmed, and a
 * meal window is not an outcome.
 */
export function MealWindowRail({
  now,
  value,
  onChange,
}: {
  now: Date;
  value: MealWindowId;
  onChange: (id: MealWindowId) => void;
}) {
  const { colors, space, layout, radius } = useTheme();
  const tokens = railFor(now, value);

  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', gap: space[2], paddingHorizontal: layout.gutter }}
    >
      {tokens.map(({ window, state }) => {
        const current = window.id === value;
        return (
          <Pressable
            key={window.id}
            onPress={() => onChange(window.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: current }}
            accessibilityLabel={`${window.label}, ${window.hours}`}
            style={[
              styles.cell,
              {
                borderRadius: radius.button,
                paddingVertical: space[2] + 1,
                paddingHorizontal: space[1],
                backgroundColor: current ? colors.graphite : colors.surface,
                borderColor: current ? colors.graphite : colors.border,
              },
            ]}
          >
            <Text
              variant="title3"
              numberOfLines={1}
              style={{
                color: current ? colors.onGraphite : state === 'past' ? colors.textTertiary : colors.textSecondary,
                textDecorationLine: state === 'past' ? 'line-through' : 'none',
              }}
            >
              {window.label}
            </Text>
            <Text
              variant="numMeta"
              numberOfLines={1}
              style={{ color: current ? colors.onGraphiteMuted : colors.textTertiary, marginTop: 2 }}
            >
              {window.hours}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The compact token — the same fact as the rail, one line high.
 *
 * Every screen past the feed carries this instead of the full rail. The window
 * is what makes a price and a ready time true, so it cannot be left behind on
 * the feed; but a cart screen with a four-cell selector on it invites a student
 * to change the window with a cart already in it, which is a different and much
 * worse question.
 *
 * The dot is green only when the kitchen clock is actually running. Between
 * windows it goes muted and the label reads as "what is next", which is what it
 * is.
 */
export function MealWindowToken({ window, now }: { window: MealWindow; now: Date }) {
  const { colors, space, radius } = useTheme();
  const open = minutesUntilOpen(window, now) === 0;

  return (
    <View
      accessibilityLabel={open ? `${window.label} window, open now` : `${window.label} window, opens at ${clockLabel(window.startMinute)}`}
      style={[
        styles.token,
        {
          backgroundColor: colors.graphite,
          borderRadius: radius.pill,
          paddingHorizontal: space[3] - 2,
          paddingVertical: space[1] + 2,
          gap: space[1] + 2,
        },
      ]}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          backgroundColor: open ? colors.brandOnDark : colors.onGraphiteMuted,
        }}
      />
      <Text variant="label" style={{ color: colors.onGraphite, letterSpacing: 0.4 }}>
        {window.label}
      </Text>
    </View>
  );
}

/**
 * The one-line statement of where the clock is.
 *
 * Shown under the rail, and it is the difference between a feed that looks
 * short and a feed that explains itself: "6 kitchens cooking · lunch closes at
 * 3:30 pm" tells a student both that the list is complete and how long they
 * have to act on it.
 */
export function WindowStatusLine({
  window,
  now,
  kitchenCount,
}: {
  window: MealWindow;
  now: Date;
  kitchenCount: number;
}) {
  const { colors } = useTheme();
  const closesIn = minutesUntilClose(window, now);
  const opensIn = minutesUntilOpen(window, now);

  if (closesIn === null) {
    return (
      <Text variant="caption" color="tertiary">
        {`${window.label} opens at ${clockLabel(window.startMinute)}`}
        {opensIn > 0 && opensIn < 240 ? ` · in ${formatGap(opensIn)}` : ''}
        {` · ${kitchenCount} ${kitchenCount === 1 ? 'kitchen' : 'kitchens'} cook this window`}
      </Text>
    );
  }

  /* Under half an hour the closing time stops being background information and
     becomes the reason to order now, so it takes the warning ink. */
  const urgent = closesIn <= 30;

  return (
    <Text variant="caption" style={{ color: urgent ? colors.warning.ink : colors.textTertiary }}>
      {`${kitchenCount} ${kitchenCount === 1 ? 'kitchen' : 'kitchens'} cooking now · ${window.label} closes at ${clockLabel(window.endMinute)}`}
      {urgent ? ` · ${formatGap(closesIn)} left` : ''}
    </Text>
  );
}

function formatGap(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} m`;
}

const styles = StyleSheet.create({
  cell: { flex: 1, minWidth: 0, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, minHeight: 44, justifyContent: 'center' },
  token: { flexDirection: 'row', alignItems: 'center' },
});
