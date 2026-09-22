/* ══════════════════════════════════════════════════════════════════════════
   Sign in — the only door. There is no "Create account" here: a sales rep's
   account is created by an administrator in the Admin console, who hands the
   rep the exact email and password they typed in there. A stranger who found
   this screen has no way to make one for themselves, which is the point —
   see `Backend/src/modules/sales/sales.controller.js`'s header.

   `signIn` on `useAuthStore` hits `/api/v2/sales/auth/login`. Nothing here
   is mocked or deferred.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Box, Btn, Field, Note, Text, TextField } from "@/components/common";
import { isOffline } from "@/services/api";
import { useAuthStore } from "@/store/authStore";
import { colors, layout, radius, space } from "@/theme";

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = !!email.trim() && !!password;

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      /* Nothing routes from here — the root layout watches the session and
         swaps the whole navigator the moment it exists, matching every
         other Lampose app's own auth gate. */
    } catch (err) {
      setError((err as Error)?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingTop: insets.top + space[7], paddingBottom: insets.bottom + space[5] },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Box style={{ alignItems: "center", gap: space[2] }}>
            <Box style={styles.mark}>
              <Text variant="display" style={{ color: colors.onBrand }}>
                L
              </Text>
            </Box>
            <Text variant="title">Lampose Tracker</Text>
            <Text variant="caption" color="tertiary">
              For the sales team, on the road
            </Text>
          </Box>

          <Field label="Email">
            <TextField
              value={email}
              onChangeText={setEmail}
              placeholder="you@lampose.in"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>

          <Field label="Password">
            <TextField
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              autoCapitalize="none"
            />
          </Field>

          {!!error && <Note tone="bad">{error}</Note>}

          {isOffline() && (
            <Note tone="bad">
              No server is configured. Set EXPO_PUBLIC_API_URL in the app&apos;s .env and restart it.
            </Note>
          )}

          <Btn label="Sign in" onPress={submit} loading={busy} disabled={!canSubmit} />

          <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
            Don&apos;t have an account? Ask your admin to set one up for you.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Box>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.gutter, gap: space[4] },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
});
