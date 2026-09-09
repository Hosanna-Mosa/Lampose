import { Stack } from 'expo-router';

import { TypographyScope } from '@/context/TypographyContext';

/**
 * The food module's routes, and the typography boundary around them.
 *
 * The stay side moved to one family and four sizes. Food did not, and this is
 * one of exactly two places that keeps it on the original scale — the other is
 * `<FoodModule />` inside `app/home.tsx`, which is reached as a tab rather than
 * a route and so never passes through here.
 *
 * The Stack itself is headerless because every screen underneath draws its own
 * header; it exists so this provider has somewhere to live. Removing it would
 * silently hand every food screen the stay typography.
 */
export default function FoodLayout() {
  return (
    <TypographyScope module="food">
      <Stack screenOptions={{ headerShown: false }} />
    </TypographyScope>
  );
}
