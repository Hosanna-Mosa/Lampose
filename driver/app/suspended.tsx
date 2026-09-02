/* ══════════════════════════════════════════════════════════════════════════
   Why this rider is off the road, in the operator's own words.

   The screen is kept and every word on it was replaced. It used to read
   "Three customer complaints were raised on 12 Aug", reference "SUS-20826",
   "Expected decision within 48 hours" and "Pending earnings of ₹1,180 are safe
   and will be paid out" — four fabrications shown to whichever rider happened
   to be suspended, none of them read from anything, and the last one a promise
   about money made by a product with no payout ledger in it. There is no
   suspension reference, no review SLA and no held balance anywhere in this
   codebase to have filled them from.

   What IS real is the suspension itself, and the reason for it.
   `driverAdmin.controller.js` refuses to suspend an account without a written
   reason, precisely on the grounds that the rider is shown it. This screen
   exists to be the place that sentence finally arrives.

   ## Where the reason comes from, and where it emphatically does not

   It used to be read off the profile — `statusReason`, then `blockedReason` —
   and neither of those can be right here. Both are fields of the SELF VIEW,
   and `requireDriver` answers 403 ACCOUNT_SUSPENDED on `GET /me` before the
   handler that would build one ever runs, so a suspended rider can never load
   a profile. What this app is holding is the copy from before the suspension:
   `statusReason` on it is empty, or belongs to some earlier hold that was
   lifted, and `blockedReason` is the verdict on the account as it stood then —
   "Your documents are being reviewed." rendered under a heading asking why the
   account is on hold. A stale answer to that question is worse than no answer,
   because a rider acts on it.

   The one sentence in this session that is genuinely about the suspension is
   the refusal itself. `driverAuth.middleware.js` writes the operator's reason
   into the 403 message, and `driverStore` catches it there and keeps it as
   `suspensionNotice`. So the reason does reach the rider — not because this
   screen can ask for it, but because the server volunteers it every time it
   turns them away. That is a narrow channel and it is honest about being one:
   when nothing has been captured, this screen says the reason has not reached
   it rather than inventing a cause or dressing up an old one.

   The durable fix is a backend one and is not made here: a read-only self view
   a suspended rider is allowed to fetch, behind its own narrowly-named guard.
   That is written up with the rest of this pass; nothing in this app is
   waiting on it, and nothing in this app pretends to have it.

   ## And now something routes to it

   Nothing did. A suspended rider's requests were being refused 403 with
   `ACCOUNT_SUSPENDED` all over the app while they sat on the tabs wondering
   why nothing worked, because the root layout only ever asked whether they had
   finished onboarding. The guard is in `_layout.tsx` now.

   ## Support is deliberately still reachable from here

   `requireDriverForSupport` is the one guard in the driver module that lets a
   suspended account through, written for exactly this moment. So "Talk to
   support" is not a dead button on this screen: it is the only route out, and
   the server was built to keep it open.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React, { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Btn, Icon, Sheet, Text, TopBar } from "@/components/ui";
import { useSheet } from "@/hooks/useSheet";
import { useDriverStore } from "@/store/driverStore";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

/** Blocking state — no bottom navigation, only one way out. */
export default function SuspendedScreen() {
  const setOverlay = useFlowStore((s) => s.setOverlay);
  const sheet = useSheet();

  const notice = useDriverStore((s) => s.suspensionNotice).trim();
  const refreshProfile = useDriverStore((s) => s.refreshProfile);

  /*
    Asked again on every open, for two reasons that both matter to the person
    sitting in front of it.

    A hold that has been lifted while the app was closed shows up as this
    request SUCCEEDING — the store writes the fresh profile, the root layout
    stops routing here, and the rider is back at work without having been told
    to reinstall anything. A hold that stands shows up as the same 403 that
    carries the operator's sentence, which is how this screen gets one at all.
    Either way the answer is worth having, and it costs one request.
  */
  useEffect(() => {
    refreshProfile().catch(() => {});
  }, [refreshProfile]);

  return (
    <View style={styles.root}>
      <TopBar title="Account status" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.mark}>
          <Icon name="alert" size={28} color={colors.danger.on} strokeWidth={2} />
        </View>

        <Text variant="display1" style={styles.centered}>
          Your account is on hold
        </Text>
        <Text variant="bodyLg" color="secondary" style={styles.centered}>
          You cannot go online or receive deliveries until this is lifted.
        </Text>

        {/* Verbatim, and headed by where it came from rather than by what it
            is. The server sends one of two sentences here — the operator's
            reason, or a generic line when an older suspension was recorded
            without one — and this screen cannot tell which it is holding. "Why"
            over the second one would be a heading promising an answer the words
            beneath it do not contain, so the heading says what is certain: this
            is what Lampose said when the app last asked. */}
        {notice ? (
          <View style={styles.card}>
            <Text variant="eyebrow" color="tertiary">
              What Lampose said
            </Text>
            <Text variant="bodyLg" style={{ marginTop: space[2] }}>
              {notice}
            </Text>
            <Text variant="caption" color="tertiary" style={{ marginTop: space[3] }}>
              If that does not say what needs to change, support has the account in front of
              them and can.
            </Text>
          </View>
        ) : (
          /* No promise about when, no invented reference number, and no guess
             at a cause. Nothing has been heard back yet — usually because this
             handset has not reached the server since it opened — and the honest
             thing is to say so. Support has the account in front of them and
             this screen does not. */
          <View style={styles.card}>
            <Text variant="body" color="secondary">
              The reason has not reached this app. Support can tell you what happened and what
              needs to change.
            </Text>
          </View>
        )}

        <Btn label="Talk to support" glyph="support" onPress={() => router.push("/support")} />
        <Btn label="Log out" variant="ghost" glyph="logout" onPress={() => setOverlay("logout")} />
      </ScrollView>

      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter + space[2], paddingTop: space[8], paddingBottom: space[8], gap: space[3] },
  centered: { textAlign: "center" },
  mark: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.danger.base,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: space[2],
  },
  card: {
    marginTop: space[2],
    marginBottom: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
});
