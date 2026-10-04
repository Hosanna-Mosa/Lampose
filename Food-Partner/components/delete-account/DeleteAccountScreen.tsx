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
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from "react-native";
import { router } from "expo-router";

import {
  AlertDialog,
  Button,
  Card,
  Header,
  InfoNote,
  ScreenShell,
  SectionHeader,
  TextField,
  Txt,
} from "@/components/ui";
import {
  cancelDeletion, fetchDeletion, longDate, requestDeletion, type DeletionState,
} from "@/services/accountDeletion";
import { ApiError } from "@/services/api";
import { usePartnerStore } from "@/store/partnerStore";
import { font, line, size, ui } from "@/theme/ui";

const WHAT_GOES = [
  "The owner profile — name, email and mobile number",
  "Your kitchen's listing and menu",
  "Your FSSAI, GST, PAN and cheque documents",
  "Bank and payout details",
];

const CONFIRM = {
  kicker: "Delete account",
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
    <ScreenShell
      keyboardAvoiding
      header={<Header title="Delete account" onBack={() => router.back()} backLabel="Back to Profile" />}
      scroll
      contentStyle={styles.body}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={ui.brand} />
          <Txt style={styles.muted}>Checking your account…</Txt>
        </View>
      ) : (
        <>
          {requested && (
            <>
              <InfoNote
                tone="warning"
                lead="An earlier deletion request is pending."
                text={`You asked to delete this account${state?.requestedAt ? ` on ${longDate(state.requestedAt)}` : ""}. You can withdraw that request, or delete the account now below.`}
              />
              <Button title="Cancel request" variant="secondary" loading={busy} fullWidth onPress={undo} />
            </>
          )}

          <Txt style={styles.lead}>
            Deleting your Lampose Partner account happens immediately and cannot be undone. Your
            kitchen and its menu come off Lampose. Orders already placed stay as they are, but can
            no longer be managed from this account.
          </Txt>

          <View>
            <SectionHeader title="What is deleted" />
            <Card bordered elevationLevel="none" style={styles.list}>
              {WHAT_GOES.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <Ionicons name="close-circle" size={18} color={ui.error} />
                  <Txt style={styles.bulletText}>{item}</Txt>
                </View>
              ))}
            </Card>
            <Txt style={[styles.muted, styles.kept]}>
              Orders, payments and a copy of your account details are kept for legal and
              accounting records.
            </Txt>
          </View>

          <TextField
            label="Why are you leaving?"
            optional
            hint="It does not affect the deletion."
            value={reason}
            onChangeText={setReason}
            placeholder="Anything you would like us to know"
            maxLength={500}
            multiline
            autoCapitalize="sentences"
          />

          <Button
            title="Delete my account now"
            variant="danger"
            fullWidth
            icon={<Ionicons name="alert-circle-outline" size={20} color={ui.white} />}
            loading={busy}
            onPress={() => setAsking(true)}
          />
        </>
      )}

      {!!problem && <InfoNote tone="danger" lead="That did not work." text={problem} />}

      <Txt style={styles.muted}>
        Need help? Write to{" "}
        <Txt style={styles.link} onPress={() => Linking.openURL(`mailto:${support}`).catch(() => {})}>
          {support}
        </Txt>
        .
      </Txt>

      <AlertDialog
        visible={asking}
        tone="danger"
        kicker={CONFIRM.kicker}
        title={CONFIRM.title}
        message={CONFIRM.body}
        onDismiss={() => setAsking(false)}
        actions={[
          { text: CONFIRM.primary, style: "destructive", onPress: submit },
          { text: CONFIRM.secondary, style: "cancel", onPress: () => setAsking(false) },
        ]}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 18 },
  loading: { alignItems: "center", gap: 12, paddingVertical: 40 },
  lead: { fontFamily: font.body.regular, fontSize: size.medium, lineHeight: line.medium, color: ui.sec },
  list: { gap: 12 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletText: { flex: 1, fontFamily: font.body.medium, fontSize: size.medium, lineHeight: line.medium, color: ui.text },
  kept: { marginTop: 10 },
  muted: { fontFamily: font.body.regular, fontSize: size.small, lineHeight: line.small, color: ui.muted },
  link: { fontFamily: font.body.semibold, color: ui.brandInk },
});
