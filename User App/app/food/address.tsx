/* ══════════════════════════════════════════════════════════════════════════
   Where is this going?

   The screen the cart now leads to, in place of "Slot and mode".

   ## Why this replaced a slot picker

   The slot picker set a time that was never sent anywhere — `PlaceOrderRequest`
   has no slot field, so choosing 9:45 pm and choosing "as soon as possible"
   produced byte-identical orders. It was a decision the product asked for and
   then discarded. The address is the opposite: it is the one thing an order
   genuinely cannot be placed without, and until now it was never asked at all —
   the cart defaulted to a hardcoded "Block C · Room 214" fixture.

   ## Choosing is explicit, even when there is only one

   The list does not pre-select. A diner with one saved address still taps it,
   because the whole point of this screen is that somebody looked at where the
   food is going and agreed. A silent default is what put every order in the
   product so far into a room nobody chose.

   The exception is a rider-facing one rather than a UI one: `isDefault` is
   shown as a hint, not applied as a selection.

   ## An address we do not reach cannot be continued from

   The delivery verdict is stamped onto every row in the book rather than
   onto whichever one the cart happens to be pointing at. That is what makes
   the "we do not deliver here yet" line under a row able to appear at all, and
   it is why Continue goes dead on a row the kitchen cannot reach — finding
   that out after paying is the version of this that costs somebody their
   dinner. An address whose check has not answered yet is a different case and
   is left alone.

   ## With nothing saved, this screen is the ask

   No empty-state-with-a-back-button. An empty book is the reason the diner is
   here, so the primary action becomes "Add an address" and goes straight to
   the editor, which returns here.
   ══════════════════════════════════════════════════════════════════════════ */
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { FoodNotice } from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useActionBarInset } from '@/hooks/useActionBarInset';
import { formatRupees } from '@/utils/money';

export default function ChooseAddressScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const actionInset = useActionBarInset();
  const router = useRouter();
  const { status } = useAuth();
  const { address, addressChoices, setAddressId, toPay, count, refreshAddresses } = useFood();

  const signedIn = status === 'signedIn';
  const [busy, setBusy] = useState(false);

  /* On focus, not on mount: this screen is returned to from the address
     editor, and a list that still lacks the address somebody just saved is a
     list they will save it into twice. */
  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      setBusy(true);
      void refreshAddresses().finally(() => setBusy(false));
    }, [signedIn, refreshAddresses]),
  );

  const empty = addressChoices.length === 0;


  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Where is this going?"
        subtitle={count > 0 ? `${count} item${count === 1 ? '' : 's'}` : undefined}
        onBack={() => router.back()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[3] }}
      >
        {!signedIn ? (
          <FoodNotice
            tone="info"
            title="Sign in to add an address"
            body="Your saved addresses live on your account, so an order placed on one phone arrives at the right door from any of them."
          />
        ) : empty ? (
          <FoodNotice
            tone="info"
            title="No addresses saved yet"
            body="Add where you want this delivered. You only do it once — after that it is one tap."
          />
        ) : (
          addressChoices.map((entry) => {
            const chosen = entry.id === address?.id;
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: chosen }}
                onPress={() => setAddressId(entry.id)}
                style={[
                  styles.row,
                  {
                    backgroundColor: colors.surface,
                    borderColor: chosen ? colors.brand : colors.border,
                    borderWidth: chosen ? 1.5 : StyleSheet.hairlineWidth,
                    borderRadius: radius.card,
                    padding: space[4],
                    gap: space[3],
                  },
                ]}
              >
                {/* The tick, not only the border — selection is never carried
                    by colour alone. */}
                <View
                  style={[
                    styles.mark,
                    {
                      borderColor: chosen ? colors.brand : colors.border,
                      backgroundColor: chosen ? colors.brand : 'transparent',
                    },
                  ]}
                >
                  {chosen ? <Icon name="check" size={16} color={colors.surface} /> : null}
                </View>

                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="title3" numberOfLines={1}>
                    {entry.title}
                  </Text>
                  <Text variant="body" color="secondary">
                    {entry.detail}
                  </Text>
                  {!!entry.instructions && (
                    <Text variant="caption" color="tertiary">
                      “{entry.instructions}”
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })
        )}

        {signedIn && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/addresses/edit')}
            style={[
              styles.add,
              {
                borderColor: colors.brand,
                borderRadius: radius.card,
                padding: space[4],
                gap: space[2],
              },
            ]}
          >
            <Icon name="mapPin" size={20} color={colors.brand} />
            <Text variant="bodyStrong" style={{ color: colors.brand }}>
              Add a new address
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: space[6] + actionInset,
          },
        ]}
      >
        {/*
          One button, and what it does depends on what is missing. A diner with
          nothing saved is sent to the editor; a diner who has not picked is
          told to pick; only a diner who has picked goes on to pay. Disabled
          controls always say why on this screen — a dead button with no
          sentence is the thing somebody taps four times.
        */}
        {!signedIn ? (
          <Button label="Sign in" fullWidth onPress={() => router.push('/(entry)/auth')} />
        ) : empty ? (
          <Button label="Add an address" fullWidth onPress={() => router.push('/addresses/edit')} />
        ) : (
          <>
            <Button
              label={`Choose payment · ${formatRupees(toPay)}`}
              fullWidth
              disabled={!address || busy}
              onPress={() => router.push(foodHref.payment)}
            />
            {!address ? (
              <Text variant="caption" color="tertiary" style={{ marginTop: space[2], textAlign: 'center' }}>
                Pick an address above to continue.
              </Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
