/* ══════════════════════════════════════════════════════════════════════════
   Adding an address, and correcting one.

   ONE screen for both. `addressId` in the params is the whole difference: with
   it the form loads what is there and PATCHes; without it, it POSTs. Two
   screens would be two copies of the same eight fields, and the first
   divergence between them is always the field somebody added to the "add"
   form and forgot on the "edit" one.

   ## What is required, and what only looks it

   `line1` — and nothing else. Not the pincode, not the city, not a pin. A
   hostel address given as "Block C, Room 214" with no pincode is a complete
   address to the person who lives there and to the rider who delivers to it,
   and a form that refuses it is a form that loses the order. The server holds
   the same line: a pincode that is PRESENT and malformed is refused, an absent
   one is fine.

   ## The instructions field earns its place

   "Ring the bell twice, door left of the stairs." It is the single most useful
   thing on a delivery and the field most address forms leave out. It is given
   its own label and its own hint rather than being folded into line 2.

   ## The same address cannot be saved twice

   Somebody who taps Save, does not see the list update, and taps again ends up
   with two identical rows and a checkout that asks them to choose between
   them. The book is compared before a write — on the fields that identify a
   PLACE rather than on every field, so re-saving with a corrected pincode is
   still an edit and not a rejection. See `sameAddress`.

   ## The form scrolls above the keyboard

   It was a plain `ScrollView`, which does nothing when the keyboard opens:
   "Delivery instructions" is the last of eight fields and sat underneath it,
   typed into blind. `KeyboardAwareScrollViewCompat` is the app's answer to
   exactly this, and every other form in the app already used it.
   ══════════════════════════════════════════════════════════════════════════ */
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text, TextField } from '@/components/ui';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { StandardHeader } from '@/components/shell';
import { queryKeys } from '@/services';
import { useTheme } from '@/context/ThemeContext';
import {
  addAddress,
  fetchAddresses,
  updateAddress,
  type AddressInput,
  type AddressKind,
  type SavedAddress,
} from '@/services/api/addresses.api';
import { LocationRefused, locateMe } from '@/services/location/useMyLocation';

/**
 * Two strings that name the same thing.
 *
 * Case and surrounding whitespace are noise — "block c" and "Block C " are one
 * address — and so is internal spacing, because a phone keyboard produces
 * double spaces without anybody meaning them. Punctuation is left alone: "Flat
 * 3-B" and "Flat 3B" are close enough that treating them as identical would
 * start refusing addresses that are genuinely different.
 */
const norm = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Is this the same PLACE as one already in the book?
 *
 * Compared on the four fields that identify a location — the two address
 * lines, the city and the pincode — and deliberately not on `label`, `kind`,
 * `landmark` or `instructions`. Those are how somebody DESCRIBES a place, and
 * two rows differing only in what they are nicknamed are still one address:
 * refusing to notice that is exactly the duplicate this is here to stop.
 *
 * The consequence in the other direction is the point of leaving them out too:
 * saving "Block C, Room 214" twice under two labels is refused, but correcting
 * the pincode on an existing row is an edit, not a duplicate, because the edit
 * path excludes the row being edited by id.
 */
const sameAddress = (a: AddressInput, b: SavedAddress): boolean =>
  norm(a.line1 ?? '') === norm(b.line1)
  && norm(a.line2 ?? '') === norm(b.line2)
  && norm(a.city ?? '') === norm(b.city)
  && norm(a.pincode ?? '') === norm(b.pincode);

const KINDS: { id: AddressKind; label: string }[] = [
  { id: 'room', label: 'Room' },
  { id: 'hostel', label: 'Hostel' },
  { id: 'home', label: 'Home' },
  { id: 'work', label: 'Work' },
  { id: 'gate', label: 'Gate' },
  { id: 'other', label: 'Other' },
];

