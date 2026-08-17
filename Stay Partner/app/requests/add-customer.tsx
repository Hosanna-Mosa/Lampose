import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Input,
  PhoneField,
  PHONE_LENGTH,
  Select,
  AadharUploadTile,
  VerificationCodeField,
} from '@/components/ui';
import { ROOM_TYPES, type RoomType } from '@/lib/inventory';
import { AADHAR_LENGTH, formatAadhar } from '@/lib/requests';
import { formatDateInput, parseDateInput } from '@/lib/format';
import { ApiError } from '@/services/api/client';
import { createBooking, type KycImage } from '@/services/api/addCustomer.api';

/**
 * Reached from Requests → Approved, for a guest the owner already knows —
 * a walk-in, a phone booking, someone from before this app existed — who
 * never went through a request. Saving drops them straight into the same
 * Approved list an accepted request lands in, with the same KYC shape, so
 * there's one records list, not two.
 *
 * Always the manual-entry form: a record added by hand has no LAMPOSE
 * account to read KYC from, so `fromApp` is always false here.
 */
export default function AddCustomerScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [roomType, setRoomType] = useState<RoomType | null>(null);
  const [checkInDigits, setCheckInDigits] = useState('');
  const [checkOutDigits, setCheckOutDigits] = useState('');
  const [guests, setGuests] = useState('');
  const [address, setAddress] = useState('');
  const [aadhar, setAadhar] = useState('');
  /* Cloudinary results, not a boolean. The old `uploaded` flag was a tick the
     owner set by tapping a dashed box, and the record simply asserted it. */
  const [aadharImages, setAadharImages] = useState<KycImage[]>([]);
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkIn = parseDateInput(checkInDigits);
  const checkOut = parseDateInput(checkOutDigits);

  /*
   * A calendar-valid date is not the same as a plausible one.
   *
   * `parseDateInput` is already strict about the calendar — it rejects 31/02,
   * 29/02 in a non-leap year, month 13, day 00. What it cannot judge is the
   * YEAR, and that is where the typo people actually make lives: 2062 for
   * 2026 is an ordinary-looking date thirty-six years out, and it used to save
   * without a murmur.
   *
   * The same bounds are enforced server-side, which is the real check — these
   * exist so the owner is told while they are still looking at the field
   * rather than after pressing Save with a guest waiting.
   */
  const MAX_BACKDATE_DAYS = 365;
  const MAX_FUTURE_DAYS = 730;
  const MAX_STAY_DAYS = 365;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysFromToday = (d: Date) => Math.round((d.getTime() - today.getTime()) / DAY_MS);

  const checkInError = (() => {
    if (checkInDigits.length !== 8) return undefined;
    if (!checkIn) return 'Not a real date.';
    const offset = daysFromToday(checkIn);
    /* Backdating is allowed a year: logging a walk-in late is ordinary. */
    if (offset < -MAX_BACKDATE_DAYS) return 'More than a year ago — check the year.';
    if (offset > MAX_FUTURE_DAYS) return 'More than two years away — check the year.';
    return undefined;
  })();

  const checkOutError = (() => {
    if (checkOutDigits.length !== 8) return undefined;
    if (!checkOut) return 'Not a real date.';
    if (!checkIn) return undefined;
    if (checkOut.getTime() <= checkIn.getTime()) return 'Must be after check-in.';
    const stay = Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS);
    if (stay > MAX_STAY_DAYS) return 'Longer than a year — check the year.';
    return undefined;
  })();

  /* One flag for the save gate, so a bounds failure blocks it exactly as a
     malformed date does. */
  const datesInvalid = Boolean(checkInError || checkOutError);

  const canSave =
    name.trim().length > 0 &&
    phone.length === PHONE_LENGTH &&
    roomType !== null &&
    Boolean(checkIn) &&
    Boolean(checkOut) &&
    !datesInvalid &&
    guests.trim().length > 0 &&
    address.trim().length > 0 &&
    aadhar.length === AADHAR_LENGTH &&
    aadharImages.length > 0 &&
    verified &&
    !saving;

  /** `YYYY-MM-DD` — date-only, so no timezone can shift a check-in by a day. */
  const isoDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /**
   * Saves to the database.
   *
   * This used to call `addCustomer` from `lib/requests`, which pushed onto a
   * fixture array in memory — the row appeared in the Approved list and was
   * gone on the next launch, along with the Aadhar number and the address
   * somebody had just read out.
   *
   * Nothing is optimistic. The record carries identity documents and a
   * verified phone number, and an owner who believes a walk-in is logged when
   * it is not is how a guest is turned away at the door.
   */
  const save = async () => {
    if (!canSave || !roomType || !checkIn || !checkOut) return;
    setSaving(true);
    setError(null);
    try {
      await createBooking({
        guestName: name.trim(),
        guestPhone: `+91${phone}`,
        shareType: roomType,
        checkInDate: isoDay(checkIn),
        checkOutDate: isoDay(checkOut),
        guestsLabel: guests.trim(),
        address: address.trim(),
        aadharNumber: aadhar,
        aadharImages,
      });
      /*
       * Into Customers, not back where they came from.
       *
       * `back()` returned to the Requests inbox, which does not show this
       * record — so a form that had just succeeded looked like it had done
       * nothing. `replace` rather than `push` so Back from Customers does not
       * reopen a filled-in form that has already been saved.
       */
      router.replace('/customers');
    } catch (err) {
      /* The server's own sentence: it is the only thing that knows whether the
         verification had expired or an image URL was refused. */
      setError(err instanceof ApiError ? err.displayMessage : 'We could not save that.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      padX={22}
            contentStyle={styles.stack}
            footer={<Button label={saving ? 'Saving…' : 'Save customer'} onPress={save} loading={saving} disabled={!canSave} />}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>
        </>
      }
    >

      <Text variant="pageTitleSm" style={styles.title}>
        Add customer
      </Text>
      <Text variant="bodySm" color="textSecondary" style={styles.intro}>
        Log a guest you already know — a walk-in, a phone booking, anyone who didn&apos;t come through a
        request — straight into your records.
      </Text>

      <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
        Guest details
      </Text>
      <Input
        label="Full name"
        value={name}
        onChangeText={setName}
        placeholder="Guest's full name"
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        containerStyle={styles.field}
      />
      <View style={styles.field}>
        <PhoneField value={phone} onChangeText={setPhone} />
      </View>

      <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
        Stay details
      </Text>
      <View style={styles.field}>
        <Select
          label="Room type"
          options={ROOM_TYPES}
          value={roomType}
          onChange={setRoomType}
          placeholder="Select a room type"
        />
      </View>
      <View style={styles.row}>
        <Input
          label="Check-in"
          value={formatDateInput(checkInDigits)}
          onChangeText={(t) => setCheckInDigits(t.replace(/\D/g, '').slice(0, 8))}
          placeholder="DD/MM/YYYY"
          keyboardType="number-pad"
          maxLength={10}
          error={checkInError}
          containerStyle={styles.half}
        />
        <Input
          label="Check-out"
          value={formatDateInput(checkOutDigits)}
          onChangeText={(t) => setCheckOutDigits(t.replace(/\D/g, '').slice(0, 8))}
          placeholder="DD/MM/YYYY"
          keyboardType="number-pad"
          maxLength={10}
          error={checkOutError}
          containerStyle={styles.half}
        />
      </View>
      <Input
        label="Guests"
        value={guests}
        onChangeText={setGuests}
        placeholder="e.g. 2 adults"
        containerStyle={styles.field}
      />

      <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
        KYC
      </Text>
      <Input
        label="Address"
        value={address}
        onChangeText={setAddress}
        placeholder="House no., street, area, city, state"
        multiline
        minHeight={80}
        containerStyle={styles.field}
      />
      <Input
        label="Aadhar number"
        value={formatAadhar(aadhar)}
        onChangeText={(t) => setAadhar(t.replace(/\D/g, '').slice(0, AADHAR_LENGTH))}
        placeholder="1234 5678 9012"
        keyboardType="number-pad"
        maxLength={14}
        containerStyle={styles.field}
      />
      <View style={styles.field}>
        <AadharUploadTile images={aadharImages} onChange={setAadharImages} />
      </View>

      <VerificationCodeField phone={phone} verified={verified} onVerifiedChange={setVerified} />

      {error ? (
        <Text variant="badge" color="error" style={styles.saveError}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 2 },
  title: { marginBottom: 4 },
  intro: { marginBottom: 18, lineHeight: 19 },
  sectionLabel: { marginTop: 4, marginBottom: 10 },
  field: { marginBottom: 16 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1, marginBottom: 16 },
  saveError: { marginTop: 12 },
});
