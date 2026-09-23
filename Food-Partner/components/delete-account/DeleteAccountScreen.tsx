/* ══════════════════════════════════════════════════════════════════════════
   Delete account — a kitchen asking to leave Lampose, from inside the app.

   The App Store and Google Play both require that an account created in the
   app can be deleted from the app. This is that door; lampose.com/delete-account
   is the other one, and both write the same request.

   What the screen promises is what the server does: the account is SCHEDULED
   for deletion `graceDays` out, not emptied on the tap. Orders already placed
   still have to be cooked, and what the kitchen is owed is still paid — so the
   screen says so, and inside the window it offers the way back.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import {
  Box, Btn, Card, ConfirmSheet, DataRow, Field, Notice, Scroller, Text, TextField, TopBar,
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
  body: "Your kitchen will be scheduled for deletion. You can cancel from this screen until the date we give you.",
  primary: "Yes, delete my account",
  secondary: "Keep my account",
};

const messageOf = (caught: unknown) =>
  caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";

export function DeleteAccountScreen() {
  const session = usePartnerStore((s) => s.session);
  const token = session?.token ?? null;

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
      setState(await requestDeletion(token, reason));
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

  const requested = state?.status === "requested";
  const days = state?.graceDays ?? 30;
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
        ) : requested ? (
          <>
            <Notice
              tone="warning"
              title={`Scheduled for deletion on ${longDate(state?.scheduledFor)}`}
              body="Until then your kitchen keeps working as normal and you are paid for every order you complete. After that date the account and its personal data are deleted."
            />
            {!!state?.activeOrders && (
              <Notice
                tone="info"
                title={`${state.activeOrders} order${state.activeOrders === 1 ? "" : "s"} in progress`}
                body="Orders already placed with your kitchen still have to be prepared."
              />
            )}
            <Card>
              <DataRow label="Requested" value={longDate(state?.requestedAt) || "—"} first />
              <DataRow label="Deleted on or after" value={longDate(state?.scheduledFor) || "—"} />
            </Card>
            <Btn label="Cancel deletion request" variant="ink" loading={busy} onPress={undo} />
            <Text variant="caption" color="tertiary">
              Cancelling keeps your kitchen exactly as it is — menu, documents, bank details and all.
            </Text>
          </>
        ) : (
          <>
            <Text variant="body" color="secondary">
              Deleting your Lampose Partner account is permanent once it is carried out. We schedule
              it {days} days from today, so any orders can be finished, anything owed to you can be
              paid, and you can change your mind.
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
                Records of orders served and payouts made are kept for as long as the law requires,
                separately from your profile.
              </Text>
            </View>

            <Field label="Why are you leaving?" optional hint="It does not affect the request.">
              <TextField
                value={reason}
                onChangeText={setReason}
                placeholder="Anything you would like us to know"
                maxLength={500}
                multiline
              />
            </Field>

            <Btn
              label="Delete my account"
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
