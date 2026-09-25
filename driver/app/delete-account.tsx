/* ══════════════════════════════════════════════════════════════════════════
   Delete account — the rider leaving, from inside the app.

   The App Store and Google Play both require that an account created in the
   app can be deleted from the app. This is that door; lampose.com/delete-account
   is the other one, and both reach the same handlers.

   What the screen promises is what the server does: the account is deleted on
   the tap, and the same token is refused from the next request on. So success
   signs the rider out exactly as Logout does, and the stack guard in
   `_layout.tsx` takes them to sign-in. A delivery in hand does not block it —
   the order is kept, but nobody can manage it from this account any more, and
   the confirm sheet says so before the tap rather than after.

   An account that asked BEFORE deletion became immediate may still carry a
   pending request; it gets a note and the old way to withdraw it.
   ══════════════════════════════════════════════════════════════════════════ */
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Input, Notice, SectionHeader, Sheet, Text, TopBar } from "@/components/ui";
import type { SheetSpec } from "@/components/ui";
import {
  cancelDeletion, fetchDeletion, requestDeletion, type DeletionState,
} from "@/services/accountDeletion";
import { useDriverStore } from "@/store/driverStore";
import { useFlowStore } from "@/store/flowStore";
import { ApiError } from "@/utils/api";
import { colors, layout, radius, space } from "@/theme";

const WHAT_GOES = [
  "Your profile, contact details and address",
  "Your licence, RC, Aadhaar, PAN and insurance documents",
  "Bank and payout details",
  "Your live and past location data",
];

const CONFIRM: SheetSpec = {
  kicker: "Delete account",
  tone: "danger",
  title: "Delete your rider account?",
  body:
    "This deletes your account immediately and cannot be undone. A delivery in progress stays as it " +
    "is, but you will no longer be able to manage it from this account. Deliveries, earnings, payouts " +
    "and a copy of your account details are kept for legal and accounting records.",
  primary: "Yes, delete my account",
  secondary: "Keep my account",
};

const messageOf = (caught: unknown) =>
  caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const token = useDriverStore((s) => s.token);
  const logout = useDriverStore((s) => s.logout);
  const say = useFlowStore((s) => s.say);

  const [state, setState] = React.useState<DeletionState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [asking, setAsking] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setProblem(null);
    try {
      setState(await fetchDeletion(token));
    } catch (caught) {
      setProblem(messageOf(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setAsking(false);
    if (!token) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await requestDeletion(token, reason);
      if (result.deleted || result.status === "completed") {
        /* Said BEFORE signing out, so the sign-in screen mounts showing it.
           `accountGone` skips the handset unregister: the server already
           dropped it, and the token is now refused ACCOUNT_GONE. */
        say("Your account has been deleted");
        await logout({ accountGone: true });
        return;
      }
      // Anything else is a server that did not delete — show what it now says.
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
    setProblem(null);
    try {
      setState(await cancelDeletion(token));
      setReason("");
    } catch (caught) {
      setProblem(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  // Only an account that asked before deletion became immediate can be here.
  const requested = state?.status === "requested";
  const support = state?.supportEmail || "contact@lampose.com";

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Delete account" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: space[6] + insets.bottom }]}
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
                  title="An older deletion request is pending"
                  body="You asked to delete this account before deletion became immediate. You can withdraw that request, or delete the account now below."
                />
                <Btn label="Cancel request" variant="ink" loading={busy} onPress={undo} />
              </>
            )}

            <Text variant="body" color="secondary">
              Deleting your Lampose Delivery Partner account happens immediately and cannot be
              undone. A delivery still in progress stays as it is, but you will no longer be able
              to manage it from this account.
            </Text>

            <View style={{ gap: space[2] }}>
              <SectionHeader title="What is deleted" />
              <View style={styles.group}>
                <View style={styles.dataWrap}>
                  {WHAT_GOES.map((line, i) => (
                    <Text
                      key={line}
                      variant="body"
                      style={[styles.bullet, i > 0 && styles.divided]}
                    >
                      {`•  ${line}`}
                    </Text>
                  ))}
                </View>
              </View>
              <Text variant="caption" color="tertiary">
                Deliveries, earnings, payouts and a copy of your account details are kept for legal
                and accounting records.
              </Text>
            </View>

            <Input
              label="Why are you leaving?"
              required={false}
              hint="Optional. It does not affect the deletion."
              value={reason}
              onChangeText={setReason}
              maxLength={500}
              multiline
            />

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
      </ScrollView>

      <Sheet spec={CONFIRM} visible={asking} onPrimary={submit} onDismiss={() => setAsking(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingTop: space[2], gap: space[4] },
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  dataWrap: { paddingHorizontal: space[4], paddingVertical: space[1] },
  bullet: { paddingVertical: space[2] },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
});
