/* ══════════════════════════════════════════════════════════════════════════
   Delete account — a kitchen asking to leave Lampose, from inside the app.

   The App Store and Google Play both require that an account created in the
   app can be deleted from the app. This is that door; lampose.com/delete-account
   is the other one, and both write the same request.

   What the screen promises is what the server does: the account is DELETED on
   the tap — the kitchen and its menu come off Lampose, and the session dies
   with it (the next call would be a 401 ACCOUNT_GONE). So success signs out
   exactly as the Profile screen does and lands on sign-in. An account that
   asked before deletion became immediate may still carry a pending request;
   that is the only case the old "Cancel request" is offered for.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import {
  Box, Btn, Card, ConfirmSheet, Field, Notice, Scroller, Text, TextField, TopBar,
} from "@/components/common";
import type { SheetSpec } from "@/components/common";
import {
  cancelDeletion, fetchDeletion, longDate, requestDeletion, type DeletionState,
} from "@/services/accountDeletion";
import { ApiError } from "@/services/api";
import { usePartnerStore } from "@/store/partnerStore";
import { layout, space } from "@/theme";

const WHAT_GOES = [
  "The owner profile — name, email and mobile number",
  "Your kitchen's listing and menu",
  "Your FSSAI, GST, PAN and cheque documents",
  "Bank and payout details",
];

const CONFIRM: SheetSpec = {
  kicker: "Delete account",
  tone: "danger",
  title: "Delete your kitchen's account?",
  body:
    "This deletes your account immediately and cannot be undone. Your kitchen and its menu come off " +
    "Lampose; open orders stay as they are but can no longer be managed from this account. Orders, " +
    "payments and a copy of your account details are kept for legal and accounting records.",
  primary: "Yes, delete my account",
  secondary: "Keep my account",
};

const messageOf = (caught: unknown) =>
  caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";

export function DeleteAccountScreen() {
  const session = usePartnerStore((s) => s.session);
  const token = session?.token ?? null;
  const signOut = usePartnerStore((s) => s.signOut);

  const [state, setState] = useState<DeletionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setProblem("You are signed out. Sign in again to continue.");
      return;
    }
    setLoading(true);
    setProblem("");
    try {
      setState(await fetchDeletion(token));
    } catch (caught) {
      setProblem(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setAsking(false);
    if (!token) return;
    setBusy(true);
    setProblem("");
    try {
      const result = await requestDeletion(token, reason);
      if (result.deleted || result.status === "completed") {
        /* The token is dead now — clear the session the way a normal sign-out
           does (socket, alert tone, push registration) and leave for sign-in. */
        signOut();
        router.replace("/signin");
        Alert.alert("Account deleted", "Your account has been deleted.");
        return;
      }
      await load();
    } catch (caught) {
      setProblem(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!token) return;
    setBusy(true);
    setProblem("");
    try {
      setState(await cancelDeletion(token));
      setReason("");
    } catch (caught) {
      setProblem(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  /* Legacy: a request made while deletion still had a waiting period. */
  const requested = state?.status === "requested";
  const support = state?.supportEmail || "contact@lampose.com";

  return (
    <Box style={styles.root}>
      <TopBar back="Profile" title="Delete account" />

      <Scroller
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text variant="body" color="tertiary">Checking your account…</Text>
        ) : (
          <>
            {requested && (
              <>
                <Notice
                  tone="warning"
                  title="An earlier deletion request is pending"
                  body={`You asked to delete this account${state?.requestedAt ? ` on ${longDate(state.requestedAt)}` : ""}. You can withdraw that request, or delete the account now below.`}
                />
                <Btn label="Cancel request" variant="ink" loading={busy} onPress={undo} />
              </>
            )}

            <Text variant="body" color="secondary">
              Deleting your Lampose Partner account happens immediately and cannot be undone. Your
              kitchen and its menu come off Lampose. Orders already placed stay as they are, but can
              no longer be managed from this account.
            </Text>

            <View style={{ gap: space[2] }}>
              <Text variant="label" color="tertiary">What is deleted</Text>
              <Card>
                {WHAT_GOES.map((line) => (
                  <Text key={line} variant="body" style={styles.bullet}>
                    {`•  ${line}`}
                  </Text>
                ))}
              </Card>
              <Text variant="caption" color="tertiary">
                Orders, payments and a copy of your account details are kept for legal and
                accounting records.
              </Text>
            </View>

            <Field label="Why are you leaving?" optional hint="It does not affect the deletion.">
              <TextField
                value={reason}
                onChangeText={setReason}
                placeholder="Anything you would like us to know"
                maxLength={500}
                multiline
              />
            </Field>

            <Btn
              label="Delete my account now"
              variant="danger"
              glyph="alert"
              loading={busy}
              onPress={() => setAsking(true)}
            />
          </>
        )}

        {!!problem && <Notice tone="danger" title="That did not work" body={problem} />}

        <Text variant="caption" color="tertiary">
          Need help? Write to{" "}
          <Text
            variant="caption"
            color="brand"
            onPress={() => Linking.openURL(`mailto:${support}`).catch(() => {})}
          >
            {support}
          </Text>
          .
        </Text>
      </Scroller>

      <ConfirmSheet spec={CONFIRM} visible={asking} onPrimary={submit} onDismiss={() => setAsking(false)} />
    </Box>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: layout.gutter, paddingTop: space[2], paddingBottom: space[8], gap: space[4] },
  bullet: { paddingVertical: space[1] },
});
