import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from '@/context/ThemeContext';

/**
 * A date, chosen from the OS calendar rather than typed.
 *
 * ## Why this exists next to `MoveInDatePicker`
 *
 * The app's rule is that there is one calendar and a second one drawn by hand
 * would drift from it. This does not break that rule — it is not a second
 * drawn calendar. `MoveInDatePicker` is a fixed-month grid that also prices a
 * pro-rated first month and carries the flexible-dates toggle; it answers
 * "which day of THIS month do you move in". A hotel check-in and check-out are
 * arbitrary days that routinely cross a month boundary, which that grid cannot
 * express at all.
 *
 * So this hands the job to the platform's own date dialog. Nothing here draws a
 * day grid.
 *
 * ## Typing a date was the bug
 *
 * The field it replaces was a plain `TextInput` with a `YYYY-MM-DD`
 * placeholder, and it accepted anything: `2026-13-45`, a phone number, an empty
 * string that read as "no date" and one space that did not. Asking somebody to
 * type an ISO date on a phone keyboard is asking for a format they have to
 * think about, and then trusting the result. A picker cannot return a date that
 * does not exist.
 *
 * ## Calendar days, not instants
 *
 * The value in and out is `YYYY-MM-DD`, matching every other date in the
 * product. It is built from LOCAL date components rather than by slicing an ISO
 * timestamp: a `Date` is an instant, and `toISOString().slice(0, 10)` on the
 * evening of the 5th in India returns the 5th, while the same call west of
 * Greenwich returns the 6th. Constructing and reading with local components
 * keeps the day the student tapped the day that gets sent.
 */

export type DateFieldProps = {
  /** `YYYY-MM-DD`, or null when nothing is chosen yet. */
  value: string | null;
  onChange: (value: string) => void;
  /** Shown when empty. Says what the field is for, not what to type. */
  placeholder?: string;
  /** `YYYY-MM-DD`. Days before this cannot be picked. */
  minimumDate?: string | null;
  /** `YYYY-MM-DD`. Days after this cannot be picked. */
  maximumDate?: string | null;
  /** Read out by assistive tech — the field has no visible label of its own. */
  accessibilityLabel: string;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/** `YYYY-MM-DD` → a Date at local midnight. Null on anything malformed. */
function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  /* Rejects the dates that do not exist. `new Date(2026, 1, 30)` silently
     becomes 2 March, so the round trip is what catches it. */
  return date.getMonth() === Number(m) - 1 && date.getDate() === Number(d) ? date : null;
}

/** A Date → `YYYY-MM-DD`, read in local time. See the note on the component. */
function formatDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "5 Sep 2026" — how a date is read back, never how it is entered. */
function prettyDay(value: string): string {
  const date = parseDay(value);
  if (!date) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DateField({
  value,
  onChange,
  placeholder = 'Pick a date',
  minimumDate,
  maximumDate,
  accessibilityLabel,
  disabled = false,
  style,
  testID,
}: DateFieldProps) {
  const { colors, space, radius, touch } = useTheme();
  const [open, setOpen] = useState(false);

  const selected = parseDay(value);
  const min = parseDay(minimumDate);
  const max = parseDay(maximumDate);

  /* What the dialog opens ON when nothing is chosen. The earliest allowed day
     rather than today, so a picker bounded to a future window does not open on
     a month where every day is greyed out. */
  const initial = selected ?? min ?? new Date();

  const commit = (next: Date) => {
    onChange(formatDay(next));
  };

  /*
   * Android's picker IS a dialog and reports its own dismissal; iOS's is a view
   * that has to be hosted and confirmed. Handling both here rather than at the
   * call sites is most of the reason this component exists.
   */
  const onAndroidChange = (event: DateTimePickerEvent, next?: Date) => {
    setOpen(false);
    if (event.type === 'set' && next) commit(next);
  };

  const [draft, setDraft] = useState<Date | null>(null);

  return (
    <View style={style}>
      <Pressable
        onPress={() => {
          if (disabled) return;
          setDraft(initial);
          setOpen(true);
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={
          value ? `${accessibilityLabel}, ${prettyDay(value)}. Change.` : accessibilityLabel
        }
        accessibilityState={{ disabled }}
        testID={testID}
        style={[
          styles.field,
          {
            minHeight: touch.min,
            borderRadius: radius.card,
            padding: space[3],
            gap: space[2],
            /* The empty state takes `borderInput`, not the decorative hairline:
               an unanswered control needs 3:1 against its own fill. */
            borderColor: value ? colors.border : colors.borderInput,
            backgroundColor: disabled ? colors.surfaceSunken : colors.surface,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        <Text
          variant={value ? 'bodyStrong' : 'bodyLg'}
          color={value ? 'primary' : 'tertiary'}
          numberOfLines={1}
          style={styles.flex}
        >
          {value ? prettyDay(value) : placeholder}
        </Text>
        <Icon name="calendar" size={20} color={colors.textTertiary} />
      </Pressable>

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={initial}
          mode="date"
          display="calendar"
          onChange={onAndroidChange}
          minimumDate={min ?? undefined}
          maximumDate={max ?? undefined}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <View style={[styles.sheetHost, { backgroundColor: colors.scrim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close" />
            <View
              style={{
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.sheet,
                borderTopRightRadius: radius.sheet,
                padding: space[4],
                gap: space[3],
              }}
            >
              <Text variant="title2">{accessibilityLabel}</Text>
              <DateTimePicker
                value={draft ?? initial}
                mode="date"
                display="inline"
                onChange={(_event, next) => next && setDraft(next)}
                minimumDate={min ?? undefined}
                maximumDate={max ?? undefined}
              />
              {/* iOS's inline picker never commits on its own, so the sheet
                  carries the confirm. Cancel leaves the previous value. */}
              <View style={{ gap: space[2] }}>
                <Button
                  label="Use this date"
                  fullWidth
                  onPress={() => {
                    if (draft) commit(draft);
                    setOpen(false);
                  }}
                />
                <Button label="Cancel" variant="secondary" fullWidth onPress={() => setOpen(false)} />
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  flex: { flex: 1 },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
});
