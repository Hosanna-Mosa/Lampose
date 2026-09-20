/* ══════════════════════════════════════════════════════════════════════════
   Where a partner who has applied lands, and the terminus of the flow.

   The status shown is the SERVER's, re-read on every visit. An approval
   happens in the admin console, not on this device, so anything held locally
   is only a cache of the last thing we were told — and a partner refreshing
   this screen is asking exactly that question.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Btn, Card, Chip, ConfirmSheet, DataRow, Icon, Notice, Scroller, Tappable, Text, TopBar } from "@/components/common";
import { BENEFITS, COPY } from "@/constants/partner";
import { deliverySentence } from "@/lib/money";
import { ApiError } from "@/services/api";
import { getMe } from "@/services/foodPartner";
import { usePartnerStore, type ApplicationStatus } from "@/store/partnerStore";
import { colors, layout, radius, space, tone as resolveTone, touch, type ToneName } from "@/theme";

const STAGES = ["Submitted", "Under review", "Documents verified", "Live"] as const;

const REACHED: Record<ApplicationStatus, number> = {
  none: -1,
  draft: -1,
  pending: 1,
  approved: 3,
  rejected: 1,
};

const HEADLINE: Record<ApplicationStatus, { tone: ToneName; glyph: "check" | "clock" | "alert"; head: string; sub: string }> = {
  none: { tone: "muted", glyph: "clock", head: "Nothing sent yet", sub: "Your application has not been submitted." },
  draft: { tone: "warning", glyph: "clock", head: "Half finished", sub: "Pick the application back up when you are ready." },
  pending: {
    tone: "info",
    glyph: "clock",
    head: "With our team",
    sub: "We have everything and are checking your documents. We will call if anything is unclear.",
  },
  approved: {
    tone: "success",
    glyph: "check",
    head: "You are approved",
    sub: "Your kitchen can go live. Open the dashboard to set your menu running.",
  },
  rejected: {
    tone: "danger",
    glyph: "alert",
    head: "Needs your attention",
    sub: "Something on the application has to be corrected before we can list you.",
  },
};

export function Status() {
  const insets = useSafeAreaInsets();
  const [confirmReset, setConfirmReset] = useState(false);

  const data = usePartnerStore((s) => s.data);
  const status = usePartnerStore((s) => s.status);
  const restaurantId = usePartnerStore((s) => s.restaurantId);
  const submittedAt = usePartnerStore((s) => s.submittedAt);
  const verificationNote = usePartnerStore((s) => s.verificationNote);
  const session = usePartnerStore((s) => s.session);
  const syncFromServer = usePartnerStore((s) => s.syncFromServer);
  const reset = usePartnerStore((s) => s.reset);

  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");

  /* Re-read the decision from the server. There is no local way to know that
     an administrator approved the application ten minutes ago. */
  const refresh = useCallback(async () => {
    if (!session?.token) return;
    setChecking(true);
    setCheckError("");
    try {
      const me = await getMe(session.token);
      syncFromServer({
        restaurantId: me.restaurantId,
        restaurantName: me.restaurantName,
        verificationStatus: me.verificationStatus,
        verificationNote: me.verificationNote,
      });
    } catch (err) {
      /* `getMe` — every `/me`-family call — 403s a rejected restaurant with
         this exact code (`foodPartnerAuth.middleware.js`) rather than ever
         answering with a body carrying `verificationStatus: 'rejected'`. So a
         partner who is already rejected and presses "Check for an update"
         would otherwise see this fail every single time with what reads as a
         network problem, never as the confirmation it actually is: still
         rejected, same reason. Recorded as a real status update, not an
         error, so the headline and reason stay in sync with what the server
         just said rather than only with whatever was cached at sign-in. */
      if (err instanceof ApiError && (err.payload as { code?: string })?.code === "ACCOUNT_REJECTED") {
        const data = (err.payload as { data?: { verificationStatus?: string; verificationNote?: string } })?.data;
        if (restaurantId) {
          syncFromServer({
            restaurantId,
            restaurantName: session.restaurantName,
            verificationStatus: data?.verificationStatus ?? "rejected",
            verificationNote: data?.verificationNote ?? "",
          });
        }
      } else {
        setCheckError((err as Error)?.message || "We could not reach the server.");
      }
    } finally {
      setChecking(false);
    }
  }, [session?.token, syncFromServer]);

  useEffect(() => { void refresh(); }, [refresh]);

  /* Falling back rather than indexing blind. This screen crashed once because
     a status the app did not know about reached it, and a status screen that
     cannot render is the one screen a worried partner is looking at. */
  const spec = HEADLINE[status] ?? HEADLINE.none;
  const t = resolveTone(spec.tone);
  const reached = REACHED[status] ?? -1;
  const items = data.menuCategories.flatMap((c) => c.items);

  return (
    <Box style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        back={null}
        title={data.restaurantName || "Your application"}
        subtitle={restaurantId ?? undefined}
        actionGlyph="home"
        onAction={() => router.replace("/")}
      />

      <Scroller
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space[8] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Headline ─────────────────────────────────────────────────── */}
        <Card tone={t.border} style={{ gap: space[3], backgroundColor: t.tint }}>
          <Box style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <Icon name={spec.glyph} size={20} color={t.ink} />
            <Text variant="display2" style={{ color: t.ink, flex: 1 }}>
              {spec.head}
            </Text>
          </Box>
          <Text variant="body" style={{ color: t.ink }}>
            {spec.sub}
          </Text>
          {!!submittedAt && (
            <Text variant="numMeta" style={{ color: t.ink, opacity: 0.8 }}>
              Sent {new Date(submittedAt).toLocaleDateString()} at{" "}
              {new Date(submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
        </Card>

        {status === "rejected" && !!verificationNote && (
          <Notice tone="danger" glyph="alert" title="What needs fixing" body={verificationNote} />
        )}

        {status === "approved" && (
          <Btn label="Open the dashboard" glyph="arrowRight" onPress={() => router.replace("/(dash)")} />
        )}

        {/* ── Timeline ─────────────────────────────────────────────────── */}
        <Card style={{ gap: space[3] }}>
          <Text variant="title1">Where it has got to</Text>
          {STAGES.map((stage, i) => {
            const done = i <= reached;
            const failed = status === "rejected" && i === reached;
            const mark = failed ? colors.danger.base : done ? colors.brand : colors.surfaceSunken;
            return (
              <Box key={stage} style={styles.stage}>
                <Box style={[styles.stageDot, { backgroundColor: mark }]}>
                  {done && !failed ? <Icon name="check" size={11} color={colors.onBrand} strokeWidth={3} /> : null}
                  {failed ? <Icon name="close" size={11} color={colors.danger.on} strokeWidth={3} /> : null}
                </Box>
                <Text variant={done ? "title2" : "body"} color={done ? "primary" : "tertiary"} style={{ flex: 1 }}>
                  {stage}
                </Text>
                {i === reached && !failed && <Chip label="Now" tone="brand" />}
              </Box>
            );
          })}
        </Card>

        {/* ── What was sent ────────────────────────────────────────────── */}
        <Card style={{ gap: space[1] }}>
          <Text variant="title1" style={{ marginBottom: space[1] }}>
            What you sent
          </Text>
          <DataRow first label={COPY.summaryLabel} value={data.restaurantName || "—"} tabular={false} />
          <DataRow label="Owner" value={data.ownerName || "—"} tabular={false} />
          <DataRow label="City" value={data.city || "—"} tabular={false} />
          <DataRow label="Open" value={`${data.days.length} days a week`} tabular={false} />
          <DataRow label="Menu" value={`${items.length} items`} />
          <DataRow label="Prep time" value={`${data.avgPreparationTime} min`} />
          <DataRow label="Delivers within" value={`${data.deliveryRadiusKm} km`} />
          <DataRow label="Payout account" value={`ending ${data.account.slice(-4) || "—"}`} />
        </Card>

        <Card style={{ gap: space[2] }}>
          <Text variant="title1">{BENEFITS[3].title}</Text>
          <Text variant="body" color="secondary">
            {BENEFITS[3].desc}
          </Text>
          <Text variant="caption" color="tertiary">
            {deliverySentence(data)}
          </Text>
        </Card>

        {!!checkError && <Notice tone="warning" glyph="alert" title="Could not refresh" body={checkError} />}

        <Btn
          label="Check for an update"
          variant="ghost"
          glyph="refresh"
          loading={checking}
          onPress={refresh}
        />

        <Tappable
          accessibilityRole="button"
          onPress={() => setConfirmReset(true)}
          style={{ minHeight: touch.min, justifyContent: "center", alignItems: "center" }}
        >
          <Text variant="bodyStrong" color="danger">
            Start a new application
          </Text>
        </Tappable>
      </Scroller>

      <ConfirmSheet
        visible={confirmReset}
        onDismiss={() => setConfirmReset(false)}
        onPrimary={() => {
          reset();
          setConfirmReset(false);
          router.replace("/");
        }}
        spec={{
          kicker: "Cannot be undone",
          tone: "danger",
          title: "Throw this application away?",
          body: "Everything you entered is deleted from this device, including the application already sent.",
          primary: "Delete and start again",
          secondary: "Keep it",
        }}
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  body: { padding: layout.gutter, gap: space[4] },
  stage: { flexDirection: "row", alignItems: "center", gap: space[3] },
  stageDot: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
