import { useCallback, useState } from 'react';
import { Box, Tappable } from '@/components/common';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  IconButton,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Icon,
} from '@/components/common';
import { ApiError } from '@/services/api/client';
import { fetchManualCustomers, type ManualCustomer } from '@/services/api/addCustomer.api';
import { formatPhone } from '@/components/common';
import { formatDateLong } from '@/lib/format';
import { fonts } from '@/constants/typography';
import { CustomerCard } from '@/components/customers/organisms/CustomerCard/CustomerCard';
import { styles } from '@/components/customers/styles';

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
export function CustomersScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<ManualCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCustomers(await fetchManualCustomers());
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'We could not load your customers.');
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

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
      refreshing={refreshing}
      onRefresh={onRefresh}
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>
          <Text variant="screenTitle">Customers</Text>
        </>
      }
    >
      {error ? (
        <ErrorState title="We could not load this" body={error} onRetry={load} />
      ) : customers === null ? (
        <Box style={styles.stack}>
          <Skeleton width="100%" height={108} radius={16} />
          <Skeleton width="100%" height={108} radius={16} />
        </Box>
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

