import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { daysInMonth } from './MoveInDatePicker';

/**
 * The visit calendar, open on the screen.
 *
 * ## Why this is not `DateField`, and not `MoveInDatePicker`
 *
 * `DateField` puts the calendar behind a tap: a closed field, then the OS
 * dialog. That is right where a date is one field among many on a form. It is
 * wrong here, because on this screen the date IS the screen — hiding it
 * behind a control makes the one question the page exists to ask look
 * optional, and it costs a tap before anybody can even see which days are
 * available.
 *
 * `MoveInDatePicker` is a single fixed month that also prices a pro-rated
 * first month and carries the flexible-dates toggle. A visit window is thirty
 * days and routinely crosses a month boundary, which that grid cannot express
 * at all, and none of its pricing applies.
 *
 * So this is a third grid, and it stays honest about the one thing that
 * matters: it reuses `daysInMonth` from `MoveInDatePicker` rather than
 * carrying its own copy of the date arithmetic.
 *
 * ## The window is the server's
 *
 * `min` and `max` come from `assistedSlot.controller.js` — today, to thirty
 * days out. Every day outside them is drawn but unpickable, rather than
 * omitted: a greyed 31st says "not this far ahead", where a month that simply
 * stops halfway reads as a broken calendar.
 */

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Monday-first index for a JS day number — the convention the other grid uses. */
const mondayIndex = (jsDay: number) => (jsDay + 6) % 7;

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** `YYYY-MM-DD` → `{ y, m }`. Local components throughout — never `toISOString`. */
const monthOf = (value: string) => {
  const [y, m] = value.split('-').map(Number);
  return { y, m: m - 1 };
};

export type VisitCalendarProps = {
  /** `YYYY-MM-DD`, or null until a day is picked. */
  value: string | null;
  onChange: (value: string) => void;
  /** `YYYY-MM-DD`. The first pickable day. */
  min: string;
  /** `YYYY-MM-DD`. The last pickable day. */
  max: string;
};

export function VisitCalendar({ value, onChange, min, max }: VisitCalendarProps) {
  const { colors, space, radius } = useTheme();

  /* Opens on the chosen day's month, or on the first one that has any
     pickable days in it. Never on a month where everything is greyed out. */
  const [cursor, setCursor] = useState(() => monthOf(value ?? min));

  const minMonth = monthOf(min);
  const maxMonth = monthOf(max);

  const atStart = cursor.y === minMonth.y && cursor.m === minMonth.m;
  const atEnd = cursor.y === maxMonth.y && cursor.m === maxMonth.m;

  const step = (delta: number) => {
    const next = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: next.getFullYear(), m: next.getMonth() });
  };

  /*
   * The month, as WEEKS of seven — not one long wrapping list.
   *
   * It was a single flex-wrap row of cells `${100 / 7}%` wide. Seven of those
   * is 99.9999...%, and React Native rounds each one up to a whole device
   * pixel, so seven no longer fit on a line and the SEVENTH wrapped: every
   * Sunday column was empty and every week after the first was shifted a day.
   *
   * Rows of seven with `flex: 1` cells divide the width exactly, whatever it
   * is, and cannot wrap because there is nothing to wrap to. Trailing blanks
   * pad the last week so its cells are the same width as every other row's.
   */
  const weeks = useMemo(() => {
    const lead = mondayIndex(new Date(cursor.y, cursor.m, 1).getDay());
    const total = daysInMonth(cursor.y, cursor.m);
    const cells: (number | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: total }, (unused, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    return Array.from(
      { length: cells.length / 7 },
      (unused, row) => cells.slice(row * 7, row * 7 + 7),
    );
  }, [cursor]);

  const today = useMemo(() => {
    const now = new Date();
    return iso(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.card,
        padding: space[3],
        gap: space[2],
      }}
    >
      {/* The month, and the two ways out of it. An arrow at the edge of the
          window is disabled rather than hidden — a control that vanishes
          reads as a rendering fault. */}
      <View style={styles.head}>
        <Pressable
          onPress={() => step(-1)}
          disabled={atStart}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          accessibilityState={{ disabled: atStart }}
          style={[styles.arrow, { opacity: atStart ? 0.3 : 1 }]}
        >
          <Icon name="chevronLeft" size={20} color={colors.textSecondary} />
        </Pressable>

        <Text variant="bodyStrong">
          {MONTHS[cursor.m]} {cursor.y}
        </Text>

        <Pressable
          onPress={() => step(1)}
          disabled={atEnd}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          accessibilityState={{ disabled: atEnd }}
          style={[styles.arrow, { opacity: atEnd ? 0.3 : 1 }]}
        >
          <Icon name="chevronRight" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((letter, i) => (
          <View key={`${letter}-${i}`} style={styles.cell}>
            <Text variant="caption" color="tertiary">{letter}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, row) => (
        <View key={`week-${cursor.y}-${cursor.m}-${row}`} style={styles.row}>
          {week.map((day, index) => {
            if (day === null) {
              return <View key={`blank-${row}-${index}`} style={styles.cell} />;
            }

            const date = iso(cursor.y, cursor.m, day);
            const outside = date < min || date > max;
            const selected = date === value;
            const isToday = date === today;

            return (
              <Pressable
                key={date}
                onPress={() => onChange(date)}
                disabled={outside}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: outside }}
                accessibilityLabel={new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
                style={({ pressed }) => [styles.cell, { opacity: pressed && !outside ? 0.6 : 1 }]}
              >
                <View
                  style={[
                    styles.day,
                    {
                      borderRadius: radius.pill,
                      backgroundColor: selected ? colors.brand : 'transparent',
                      /* Today gets a ring rather than a fill, so it never
                         competes with the day that was actually chosen. */
                      borderWidth: !selected && isToday ? 1.5 : 0,
                      borderColor: colors.brand,
                    },
                  ]}
                >
                  <Text
                    variant={selected ? 'bodyStrong' : 'body'}
                    style={{
                      color: selected
                        ? colors.onBrand
                        : outside
                          ? colors.textTertiary
                          : colors.textPrimary,
                      opacity: outside ? 0.45 : 1,
                    }}
                  >
                    {day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  /* An exact seventh of whatever width the row gets, with no rounding left
     over to push a cell onto the next line — see `weeks` above. */
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
});
