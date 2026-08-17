import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Input,
  Select,
  Card,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { ROOM_TYPES, type RoomType } from '@/lib/inventory';
import { AADHAR_LENGTH, formatAadhar } from '@/lib/requests';
import { formatDateInput, parseDateInput } from '@/lib/format';
import { formatPhone } from '@/components/ui/PhoneField';
import { ApiError } from '@/services/api/client';
import { fetchCustomer, updateCustomer, type ManualCustomer } from '@/services/api/addCustomer.api';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Correcting a customer record.
 *
 * ## What is not on this screen, and why
 *
 * The phone number, the verification, and the Aadhar photograph. The number is
 * the one a code was sent to and answered — editing it would leave the record
 * claiming a verification it does not have, so a different number is a new
 * record rather than an edit. The photograph and the verified stamp are
 * evidence; a form that could rewrite them would undo the whole reason the
 * create endpoint refuses a client-set `verified` flag.
 *
 * Everything here is a typo somebody can reasonably need to fix: a misheard
 * name, the wrong room, a date a day out, a mistyped Aadhar digit — the
 * photograph is the evidence there, not the digits.
 *
 * The same server-side date bounds the create uses apply again, because a
 * correction is as able to carry a transposed year as the original was.
 */

/** Bounds mirrored from the server, so the message arrives while typing. */
const MAX_BACKDATE_DAYS = 365;
const MAX_FUTURE_DAYS = 730;
const MAX_STAY_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` -> the eight digits the date field holds. */
const toDigits = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}${m[2]}${m[1]}` : '';
};

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function EditCustomerScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [customer, setCustomer] = useState<ManualCustomer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [roomType, setRoomType] = useState<RoomType | null>(null);
  const [checkInDigits, setCheckInDigits] = useState('');
  const [checkOutDigits, setCheckOutDigits] = useState('');
  const [guests, setGuests] = useState('');
  const [address, setAddress] = useState('');
  const [aadhar, setAadhar] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const row = await fetchCustomer(id);
      setCustomer(row);
      setName(row.guestName ?? '');
      setRoomType((ROOM_TYPES as readonly string[]).includes(row.shareType)
        ? (row.shareType as RoomType)
        : null);
      setCheckInDigits(toDigits(row.checkInDate));
      setCheckOutDigits(toDigits(row.checkOutDate));
      setGuests(row.guestsLabel ?? '');
      setAddress(row.kyc?.address ?? '');
      setAadhar((row.kyc?.aadharNumber ?? '').replace(/\D/g, ''));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.displayMessage : 'We could not open that record.');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const checkIn = parseDateInput(checkInDigits);
  const checkOut = parseDateInput(checkOutDigits);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysFromToday = (d: Date) => Math.round((d.getTime() - today.getTime()) / DAY_MS);

  const checkInError = (() => {
    if (checkInDigits.length !== 8) return undefined;
    if (!checkIn) return 'Not a real date.';
    const offset = daysFromToday(checkIn);
    if (offset < -MAX_BACKDATE_DAYS) return 'More than a year ago — check the year.';
    if (offset > MAX_FUTURE_DAYS) return 'More than two years away — check the year.';
    return undefined;
  })();

  const checkOutError = (() => {
    if (checkOutDigits.length !== 8) return undefined;
    if (!checkOut) return 'Not a real date.';
    if (!checkIn) return undefined;
    if (checkOut.getTime() <= checkIn.getTime()) return 'Must be after check-in.';
    if (Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS) > MAX_STAY_DAYS) {
      return 'Longer than a year — check the year.';
    }
    return undefined;
  })();

  const canSave =
    Boolean(customer) &&
    name.trim().length > 0 &&
    roomType !== null &&
    Boolean(checkIn) &&
    Boolean(checkOut) &&
    !checkInError &&
    !checkOutError &&
    guests.trim().length > 0 &&
    address.trim().length > 0 &&
    aadhar.length === AADHAR_LENGTH &&
    !saving;

  const save = async () => {
    if (!canSave || !id || !roomType || !checkIn || !checkOut) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateCustomer(id, {
        guestName: name.trim(),
        shareType: roomType,
        checkInDate: isoDay(checkIn),
        checkOutDate: isoDay(checkOut),
        guestsLabel: guests.trim(),
        address: address.trim(),
        aadharNumber: aadhar,
      });
      router.back();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.displayMessage : 'We could not save that.');
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <>
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>
      <Text variant="screenTitle">Edit customer</Text>
    </>
  );

  if (loadError) {
    return (
      <Screen stickyHeader={header} background="bg">
        <ErrorState title="We could not open this" body={loadError} onRetry={load} />
      </Screen>
    );
  }

  if (!customer) {
    return (
      <Screen stickyHeader={header} background="bg" contentStyle={styles.stack}>
        <Skeleton width="100%" height={64} radius={12} />
        <Skeleton width="100%" height={64} radius={12} />
        <Skeleton width="100%" height={64} radius={12} />
      </Screen>
    );
  }

  const phone = customer.guestPhone.replace(/\D/g, '').slice(-10);

  return (
    <Screen
      stickyHeader={header}
      background="bg"
      contentStyle={styles.stack}
      footer={
        <Button
          label={saving ? 'Saving…' : 'Save changes'}
          onPress={save}
          loading={saving}
          disabled={!canSave}
        />
      }
    >
      {/* Read-only, with the reason attached rather than a field that quietly
          refuses to save. */}
      <Card style={styles.lockedCard}>
        <Text variant="caption" color="textTertiary">
          Mobile number
        </Text>
        <Text style={[styles.lockedValue, { color: c.textPrimary }]}>+91 {formatPhone(phone)}</Text>
        <Text variant="caption" color="textSecondary" style={styles.lockedNote}>
          This is the number the guest verified with a code, so it cannot be edited here. A
          different number needs a new record.
        </Text>
      </Card>

      <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
        Guest details
      </Text>
      <Input
        label="Full name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        containerStyle={styles.field}
      />

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
        multiline
        minHeight={80}
        containerStyle={styles.field}
      />
      <Input
        label="Aadhar number"
        value={formatAadhar(aadhar)}
        onChangeText={(t) => setAadhar(t.replace(/\D/g, '').slice(0, AADHAR_LENGTH))}
        keyboardType="number-pad"
        maxLength={14}
        containerStyle={styles.field}
      />
      <Text variant="caption" color="textTertiary" style={styles.docNote}>
        The Aadhar photograph on file cannot be replaced here — it is the evidence behind the
        verification. Delete the record and add the guest again if it is wrong.
      </Text>

      {saveError ? (
        <Text variant="badge" color="error" style={styles.saveError}>
          {saveError}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 0 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 2 },
  lockedCard: { padding: 14, gap: 4, marginTop: 6, marginBottom: 6 },
  lockedValue: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  lockedNote: { lineHeight: 18, marginTop: 4 },
  sectionLabel: { marginTop: 10, marginBottom: 10 },
  field: { marginBottom: 16 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1, marginBottom: 16 },
  docNote: { lineHeight: 17, marginTop: -4 },
  saveError: { marginTop: 12 },
});
