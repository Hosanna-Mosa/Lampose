import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Icon,
} from '@/components/ui';
import { ApiError } from '@/services/api/client';
import { fetchManualCustomers, type ManualCustomer } from '@/services/api/addCustomer.api';
import { formatPhone } from '@/components/ui/PhoneField';
import { formatDateLong } from '@/lib/format';
/* `formatAadhar` lives with the request KYC types, not the date/money
   formatters — the same helper the Add Customer form spaces the field with, so
   the number reads identically where it is entered and where it is shown. */
import { formatAadhar } from '@/lib/requests';
import { fonts } from '@/constants/typography';
import { radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

/**
 * Customers — the walk-ins this owner logged by hand.
 *
 * Where the Add Customer form lands, and the only place those records are
 * shown as records rather than as bookings.
 *
 * ## Why it is not just the Bookings tab
 *
 * Bookings answers "who is staying" — it is filtered by upcoming and history
 * and it says nothing about identity. This answers a different question: who
 * did I enter, with what documents, and was their number actually proved.
 * That is what an owner needs months later when somebody disputes a deposit,
 * and it is the half of the record the booking card deliberately leaves out.
 *
 * `source=manual` is applied by the SERVER. Everything here was typed on this
 * owner's phone; a record that came from a customer's own visit request is a
 * different provenance and belongs on a different screen.
 */
export default function CustomersScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<ManualCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCustomers(await fetchManualCustomers());
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'We could not load your customers.');
    }
  }, []);

  /*
   * Refetched every time the screen comes back into focus.
   *
   * Editing and deleting both happen on pushed screens that `back()` to here.
   * A plain mount effect would leave the row exactly as it was — a deleted
   * customer still listed, an edited name still wrong — until the app was
   * restarted.
   */
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen
      contentStyle={styles.stack}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>
          <Text variant="screenTitle">Customers</Text>
        </>
      }
      footer={
        <Button label="+ Add customer" onPress={() => router.push('/requests/add-customer')} />
      }
    >
      {error ? (
        <ErrorState title="We could not load this" body={error} onRetry={load} />
      ) : customers === null ? (
        <View style={styles.stack}>
          <Skeleton width="100%" height={108} radius={16} />
          <Skeleton width="100%" height={108} radius={16} />
        </View>
      ) : customers.length === 0 ? (
        <EmptyState
          icon="user"
          title="No customers added yet"
          body="Guests you log by hand — a walk-in, a phone booking, anyone who didn't come through a request — appear here with their KYC."
        />
      ) : (
        <>
          <Text variant="caption" color="textSecondary" style={styles.count}>
            {customers.length} added by hand
          </Text>
          {customers.map((customer) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              onEdit={() => router.push({ pathname: '/customer/[id]', params: { id: customer.id } })}
              onDelete={() =>
                router.push({
                  pathname: '/customer/delete',
                  /* The name travels so the sheet can say who it is about. A
                     confirm that does not name its subject is one people learn
                     to tap through. */
                  params: { id: customer.id, name: customer.guestName },
                })
              }
            />
          ))}
        </>
      )}
    </Screen>
  );
}

function CustomerCard({
  customer,
  onEdit,
  onDelete,
}: {
  customer: ManualCustomer;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const c = useColors();
  const [showDoc, setShowDoc] = useState(false);

  const readableDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : formatDateLong(d);
  };

  /* The number is stored E.164; the app has always shown the ten digits. */
  const phone = customer.guestPhone.replace(/\D/g, '').slice(-10);
  const doc = customer.kyc?.aadharImages?.[0];

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
            {customer.guestName || 'Unnamed guest'}
          </Text>
          <Text variant="caption" color="textSecondary">
            +91 {formatPhone(phone)}
          </Text>
        </View>
        {/*
          The verified badge is the server's, not a local flag.
          `verifiedAt` is written only after a code the server generated came
          back correct — it is the difference between a number somebody typed
          and a number somebody answered.
        */}
        <Badge
          label={customer.kyc?.verifiedAt ? 'Verified' : 'Unverified'}
          tone={customer.kyc?.verifiedAt ? 'success' : 'warning'}
        />
      </View>

      <View style={[styles.stayRow, { borderTopColor: c.borderSubtle }]}>
        <View style={styles.stayCol}>
          <Text variant="badge" color="textTertiary">
            Check-in
          </Text>
          <Text variant="bodySm">{readableDate(customer.checkInDate)}</Text>
        </View>
        <View style={styles.stayCol}>
          <Text variant="badge" color="textTertiary">
            Check-out
          </Text>
          <Text variant="bodySm">{readableDate(customer.checkOutDate)}</Text>
        </View>
      </View>

      <Text variant="caption" color="textSecondary">
        {[customer.shareType, customer.guestsLabel].filter(Boolean).join(' · ') || '—'}
      </Text>

      {customer.kyc?.address ? (
        <Text variant="caption" color="textTertiary" style={styles.address}>
          {customer.kyc.address}
        </Text>
      ) : null}

      {customer.kyc?.aadharNumber ? (
        <Text variant="mono" color="textSecondary">
          {formatAadhar(customer.kyc.aadharNumber)}
        </Text>
      ) : null}

      {/*
        The document is behind a tap rather than shown inline.
        A list of Aadhar cards on an unlocked phone in a hostel lobby is a
        different thing from a list of names, and the owner almost never needs
        to see it — they need to know it is on file.
      */}
      {doc ? (
        <Pressable
          onPress={() => setShowDoc((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={showDoc ? 'Hide the Aadhar photograph' : 'Show the Aadhar photograph'}
          style={styles.docToggle}
        >
          <Icon name={showDoc ? 'check-circle' : 'image'} size={15} color={c.accentInk} />
          <Text variant="link" style={{ color: c.accentInk }}>
            {showDoc ? 'Hide Aadhar photo' : 'Aadhar on file — tap to view'}
          </Text>
        </Pressable>
      ) : (
        <Text variant="badge" color="textTertiary">
          No document on file
        </Text>
      )}

      {showDoc && doc ? (
        <Image
          source={{ uri: doc.url }}
          style={[styles.doc, { borderColor: c.borderCard }]}
          resizeMode="contain"
        />
      ) : null}

      {/*
        Edit and Delete, separated by a rule and by distance.

        Delete is last, on the right, and is the only thing on the card drawn
        in the error colour — the standing rule that a destructive action is
        never adjacent to the ordinary one, so a thumb travelling to Edit never
        passes over it.
      */}
      <View style={[styles.actions, { borderTopColor: c.borderSubtle }]}>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${customer.guestName || 'this customer'}`}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="edit" size={15} color={c.textSecondary} />
          <Text variant="link" color="textSecondary">
            Edit
          </Text>
        </Pressable>

        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${customer.guestName || 'this customer'}`}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name="trash" size={15} color={c.error} />
          <Text variant="link" style={{ color: c.error }}>
            Delete
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 2 },
  count: { marginTop: 2 },
  card: { padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  headText: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  stayRow: { flexDirection: 'row', gap: 20, borderTopWidth: 1, paddingTop: 10 },
  stayCol: { gap: 2 },
  address: { lineHeight: 17 },
  docToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  doc: { width: '100%', height: 200, borderRadius: radius.card, borderWidth: 1 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 6,
    marginTop: 2,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingRight: 4 },
});
