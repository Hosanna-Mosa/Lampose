import { useCallback, useState } from 'react';
import { Box, Tappable } from '@/components/common';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Icon, Badge, EmptyState } from '@/components/common';
import { maskedNumber, toPayoutMethod, type PayoutMethod } from '@/lib/payouts';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

import { fetchPaymentMethodsApi } from '@/services/api/domain.api';
import { logWarn } from '@/lib/log';
import { MethodRow } from '@/components/earnings-methods/organisms/MethodRow/MethodRow';
import { styles } from '@/components/earnings-methods/styles';

export function PayoutMethodsScreen() {
  const router = useRouter();
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadMethods = useCallback(async () => {
    try {
      const items = await fetchPaymentMethodsApi();
      /* One mapper, in `lib/payouts.ts`, because three screens read this list
         and the field names on the wire are not the ones the UI uses. */
      setMethods((items || []).map(toPayoutMethod));
    } catch (err) {
      logWarn('Failed to load payment methods:', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  /*
   * On FOCUS, not on mount.
   *
   * Adding, removing and promoting all happen on other screens and then come
   * back here. A `useEffect([])` ran once and left this list showing the state
   * before the change — an account the owner had just deleted still sitting
   * there, or the old default still marked.
   */
  useFocusEffect(
    useCallback(() => {
      void loadMethods();
    }, [loadMethods]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadMethods();
    } finally {
      setRefreshing(false);
    }
  }, [loadMethods]);

  return (
    <Screen
      contentStyle={styles.stack}
            refreshing={refreshing}
            onRefresh={onRefresh}
            footer={
              <Button
                label="+ Add payout method"
                variant="secondary"
                onPress={() => router.push('/earnings/add-method')}
              />
            }
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>

          <Text variant="screenTitle" style={styles.title}>
            Payout methods
          </Text>
        </>
      }
    >

      {methods.length > 0 ? (
        methods.map((m) => (
          <MethodRow
            key={m.id}
            method={m}
            onPress={
              m.isDefault
                ? undefined
                : () => router.push(`/earnings/method-actions?id=${m.id}`)
            }
          />
        ))
      ) : loaded ? (
        // Without a method there is nowhere for money to go, so this says so.
        <EmptyState
          icon="bank"
          title="No payout method"
          body="Add a bank account so your earnings have somewhere to land."
          style={styles.empty}
        />
      ) : null}
    </Screen>
  );
}

