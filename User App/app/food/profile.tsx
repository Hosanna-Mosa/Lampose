/* ══════════════════════════════════════════════════════════════════════════
   Food's own profile door.

   The stay Profile tab (`app/home.tsx`, `tab === 'profile'`) is reached from
   the SAME header icon, but while Food is open that icon now opens this
   screen instead — see the header wiring in `home.tsx` for why the swap is
   on the icon and not a fourth bottom tab. Everything below is genuinely
   food-scoped: preferences and favourites already existed as pushes from
   Food Home with nowhere gathering them, and delivery addresses / the
   service-area check moved here FROM the stay Profile's "Your stuff" group
   because both are about where food goes, not about a stay.

   What stays put: identity editing, appearance and the developer switch are
   account- and app-wide, not food-specific, and are not duplicated here.
   Help, sign-out and delete are repeated — see the note on that group below.
   ══════════════════════════════════════════════════════════════════════════ */
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { ProfileGroup, ProfileRow } from '@/components/lifecycle';
import { foodHref } from '@/components/food/routes';
import { useAuth } from '@/context/AuthContext';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';

export default function FoodProfileScreen() {
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { preferences, favouriteDishList, favouriteKitchenList } = useFood();

  const favouriteCount = favouriteDishList.length + favouriteKitchenList.length;
  const dietLabel =
    preferences.diet === 'veg' ? 'Veg' : preferences.diet === 'egg' ? 'Veg and egg' : 'Everything';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Food profile" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[5], paddingBottom: space[8] }}
      >
        <View style={[styles.identity, { gap: space[3] }]}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: colors.surfaceSunken, borderRadius: radius.pill },
            ]}
          >
            <Text variant="title1" color="secondary">
              {(user?.name || 'A').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title2">{user?.name || 'Your profile'}</Text>
            <Text variant="numMeta" color="secondary">
              {user?.phone}
            </Text>
          </View>
          <Button label="Edit" size="sm" variant="secondary" onPress={() => router.push('/profile/edit')} />
        </View>

        <ProfileGroup title="Food">
          <ProfileRow
            label="Food preferences"
            value={`${dietLabel} · ${preferences.spice} spice`}
            onPress={() => router.push(foodHref.preferences)}
          />
          <ProfileRow
            label="Favourites"
            value={String(favouriteCount)}
            onPress={() => router.push(foodHref.favourites)}
          />
          <ProfileRow label="Delivery addresses" onPress={() => router.push('/addresses')} />
          <ProfileRow
            label="Where we deliver"
            onPress={() => router.push('/food/delivery-area')}
            last
          />
        </ProfileGroup>

        {/*
          Repeated rather than left only on the stay side. Being inside Food
          is not a reason a diner should have to remember to hit the exit
          disc first just to ask for help or sign out — the account is the
          same one either way, so the same three actions belong wherever the
          person currently is.
        */}
        <View style={{ gap: space[2] }}>
          <ProfileGroup title="Account">
            <ProfileRow label="Help & support" onPress={() => router.push('/support')} />
            <ProfileRow
              label="Log out"
              onPress={async () => {
                await signOut();
                router.replace('/');
              }}
            />
            <ProfileRow label="Delete my account" destructive last />
          </ProfileGroup>
          <Text variant="caption" color="tertiary">
            Deleting removes your profile, saved places and search history. Your completed
            bookings and their agreements stay with us for 7 years — we are required to keep them,
            and you may need them. An active booking must end before you can delete.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});