export default function EditAddressScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addressId } = useLocalSearchParams<{ addressId?: string }>();
  const editing = !!addressId;
  const client = useQueryClient();

  const [kind, setKind] = useState<AddressKind>('room');
  const [label, setLabel] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [instructions, setInstructions] = useState('');

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /*
    The pin, and the crosshair that fetches it.

    Held separately from the text fields because the two come apart: a fix
    always yields coordinates, and reverse geocoding is the half that can
    return nothing. An address saved with a pin and no street is more useful to
    a rider than one with a street and no pin, so the pin is kept whatever the
    geocoder said.

    `undefined` means "leave whatever is stored alone" — an edit that does not
    touch the crosshair must not clear a pin captured last week.
  */
  const [pin, setPin] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');

  const useMyLocation = async () => {
    setError('');
    setNotice('');
    setLocating(true);
    try {
      const found = await locateMe();
      setPin(found.location);

      /* Only fills a box the geocoder actually named, and only one that is
         still empty — a person who has typed their flat number does not want
         it replaced by the street the phone thinks it is on. */
      const fill = (current: string, next: string) => (current.trim() ? current : next);
      setLine1((v) => fill(v, found.fields.line1));
      setLandmark((v) => fill(v, found.fields.landmark));
      setCity((v) => fill(v, found.fields.city));
      setPincode((v) => fill(v, found.fields.pincode));

      setNotice(
        found.namedNothing
          ? 'Pin saved. We could not name this spot — type the address and the pin will still guide the rider.'
          : 'Filled from your location. Check it, and add your flat or room number.',
      );
    } catch (err) {
      setError(
        err instanceof LocationRefused
          ? err.message
          : (err as Error)?.message || 'We could not get your location.',
      );
    } finally {
      setLocating(false);
    }
  };

  /* The book is fetched and the one being edited picked out of it, rather than
     a read-one endpoint: the list call is already cheap and cached-shaped, and
     adding a route for a screen that always arrives from the list would be a
     second way to get the same object. */
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    fetchAddresses()
      .then((rows) => {
        if (cancelled) return;
        const found = rows.find((a) => a.addressId === addressId);
        if (!found) {
          setError('That address is no longer saved.');
          return;
        }
        setKind(found.kind);
        setLabel(found.label);
        setLine1(found.line1);
        setLine2(found.line2);
        setLandmark(found.landmark);
        setCity(found.city);
        setPincode(found.pincode);
        setInstructions(found.instructions);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error)?.message || 'We could not load that address.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, addressId]);

  const save = async () => {
    if (!line1.trim()) {
      setError('The first line of the address is needed.');
      return;
    }
    setError('');
    setSaving(true);

    const input: AddressInput = {
      kind,
      label: label.trim(),
      line1: line1.trim(),
      line2: line2.trim(),
      landmark: landmark.trim(),
      city: city.trim(),
      pincode: pincode.trim(),
      instructions: instructions.trim(),
      /* Omitted when the crosshair was not used, so an edit cannot silently
         drop a pin captured earlier. */
      ...(pin ? { location: pin } : null),
    };

    try {
      /*
       * The book as it is right now, not as it was when this screen opened.
       *
       * Fetched at save rather than held from mount because the duplicate
       * being guarded against is often one this same person added seconds ago
       * on another device — or on this one, by tapping Save twice. A list read
       * at mount cannot see either.
       *
       * A failed check does not block the save. If the book cannot be read,
       * the honest thing is to let the write through: refusing to save
       * somebody's address because a GET failed is a worse outcome than a
       * duplicate row, and the server is the one that owns the book anyway.
       */
      let existing: SavedAddress[] = [];
      try {
        existing = await fetchAddresses();
      } catch {
        existing = [];
      }

      const clash = existing.find(
        (row) => row.addressId !== addressId && sameAddress(input, row),
      );
      if (clash) {
        setError(
          `You have already saved this address as “${clash.label?.trim() || clash.line1}”. `
          + 'Edit that one instead, or change something here to tell them apart.',
        );
        setSaving(false);
        return;
      }

      const book = editing ? await updateAddress(addressId!, input) : await addAddress(input);
      /* The Profile row's count reads this key. Publishing the server's own
         response means going back does not show a stale number. */
      client.setQueryData(queryKeys.addresses, book);
      router.back();
    } catch (err) {
      /* The SERVER's sentence. It knows things this form does not — that the
         book is full, that a pincode is not a real one — and paraphrasing
         those into "something went wrong" throws away the one line that says
         what to do next. */
      setError((err as Error)?.message || 'That did not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title={editing ? 'Edit address' : 'Add an address'}
        onBack={() => router.back()}
      />

      {/*
        Keyboard-aware, so the last fields are reachable while typing.

        `paddingBottom` is deliberately generous — the scroller lifts the
        FOCUSED field above the keyboard, and the field being focused here is
        often the last one on the form. Without room below it there is nothing
        to scroll into, so the lift has nowhere to go and the field stays
        under the keys. Three times the base step clears a keyboard plus the
        helper line `TextField` draws underneath an input.
      */}
      <KeyboardAwareScrollViewCompat
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: layout.gutter,
          paddingBottom: space[8] * 3,
          gap: space[4],
        }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text variant="body" color="tertiary">
            Loading…
          </Text>
        ) : (
          <>
            <View style={{ gap: space[2] }}>
              <Text variant="numMeta" color="tertiary">
                WHAT KIND OF PLACE
              </Text>
              <View style={[styles.kinds, { gap: space[2] }]}>
                {KINDS.map((option) => {
                  const on = option.id === kind;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => setKind(option.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={[
                        styles.kind,
                        {
                          borderRadius: radius.pill ?? 999,
                          paddingHorizontal: space[3],
                          borderColor: on ? colors.brand : colors.border,
                          backgroundColor: on ? colors.brandTint : colors.surface,
                        },
                      ]}
                    >
                      <Text variant="bodyStrong" style={{ color: on ? colors.brand : colors.textSecondary }}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* The crosshair. Above the fields rather than beside one of them:
                it fills SEVERAL, so attaching it to any single box would
                misdescribe what it does. */}
            <Pressable
              onPress={useMyLocation}
              disabled={locating}
              accessibilityRole="button"
              accessibilityLabel="Use my current location"
              style={[
                styles.locate,
                {
                  borderColor: colors.brand,
                  backgroundColor: colors.brandTint,
                  borderRadius: radius.card,
                  paddingVertical: space[3],
                  paddingHorizontal: space[4],
                  gap: space[2],
                },
              ]}
            >
              <Icon name="crosshair" size={20} color={colors.brand} />
              <Text variant="bodyStrong" style={{ color: colors.brand }}>
                {locating ? 'Finding you…' : 'Use my current location'}
              </Text>
            </Pressable>

            {!!notice && (
              <Text variant="caption" color="tertiary">
                {notice}
              </Text>
            )}

            <TextField
              label="Name it"
              value={label}
              onChangeText={setLabel}
              placeholder="Home, Block C, Mum's place"
            />
            <TextField
              label="Address line 1"
              value={line1}
              onChangeText={setLine1}
              placeholder="Block C, Room 214"
            />
            <TextField
              label="Address line 2"
              value={line2}
              onChangeText={setLine2}
              placeholder="Building, street"
            />
            <TextField
              label="Landmark"
              value={landmark}
              onChangeText={setLandmark}
              placeholder="Opposite the mess"
            />
            <TextField
              label="City"
              value={city}
              onChangeText={setCity}
              placeholder="Rajahmundry"
            />
            <TextField
              label="Pincode"
              value={pincode}
              onChangeText={setPincode}
              placeholder="533101"
              keyboardType="number-pad"
              maxLength={6}
            />
            <TextField
              label="Delivery instructions"
              value={instructions}
              onChangeText={setInstructions}
              placeholder="Ring the bell twice, door left of the stairs"
            />

            {!!error && (
              <Text variant="body" style={{ color: colors.danger.ink }}>
                {error}
              </Text>
            )}

            <Button
              label={saving ? 'Saving…' : editing ? 'Save changes' : 'Save address'}
              fullWidth
              disabled={saving}
              onPress={save}
            />

            <Text variant="caption" color="tertiary">
              Only the first line is required. Everything else helps the rider find you.
            </Text>
          </>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  locate: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap' },
  kind: { height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
});
