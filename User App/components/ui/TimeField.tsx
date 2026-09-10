import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';
import { useTheme } from '@/context/ThemeContext';

/**
 * A time, chosen from the OS clock rather than from a shelf of ours.
 *
 * ## Why this exists next to `DateField`
 *
 * Same shape, same platform split, different mode — and the same reason for
 * existing: Android's picker IS a dialog and reports its own dismissal, iOS's
 * is a view that has to be hosted and confirmed. Handling that once here is
 * most of what this component is.
 *
 * ## The window is enforced, the time inside it is not chosen for you
 *
 * `assistedSlot.controller.js` validates the HOUR RANGE and nothing else: any
 * `HH:MM` between the opening and closing hour is accepted. The eight times
 * the WhatsApp flow lists are that channel's menu — a list has to have rows —
 * and were never a rule the app had to copy. So this asks for a time, clamps
 * it to the window, and says what the window is rather than pretending 3:31 pm
 * is impossible.
 *
 * `minTime` exists because a slot that has already passed today cannot be
 * kept. It is only ever set for today, by the caller.
 */

export type TimeFieldProps = {
  /** `HH:MM` in 24-hour form, or null until a time is chosen. */
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Inclusive opening hour, 0–23. */
  minHour: number;
  /** Inclusive closing hour, 0–23. Minutes past it are refused. */
  maxHour: number;
  /** `HH:MM`. Earlier times are pulled forward to it — for today's leftovers. */
  minTime?: string | null;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: ViewStyle;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** `HH:MM` → minutes since midnight. `null` on anything malformed. */
export function minutesOf(value: string | null | undefined): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ''));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** "3:30 PM" — how a time is read back, never how it is entered. */
export function prettyTime(value: string): string {
  const total = minutesOf(value);
  if (total === null) return value;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

export function TimeField({
  value,
  onChange,
  placeholder = 'Pick a time',
  minHour,
  maxHour,
  minTime = null,
  accessibilityLabel,
  disabled = false,
  style,
}: TimeFieldProps) {
  const { colors, space, radius, touch } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date | null>(null);

  const floor = Math.max(minHour * 60, minutesOf(minTime) ?? 0);
  const ceiling = maxHour * 60;

  /* What the clock opens on. The chosen time, or the first minute anybody
     could actually pick — never midnight, which is outside the window and
     makes the picker look broken before it is touched. */
  const openOn = (() => {
    const at = minutesOf(value) ?? floor;
    const clamped = Math.min(Math.max(at, floor), ceiling);
    const d = new Date();
    d.setHours(Math.floor(clamped / 60), clamped % 60, 0, 0);
    return d;
  })();

  /*
   * Clamped rather than refused.
   *
   * Android's clock does not take bounds, so somebody can always land on
   * 6 AM. Snapping it to the nearest end of the window and showing the result
   * is kinder than an error about a rule they could not see while choosing —
   * and the caption under the field states the window either way.
   */
  const commit = (next: Date) => {
    const asked = next.getHours() * 60 + next.getMinutes();
    const clamped = Math.min(Math.max(asked, floor), ceiling);
    onChange(`${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`);
  };

  const onAndroidChange = (event: DateTimePickerEvent, next?: Date) => {
    setOpen(false);
    if (event.type === 'set' && next) commit(next);
  };

  return (
    <View style={style}>
      <Pressable
        onPress={() => {
          if (disabled) return;
          setDraft(openOn);
          setOpen(true);
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={
          value ? `${accessibilityLabel}, ${prettyTime(value)}. Change.` : accessibilityLabel
        }
        accessibilityState={{ disabled }}
        style={[
          styles.field,
          {
            minHeight: touch.min,
            borderRadius: radius.card,
            padding: space[3],
            gap: space[2],
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
          {value ? prettyTime(value) : placeholder}
        </Text>
        <Icon name="clock" size={20} color={colors.textTertiary} />
      </Pressable>

      {open && Platform.OS === 'android' ? (
        <DateTimePicker value={openOn} mode="time" display="clock" onChange={onAndroidChange} />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <View style={[styles.sheetHost, { backgroundColor: colors.scrim }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setOpen(false)}
              accessibilityLabel="Close"
            />
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
                value={draft ?? openOn}
                mode="time"
                display="spinner"
                onChange={(unused, next) => next && setDraft(next)}
              />
              <View style={{ gap: space[2] }}>
                <Button
                  label="Use this time"
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
  flex: { flex: 1 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
});
