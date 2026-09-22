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
import { colors, elevation, layout, radius, space, touch } from "@/theme";
import { ForgotPasswordModal } from "./ForgotPasswordModal";

export function SignIn() {
  const signIn = usePartnerStore((s) => s.signIn);
  const syncFromServer = usePartnerStore((s) => s.syncFromServer);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [successNote, setSuccessNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const attempt = async () => {
    setBusy(true);
    setError("");
    setSuccessNote("");
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
      {/* `back` is non-null now — reached from `Pitch`'s "Already applied?"
          link (real history to pop) or a deep link (falls back to "/",
          `TopBar`'s own default when there is nothing to go back to). Either
          way there is now a way out that is not the OS back gesture. */}
      <TopBar back="Lampose" title="Sign in" />

      <Scroller contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Box style={{ alignItems: "center", gap: space[2], marginBottom: space[2] }}>
          <Box style={styles.markHalo}>
            <Box style={styles.mark}>
              <Text variant="display1" style={{ color: colors.onBrand }}>
                L
              </Text>
            </Box>
          </Box>
          <Text variant="display2">Welcome back</Text>
          <Text variant="body" color="secondary" style={{ textAlign: "center" }}>
            Sign in with your registered email or phone number to open your kitchen dashboard.
          </Text>
        </Box>

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

        <Tappable onPress={() => setShowForgotModal(true)} style={styles.forgotPassRow}>
          <Text variant="body" color="brand" style={{ fontWeight: "600" }}>
            Forgot password?
          </Text>
        </Tappable>

        {!!successNote && <Note tone="ok">{successNote}</Note>}
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
          style={elevation.card}
        />

        <Box style={styles.rule} />

        {/* The other door. `Pitch.tsx` is the full version of this same
            junction (in flight → status, draft → resume, otherwise → this
            route) but is not the app's landing screen today, so a restaurant
            with no account yet had no way in from here — this link is the
            minimal fix for that until it is. */}
        <Tappable
          accessibilityRole="button"
          onPress={() => router.push("/onboarding/restaurant")}
          style={styles.link}
        >
          <Text variant="body" color="secondary">
            New restaurant?
          </Text>
          <Text variant="bodyStrong" color="brand">
            Start onboarding
          </Text>
        </Tappable>
      </Scroller>

      <ForgotPasswordModal
        visible={showForgotModal}
        onDismiss={() => setShowForgotModal(false)}
        onSuccess={(phone) => {
          setShowForgotModal(false);
          setIdentifier(phone);
          setPassword("");
          setError("");
          setSuccessNote("Password reset successfully! Please log in with your new password.");
        }}
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  body: { padding: layout.gutter, paddingTop: space[6], gap: space[4] },
  link: centredLinkRow,
  forgotPassRow: {
    alignSelf: "flex-end",
    marginTop: -space[2],
    paddingVertical: space[1],
  },
  markHalo: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    width: 48,
    height: 48,
    borderRadius: radius.card,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.card,
  },
  /* A hairline rather than another `Note`/`Card` — the two doors below it
     (sign in, start onboarding) are already told apart by their own weight;
     this just keeps "Start onboarding" from reading as part of the form
     instead of a separate way in. */
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: space[1],
  },
});
