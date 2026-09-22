/* ══════════════════════════════════════════════════════════════════════════
   Its own screen, not just a button on the toggle screen — a rep mid-shift
   who taps "Log out" by accident should see one more screen before the
   session is actually gone, not lose it on the same tap.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Box, Btn, Text } from "@/components/common";
import { useAuthStore } from "@/store/authStore";
import { colors, layout, space } from "@/theme";

export function LogoutScreen() {
  const insets = useSafeAreaInsets();
  const rep = useAuthStore((s) => s.session?.salesRep);
  const signOut = useAuthStore((s) => s.signOut);

  /*
   * `signOut()` clears `session` synchronously — nothing here calls
   * `router.replace`. `app/_layout.tsx`'s `Stack.Protected guard={signedIn}`
   * picks that change up on the very same render and swaps back to "index"
   * on its own, the same way `driver/app/_layout.tsx`'s own logout handler
   * already relies on its guard rather than an explicit navigation call.
   */
  const confirm = () => {
    signOut();
  };

  return (
    <Box
      style={[
        styles.root,
        { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[5] },
      ]}
    >
      <Box style={{ gap: space[2], alignItems: "center" }}>
        <Text variant="title">Log out?</Text>
        <Text variant="body" color="secondary" style={{ textAlign: "center" }}>
          {rep?.name ? `You're signed in as ${rep.name}. ` : ""}
          You'll need your email and password to sign back in.
        </Text>
      </Box>

      <Box style={{ gap: space[3], width: "100%" }}>
        <Btn label="Log out" variant="danger" onPress={confirm} />
        <Btn label="Stay signed in" variant="ghost" onPress={() => router.back()} />
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: layout.gutter,
    alignItems: "center",
    justifyContent: "space-between",
  },
});
