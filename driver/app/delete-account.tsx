/* ══════════════════════════════════════════════════════════════════════════
   Delete account — the rider asking to leave, from inside the app.

   The App Store and Google Play both require that an account created in the
   app can be deleted from the app. This is that door; lampose.com/delete-account
   is the other one, and both write the same request.

   What the screen promises is what the server does: the account is SCHEDULED
   for deletion `graceDays` out, not emptied on the tap. A rider with a bag on
   the bike still has to deliver it and still gets paid for it, so the screen
   says so rather than pretending the account vanished. Inside the window the
   same screen offers the way back.
   ══════════════════════════════════════════════════════════════════════════ */
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, DataRow, Input, Notice, SectionHeader, Sheet, Text, TopBar } from "@/components/ui";
import type { SheetSpec } from "@/components/ui";
import {
  cancelDeletion, fetchDeletion, longDate, requestDeletion, type DeletionState,
} from "@/services/accountDeletion";
import { useDriverStore } from "@/store/driverStore";
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
  body: "Your account will be scheduled for deletion. You can cancel from this screen until the date we give you.",
  primary: "Yes, delete my account",
  secondary: "Keep my account",
};

const messageOf = (caught: unknown) =>
  caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const token = useDriverStore((s) => s.token);

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

  const requested = state?.status === "requested";
  const days = state?.graceDays ?? 30;
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
        ) : requested ? (
          <>
            <Notice
              tone="warning"
              title={`Scheduled for deletion on ${longDate(state?.scheduledFor)}`}
              body="Until then you can keep riding and you will be paid for every delivery you complete. After that date your account and personal data are deleted."
            />
            {!!state?.activeOrders && (
              <Notice
                tone="info"
                title={`${state.activeOrders} deliver${state.activeOrders === 1 ? "y" : "ies"} in progress`}
                body="Please complete it — the food still has to reach the customer."
              />
            )}
            <View style={styles.group}>
              <View style={styles.dataWrap}>
                <DataRow label="Requested" value={longDate(state?.requestedAt) || "—"} first />
                <DataRow label="Deleted on or after" value={longDate(state?.scheduledFor) || "—"} />
              </View>
            </View>
            <Btn
              label="Cancel deletion request"
              variant="ink"
              loading={busy}
              onPress={undo}
            />
            <Text variant="caption" color="tertiary">
              Cancelling keeps your account exactly as it is — documents, bank details and all.
            </Text>
          </>
        ) : (
          <>
            <Text variant="body" color="secondary">
              Deleting your Lampose Delivery Partner account is permanent once it is carried out.
              We schedule it {days} days from today, so anything owed to you can be paid and you can
              change your mind.
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
                Records of completed deliveries and payouts are kept for as long as the law
                requires, separately from your profile.
              </Text>
            </View>

            <Input
              label="Why are you leaving?"
              required={false}
              hint="Optional. It does not affect the request."
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
