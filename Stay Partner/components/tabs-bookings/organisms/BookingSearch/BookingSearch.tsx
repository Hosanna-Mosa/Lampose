import { useRef } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { Box, Icon, Tappable } from '@/components/common';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import type { Booking } from '@/lib/bookings';
import type { BackendPartnerRequest } from '@/services/api/types';

/**
 * The search box above the bookings list.
 *
 * It narrows rows the screen has ALREADY fetched rather than asking the server:
 * `loadBookings` has every status for the chosen category on the phone, and an
 * owner searching for "Ravi" at the door is on the mobile data a reception
 * desk has, where a request per keystroke is the slowest possible answer.
 */
export function BookingSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const c = useColors();
  const input = useRef<TextInput>(null);

  return (
    <Box
      style={[styles.field, { backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle }]}
    >
      <Icon name="search" size={18} color={c.textTertiary} />
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChange}
        placeholder="Search guest, phone or room"
        placeholderTextColor={c.textTertiary}
        style={[styles.input, { color: c.textPrimary }]}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel="Search bookings"
      />
      {/* The clear control is the field's trailing edge: a full-height square
          tap zone flush against the right side, mirroring the search glyph on
          the left, so it reads as part of the box rather than a dot floating
          inside the text. */}
      {value ? (
        <Tappable
          onPress={() => {
            onChange('');
            input.current?.focus();
          }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={({ pressed }) => [styles.clear, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Box style={[styles.clearDisc, { backgroundColor: c.textTertiary }]}>
            <Icon name="close" size={12} color={c.surface} strokeWidth={2.5} />
          </Box>
        </Tappable>
      ) : null}
    </Box>
  );
}

/** Lower-cased and trimmed; '' means "no search". */
export const normaliseQuery = (raw: string): string => raw.trim().toLowerCase();

const digitsOf = (s: string | undefined | null): string => (s ?? '').replace(/\D/g, '');

/*
 * A phone number is matched on its DIGITS, both sides. The owner types
 * "98765" and the row stores "+91 98765 43210"; a plain substring test on the
 * raw strings would miss it on the space. Only runs when the query has at
 * least three digits, so "2" does not match every number in the book.
 */
const phoneMatches = (phone: string | undefined | null, q: string): boolean => {
  const qDigits = digitsOf(q);
  return qDigits.length >= 3 && digitsOf(phone).includes(qDigits);
};

const textMatches = (fields: (string | null | undefined)[], q: string): boolean =>
  fields.some((f) => !!f && f.toLowerCase().includes(q));

export const bookingMatches = (b: Booking, q: string): boolean =>
  !q
  || textMatches([b.guest, b.guestEmail, b.roomType, b.guests, b.id], q)
  || phoneMatches(b.guestPhone, q);

export const requestMatches = (r: BackendPartnerRequest, q: string): boolean =>
  !q
  || textMatches(
    [r.customer?.name, r.customer?.email, r.propertyName, r.sharing?.label ?? null, r.id],
    q,
  )
  || phoneMatches(r.customer?.phone, q);

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingLeft: 12,
    /* No right padding: the clear button's own square supplies it, so its
       glyph lands the same distance from the edge as the search glyph. */
    paddingRight: 0,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    fontFamily: fonts.medium,
    fontSize: 15,
    /* Android pads a TextInput's text on its own, which sat the words lower
       than the two glyphs beside them. */
    paddingVertical: 0,
    paddingRight: 12,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  clear: {
    width: 40,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearDisc: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
