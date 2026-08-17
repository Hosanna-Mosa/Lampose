import { Stack } from 'expo-router';

/**
 * The sign-in flow's own navigator.
 *
 * ## Why this file has to exist
 *
 * Without a `_layout.tsx`, expo-router does not register `(auth)` as a route at
 * all — it flattens the folder and registers `(auth)/login`, `(auth)/otp` and
 * `(auth)/profile-setup` as three unrelated screens of the parent. The root
 * layout then names a child that is not there:
 *
 *   WARN [Layout children]: No route named "(auth)" exists in nested children
 *
 * which is what the app was logging on every launch. `(tabs)` never had the
 * problem because it has always had a layout of its own.
 *
 * ## Why a Stack rather than letting them be siblings
 *
 * The three screens are a sequence — a number, then the code sent to it, then
 * the name — and back out of the code screen has to land on the number. A
 * stack gives that for free and gives the transition somewhere to animate. As
 * loose siblings of the root they would each push onto the app's main history,
 * so backing out of profile setup would land on the tab bar of an account that
 * has not finished being created.
 *
 * The gate in `app/_layout.tsx` decides WHICH of the three is allowed; this
 * only decides how they are presented.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        /* Every screen here draws its own back affordance, and `profile-setup`
           deliberately has none — the number is already verified by then and
           there is nothing behind it to return to. A swipe-back would undo
           that decision on iOS. */
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="otp" />
      <Stack.Screen name="profile-setup" />
    </Stack>
  );
}
