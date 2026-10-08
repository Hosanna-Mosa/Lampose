import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Icon, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';

export type AddressSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * "Deliver to" — the saved book, in a sheet over the cart.
 *
 * A tap picks and closes, because changing where dinner goes is one decision,
 * not a form. Adding a new address still goes to the editor, which is a whole
 * screen of fields; the cart re-reads the book when it is returned to.
 */
export function AddressSheet({ visible, onClose }: AddressSheetProps) {
  const { colors, space, radius } = useTheme();
  const router = useRouter();
  const { status, requireSignIn } = useAuth();
  const { address, addressChoices, setAddressId, refreshAddresses } = useFood();
  const signedIn = status === 'signedIn';

  /* Read on open: an address saved on another phone, or a moment ago in the
     editor, belongs in the list the diner is choosing from. */
  useEffect(() => {
    if (visible && signedIn) void refreshAddresses();
  }, [visible, signedIn, refreshAddresses]);

  const addNew = () => {
    onClose();
    router.push('/addresses/edit');
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Deliver to">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingBottom: space[3] }}>
        {!signedIn ? (
          <View style={{ gap: space[3], paddingVertical: space[2] }}>
            <Text variant="body" color="secondary">
              Your saved addresses live on your account. Sign in to see them.
            </Text>
            <Button label="Sign in" fullWidth onPress={() => requireSignIn(() => {})} />
          </View>
        ) : (
          <>
            {addressChoices.length === 0 ? (
              <Text variant="body" color="secondary" style={{ paddingVertical: space[2] }}>
                No addresses saved yet. Add where you want this delivered — you only do it once.
              </Text>
            ) : (
              addressChoices.map((entry) => {
                const chosen = entry.id === address?.id;
                return (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: chosen }}
                    onPress={() => {
                      setAddressId(entry.id);
                      onClose();
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        backgroundColor: chosen ? colors.brandTint : pressed ? colors.surfaceSunken : colors.surface,
                        borderColor: chosen ? colors.brand : colors.border,
                        borderWidth: chosen ? 1.5 : StyleSheet.hairlineWidth,
                        borderRadius: radius.card,
                        padding: space[3],
                        gap: space[3],
                      },
                    ]}
                  >
                    <View style={[styles.well, { backgroundColor: chosen ? colors.surface : colors.surfaceSunken, borderRadius: radius.chip }]}>
                      <Icon name={entry.kind === 'room' ? 'home' : 'mapPin'} size={16} color={chosen ? colors.brandInk : colors.textSecondary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <View style={[styles.titleRow, { gap: space[2] }]}>
                        <Text variant="title3" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {entry.title}
                        </Text>
                        {entry.isDefault ? (
                          <View style={[styles.tag, { backgroundColor: colors.surfaceSunken, borderRadius: radius.chip, paddingHorizontal: space[1] + 2 }]}>
                            <Text variant="caption" color="secondary">
                              Default
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text variant="caption" color="secondary" numberOfLines={2}>
                        {entry.detail}
                      </Text>
                    </View>
                    {/* The tick, not only the tint — selection is never carried
                        by colour alone. */}
                    {chosen ? <Icon name="check" size={18} color={colors.brandInk} /> : null}
                  </Pressable>
                );
              })
            )}

            <Pressable
              accessibilityRole="button"
              onPress={addNew}
              style={({ pressed }) => [
                styles.row,
                {
                  justifyContent: 'center',
                  borderStyle: 'dashed',
                  borderWidth: 1.5,
                  borderColor: colors.brand,
                  borderRadius: radius.card,
                  padding: space[3],
                  gap: space[2],
                  backgroundColor: pressed ? colors.brandTint : 'transparent',
                },
              ]}
            >
              <Text variant="title3" style={{ color: colors.brandInk }}>
                +
              </Text>
              <Text variant="bodyStrong" style={{ color: colors.brandInk }}>
                Add a new address
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  well: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  tag: { paddingVertical: 1 },
});
