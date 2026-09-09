/* ══════════════════════════════════════════════════════════════════════════
   The address book.

   Until this screen existed the app had three hardcoded addresses in
   `data/food.ts` — "Block C · Room 214" and two others — and `setAddressId`
   was exposed on the food context with ZERO call sites, so every order ever
   placed went to fixture number one. This is where a real one is added.

   ## What each row has to say

   A person choosing between saved addresses at a checkout is not reading; they
   are recognising. So the row leads with the label they gave it, carries the
   kind as a word, and shows the full line underneath — and the default is
   marked, because "which one is it about to use" is the only question the list
   is really answering.

   ## Deleting the default is allowed

   The server promotes the next address rather than leaving the book without
   one. Blocking the delete would be making somebody rearrange their list
   before they can tidy it, to protect an invariant the server already keeps.
   ══════════════════════════════════════════════════════════════════════════ */
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text, useAlert } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '@/services';
import {
  addressLine,
  addressTitle,
  fetchAddresses,
  removeAddress,
  setDefaultAddress,
  type SavedAddress,
} from '@/services/api/addresses.api';

const KIND_WORD: Record<string, string> = {
  room: 'Room',
  hostel: 'Hostel',
  home: 'Home',
  work: 'Work',
  gate: 'Gate',
  other: 'Other',
};

export default function AddressesScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status } = useAuth();
  const isSignedIn = status === 'signedIn';
  const client = useQueryClient();
  const { confirm } = useAlert();

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  /**
   * One place to record a new book, in both the screen and the cache.
   *
   * The Profile row states how many addresses are saved and reads
   * `queryKeys.addresses` for the number. This screen is the only thing that
   * changes that number, so every call that returns a new book publishes it
   * here — otherwise adding an address and going back to Profile shows the
   * old count until something else happens to invalidate it.
   */
  const publish = useCallback(
    (rows: SavedAddress[]) => {
      setAddresses(rows);
      client.setQueryData(queryKeys.addresses, rows);
    },
    [client],
  );

  const load = useCallback(async () => {
    /* A signed-out reader gets a sentence, not a spinner. The book lives on
       the account, so there is nothing to show and nothing to retry. */
    if (!isSignedIn) {
      setAddresses([]);
      setLoading(false);
      setError('Sign in to save an address.');
      return;
    }
    setError('');
    try {
      publish(await fetchAddresses());
    } catch (err) {
      setError((err as Error)?.message || 'We could not load your addresses.');
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, publish]);

  /* On focus rather than on mount: this screen is returned to from the form,
     and a list that still shows the old address after saving is the bug that
     makes somebody save it twice. */
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const makeDefault = async (address: SavedAddress) => {
    if (address.isDefault) return;
    setBusy(address.addressId);
    try {
      publish(await setDefaultAddress(address.addressId));
    } catch (err) {
      setError((err as Error)?.message || 'That did not save.');
    } finally {
      setBusy('');
    }
  };

  const confirmRemove = async (address: SavedAddress) => {
    /* The app's own dialog, not the platform's — see `AppAlert`. It resolves
       false on the cancel button, the scrim and the Android back button, so
       "they did not confirm" is one branch rather than three callbacks. */
    const ok = await confirm({
      title: 'Remove this address?',
      message: addressLine(address),
      confirmLabel: 'Remove',
      cancelLabel: 'Keep it',
      destructive: true,
    });
    if (!ok) return;

    setBusy(address.addressId);
    try {
      publish(await removeAddress(address.addressId));
    } catch (err) {
      setError((err as Error)?.message || 'That did not delete.');
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Your addresses" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          paddingBottom: space[8] * 2,
          gap: space[3],
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.brand}
          />
        }
      >
        {!!error && (
          <Text variant="body" style={{ color: colors.danger.ink }}>
            {error}
          </Text>
        )}

        {loading ? (
          <Text variant="body" color="tertiary">
            Loading…
          </Text>
        ) : addresses.length === 0 ? (
          <View style={{ gap: space[2], paddingVertical: space[6] }}>
            <Text variant="title3">No addresses saved</Text>
            <Text variant="body" color="secondary">
              Add one and it becomes the address your orders go to. You can save several and
              pick between them at checkout.
            </Text>
          </View>
        ) : (
          addresses.map((address) => (
            <View
              key={address.addressId}
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: address.isDefault ? colors.brand : colors.border,
                  borderWidth: address.isDefault ? 1.5 : StyleSheet.hairlineWidth,
                  borderRadius: radius.card,
                  padding: space[4],
                  gap: space[2],
                },
              ]}
            >
              <View style={styles.head}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="title3" numberOfLines={1}>
                    {addressTitle(address)}
                  </Text>
                  <Text variant="numMeta" color="tertiary">
                    {KIND_WORD[address.kind] ?? 'Address'}
                    {address.isDefault ? ' · Default' : ''}
                  </Text>
                </View>
              </View>

              <Text variant="body" color="secondary">
                {addressLine(address)}
              </Text>

              {/* The single most useful line on a delivery, and the one no form
                  template includes — so it gets its own row rather than being
                  folded into the address. */}
              {!!address.instructions && (
                <Text variant="caption" color="tertiary">
                  “{address.instructions}”
                </Text>
              )}

              {/*
                Edit and Remove are BUTTONS now, not bare words.

                They were two `Pressable`s wrapping a line of text, so the tap
                target was exactly the height of an 11.5pt label — under 20pt,
                against a platform minimum of 44 — and two of them sat side by
                side with 8pt between. Missing "Edit" and hitting "Remove" was
                a plausible tap, and one of those two is destructive.

                Both are `sm` (44pt) and share the row equally, so neither can
                be squeezed to a sliver by a long label. "Make default" stays
                a text-weight action on its own line above them: it is not
                destructive, it is not always present, and giving three
                buttons equal weight would make the row read as a toolbar.
              */}
              {!address.isDefault && (
                <Button
                  label="Make this the default"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  disabled={!!busy}
                  onPress={() => makeDefault(address)}
                />
              )}
              <View style={[styles.actions, { gap: space[3], marginTop: space[1] }]}>
                <View style={styles.flex}>
                  <Button
                    label="Edit"
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onPress={() =>
                      router.push({
                        pathname: '/addresses/edit',
                        params: { addressId: address.addressId },
                      })
                    }
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    label="Remove"
                    variant="destructive"
                    size="sm"
                    fullWidth
                    disabled={!!busy}
                    onPress={() => { void confirmRemove(address); }}
                  />
                </View>
              </View>
            </View>
          ))
        )}

        {isSignedIn && (
          <Button
            label="Add an address"
            fullWidth
            onPress={() => router.push('/addresses/edit')}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {},
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  /* Equal halves, so a long label cannot squeeze the other button. */
  flex: { flex: 1 },
});
