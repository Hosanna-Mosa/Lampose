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
import { AADHAR_LENGTH, addCustomer, formatAadhar, type KYC } from '@/lib/requests';
import { formatDateInput, parseDateInput } from '@/lib/format';

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
  const [uploaded, setUploaded] = useState(false);
  const [verified, setVerified] = useState(false);

  const checkIn = parseDateInput(checkInDigits);
  const checkOut = parseDateInput(checkOutDigits);
  const rangeInvalid = Boolean(checkIn && checkOut && checkOut.getTime() <= checkIn.getTime());

  const checkInError = checkInDigits.length === 8 && !checkIn ? 'Enter a valid date.' : undefined;
  const checkOutError =
    checkOutDigits.length === 8 && !checkOut
      ? 'Enter a valid date.'
      : rangeInvalid
        ? 'Must be after check-in.'
        : undefined;

  const canSave =
    name.trim().length > 0 &&
    phone.length === PHONE_LENGTH &&
    roomType !== null &&
    Boolean(checkIn) &&
    Boolean(checkOut) &&
    !rangeInvalid &&
    guests.trim().length > 0 &&
    address.trim().length > 0 &&
    aadhar.length === AADHAR_LENGTH &&
    uploaded &&
    verified;

  const save = () => {
    if (!canSave || !roomType || !checkIn || !checkOut) return;
    const kyc: KYC = { address: address.trim(), aadharNumber: aadhar, aadharUploaded: uploaded, verified };
    addCustomer({
      guest: name.trim(),
      phone,
      roomType,
      checkIn,
      checkOut,
      guests: guests.trim(),
      kyc,
    });
    router.back();
  };

  return (
    <Screen
      padX={22}
      contentStyle={styles.stack}
      footer={<Button label="Save customer" onPress={save} disabled={!canSave} />}
    >
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

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
        <AadharUploadTile uploaded={uploaded} onToggle={() => setUploaded((u) => !u)} />
      </View>

      <VerificationCodeField phone={phone} verified={verified} onVerifiedChange={setVerified} />
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
});
