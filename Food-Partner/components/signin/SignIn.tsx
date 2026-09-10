/* ══════════════════════════════════════════════════════════════════════════
   Partner sign-in.

   Email or phone plus the password set during onboarding, against the real
   backend. The server decides — nothing here checks credentials locally, and a
   failure shows the reason the server gave rather than a guess.

   Where a partner lands depends on what the server says about their
   application: an approved restaurant goes to the dashboard, anything else to
   the status screen. Sending an unapproved partner to a dashboard with no menu
   in it would be the wrong answer to "am I live yet".
   ══════════════════════════════════════════════════════════════════════════ */
import { centredLinkRow } from "@/components/common/utils/sharedStyles";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  StyleSheet,
} from "react-native";

import { Box, Field, Note, Scroller, Tappable, TextField } from "@/components/common";
import { Btn, Icon, Text, TopBar } from "@/components/common";
import { API_URL } from "@/services/api";
import { login as loginRequest } from "@/services/foodPartner";
import { usePartnerStore, type ApplicationStatus } from "@/store/partnerStore";
import { colors, layout, space, touch } from "@/theme";

export function SignIn() {
  const signIn = usePartnerStore((s) => s.signIn);
  const syncFromServer = usePartnerStore((s) => s.syncFromServer);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const attempt = async () => {
    setBusy(true);
    setError("");
    try {
      const { token, restaurant } = await loginRequest(identifier.trim(), password);

      signIn({
        restaurantId: restaurant.restaurantId,
        restaurantName: restaurant.restaurantName,
        ownerName: restaurant.ownerName,
        ownerEmail: restaurant.ownerEmail,
        token,
      });
      syncFromServer({
        restaurantId: restaurant.restaurantId,
        restaurantName: restaurant.restaurantName,
        verificationStatus: restaurant.verificationStatus as ApplicationStatus,
        verificationNote: restaurant.verificationNote,
      });

      router.replace(restaurant.verificationStatus === "approved" ? "/(dash)" : "/status");
    } catch (err) {
      setError((err as Error)?.message || "We could not sign you in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar back="the start" title="Sign in" />

      <Scroller contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="display2">Welcome back</Text>
        <Text variant="body" color="secondary">
          Use the email or phone number and the password you set when you applied.
        </Text>

        <Field label="Email or phone number" required>
          <TextField
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="owner@business.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </Field>

        <Field label="Password" required>
          <TextField
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry={!show}
            autoCapitalize="none"
            right={
              <Tappable
                accessibilityRole="button"
                accessibilityLabel={show ? "Hide password" : "Show password"}
                hitSlop={8}
                onPress={() => setShow((v) => !v)}
              >
                <Icon name={show ? "eyeOff" : "eye"} size={18} color={colors.textTertiary} />
              </Tappable>
            }
          />
        </Field>

        {!!error && <Note tone="bad">{error}</Note>}

        {/* Not a fallback — a configuration problem the person holding the
            phone can actually fix, said plainly instead of as a timeout. */}
        {!API_URL && (
          <Note tone="warn">
            No server is configured. Set EXPO_PUBLIC_API_URL in the app&apos;s .env and restart it.
          </Note>
        )}

        <Btn
          label="Sign in"
          onPress={attempt}
          loading={busy}
          disabled={!identifier.trim() || !password}
        />

        <Tappable
          accessibilityRole="button"
          onPress={() => router.replace("/onboarding/restaurant")}
          style={styles.link}
        >
          <Text variant="body" color="secondary">
            No account yet?
          </Text>
          <Text variant="bodyStrong" color="brand">
            Apply to become a partner
          </Text>
        </Tappable>
      </Scroller>
    </Box>
  );
}

const styles = StyleSheet.create({
  body: { padding: layout.gutter, gap: space[4] },
  link: centredLinkRow,
});
