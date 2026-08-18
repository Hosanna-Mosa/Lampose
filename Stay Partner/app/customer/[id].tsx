import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Input,
  Card,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { DocumentsChecklist, type DocumentEntry } from '@/components/DocumentsChecklist';
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
 * The phone number, the verification, and the category. The number is the
 * one a code was sent to and answered — editing it would leave the record
 * claiming a verification it does not have, so a different number is a new
 * record rather than an edit. The verified stamp is evidence; a form that
 * could rewrite it would undo the whole reason the create endpoint refuses a
 * client-set `verified` flag. The category is the property's own fact, set
 * once at onboarding — there is nothing about it to correct per guest.
 *
 * The documents checklist IS editable here, unlike the Aadhar photograph it
 * replaced: it is a running note of what the owner has seen, not evidence
 * like `verifiedAt` is, so adding a document later or fixing a mistaken tick
 * is exactly what this screen is for.
 *
 * No Check-out or Guests fields, matching Add Customer — a stay is
 * open-ended at move-in, and Guests was a free-text count. A record from
 * before that change keeps whatever it already has; this screen just never
 * asks for either.
 *
 * The same server-side date bounds the create uses apply again, because a
 * correction is as able to carry a transposed year as the original was.
 */

/** Bounds mirrored from the server, so the message arrives while typing. */
const MAX_BACKDATE_DAYS = 365;
const MAX_FUTURE_DAYS = 730;
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
  const [checkInDigits, setCheckInDigits] = useState('');
  const [address, setAddress] = useState('');
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const row = await fetchCustomer(id);
      setCustomer(row);
      setName(row.guestName ?? '');
      setCheckInDigits(toDigits(row.checkInDate));
      setAddress(row.kyc?.address ?? '');
      setDocuments(Array.isArray(row.kyc?.documents) ? row.kyc.documents : []);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.displayMessage : 'We could not open that record.');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const checkIn = parseDateInput(checkInDigits);

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

  const documentCollected = documents.some((d) => d.collected);

  const canSave =
    Boolean(customer) &&
    name.trim().length > 0 &&
    Boolean(checkIn) &&
    !checkInError &&
    address.trim().length > 0 &&
    documentCollected &&
    !saving;

  const save = async () => {
    if (!canSave || !id || !checkIn) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateCustomer(id, {
        guestName: name.trim(),
        checkInDate: isoDay(checkIn),
        address: address.trim(),
        documents,
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

      {customer.shareType ? (
        <Card style={styles.lockedCard}>
          <Text variant="caption" color="textTertiary">
            Category
          </Text>
          <Text style={[styles.lockedValue, { color: c.textPrimary }]}>{customer.shareType}</Text>
        </Card>
      ) : null}

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
      <Input
        label="Check-in"
        value={formatDateInput(checkInDigits)}
        onChangeText={(t) => setCheckInDigits(t.replace(/\D/g, '').slice(0, 8))}
        placeholder="DD/MM/YYYY"
        keyboardType="number-pad"
        maxLength={10}
        error={checkInError}
        containerStyle={styles.field}
      />

      <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
        Address
      </Text>
      <Input
        value={address}
        onChangeText={setAddress}
        multiline
        minHeight={80}
        containerStyle={styles.field}
      />

      <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
        Documents
      </Text>
      <View style={styles.field}>
        <DocumentsChecklist documents={documents} onChange={setDocuments} />
      </View>

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
  saveError: { marginTop: 12 },
});
