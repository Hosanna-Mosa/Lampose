import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { StatCard } from "@/app/(tabs)/index";
import { Bar, Btn, Chip, Icon, Notice, Text, TopBar } from "@/components/ui";
import { pickupKm, restaurantLabel, useDriverStore } from "@/store/driverStore";
import { useFlowStore, REQUEST_SECONDS } from "@/store/flowStore";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

/**
 * Fifteen seconds, two numbers, one dominant action.
 *
 * The offer on this screen is REAL: it came from the dispatcher over the
 * socket (or the poll fallback), it is being held for this rider alone, and
 * when the clock runs out the server passes it to the next rider whether or
 * not this screen is still open. So the countdown is derived from the
 * deadline the store recorded — `expiresAt` — rather than counted down from
 * fifteen. A rider who opens the app four seconds into an offer sees eleven,
 * which is the truth; a fresh fifteen would be a promise the server will not
 * keep.
 *
 * The countdown and its bar both flip to the danger tone under 11 seconds, and
 * the eyebrow changes wording at the same moment, so the urgency is not
 * carried by the colour alone.
 *
 * ## What is NOT shown before accepting
 *
 * The diner's name, their phone number and the full door address. The server
 * withholds all three from an offer and sends them on acceptance — a rider who
 * has not taken the job has no business holding a stranger's address, and
 * fifteen seconds of it on a screen is fifteen seconds too many.
 */
export default function RequestScreen() {
  const say = useFlowStore((s) => s.say);
  const offer = useDriverStore((s) => s.offer);
  const acceptOffer = useDriverStore((s) => s.acceptOffer);
  const declineOffer = useDriverStore((s) => s.declineOffer);
  const busy = useDriverStore((s) => s.busy);

  /* Seconds left, recomputed from the deadline on every tick rather than
     decremented — a screen that was backgrounded for five seconds comes back
     with the right number instead of five seconds of credit it never had. */
  const [left, setLeft] = useState(() => secondsLeft(offer?.expiresAt));

  useEffect(() => {
    setLeft(secondsLeft(offer?.expiresAt));
    if (!offer) return;
    const timer = setInterval(() => setLeft(secondsLeft(offer.expiresAt)), 250);
    return () => clearInterval(timer);
  }, [offer]);

  /*
    The offer being cleared from under this screen is the ORDINARY case: the
    server passed it on, or the diner cancelled. Going back rather than showing
    an "expired" card avoids stranding a rider on a dead screen with the next
    offer already arriving.

    `leaving` is what keeps this from fighting the two handlers below. Accepting
    clears the offer AND navigates, and without the guard this effect would fire
    a `back()` on the next commit — popping the rider straight off the job they
    had just taken.
  */
  const leaving = useRef(false);

  useEffect(() => {
    if (offer || leaving.current) return;
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [offer]);

  if (!offer) {
    return (
      <View style={styles.root}>
        <TopBar title="No open request" back="Home" onBack={() => router.replace("/")} />
      </View>
    );
  }

  const expired = left <= 0;
  const urgent = left < 11;
  const toneName = expired || urgent ? "danger" : "success";
  const t = resolveTone(toneName);
  const km = pickupKm(offer);

  const onAccept = async () => {
    leaving.current = true;
    try {
      const job = await acceptOffer();
      say(`Order accepted · ${job.orderNumber}`);
      router.replace("/active");
    } catch (err) {
      /* The server's own words. "Another rider took this one" and "that offer
         has expired" feel very different to a rider, and one message for both
         is how they come to believe the button is broken. */
      const payload = (err as { payload?: { message?: string } } | null)?.payload;
      say(payload?.message || (err as Error)?.message || "That one got away.");
      router.replace("/");
    }
  };

  const onDecline = async () => {
    leaving.current = true;
    say("Declined. Looking for the next order.");
    router.replace("/");
    /* Not awaited before navigating. The rider has already decided; a spinner
       over a job they no longer want is the app arguing with them, and the
       server records the decline either way. */
    await declineOffer("Declined by the rider");
  };

  return (
    <View style={styles.root}>
      {/*
        The countdown IS the header here. Pinning it is not consistency for
        its own sake: this screen is a fifteen-second decision, and a rider who
        has scrolled down to read the drop address must still be able to see
        how long is left without scrolling back up.
      */}
      <TopBar
        title={expired ? "Expired" : urgent ? "Request expiring" : "New delivery request"}
        subtitle={offer.orderNumber}
        right={<Chip label={`${left}s`} tone={toneName} glyph={expired ? "close" : "clock"} />}
      />
      <Bar
        pct={Math.round((left / REQUEST_SECONDS) * 100)}
        tone={t.base}
        height={4}
        track={colors.surface}
        style={styles.countdownBar}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── The two numbers that matter ──────────────────────────────── */}
        <View style={styles.figures}>
          <View style={styles.figureCell}>
            <Text variant="eyebrow" color="tertiary">
              You earn
            </Text>
            <Text variant="codeHero" adjustsFontSizeToFit numberOfLines={1} style={{ marginTop: space[1] }}>
              ₹{offer.earnings}
            </Text>
          </View>
          <View style={[styles.figureCell, { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
            <Text variant="eyebrow" color="tertiary">
              Time left
            </Text>
            <Text
              variant="codeHero"
              adjustsFontSizeToFit
              numberOfLines={1}
              style={{ marginTop: space[1], color: t.ink }}
            >
              {left}s
            </Text>
          </View>
        </View>

        {/* ── Route ────────────────────────────────────────────────────── */}
        <View style={styles.routeCard}>
          <View style={{ flexDirection: "row", gap: space[3] }}>
            <View style={styles.rail}>
              <View style={styles.railRing} />
              <View style={styles.railLine} />
              <View style={styles.railDot} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: space[5] }}>
              <View style={{ gap: 2 }}>
                <Text variant="eyebrow" color="tertiary">
                  {km === null ? "Pick up" : `Pick up · ${km} km away`}
                </Text>
                {/* The restaurant's NAME, through the one selector that knows
                    to fall back. This heading used to render the raw
                    `restaurantId` — FP-9C4A21B8 — on the single screen in the
                    app with a fifteen-second decision attached to it, so the
                    one fact a rider needs to judge an offer, which shutter in
                    the market they would be riding to, was the one fact it did
                    not give them. */}
                <Text variant="display2" numberOfLines={2}>
                  {restaurantLabel(offer)}
                </Text>
                <Text variant="caption" color="tertiary">
                  {offer.itemCount} item{offer.itemCount === 1 ? "" : "s"} to collect
                </Text>
              </View>
              <View style={{ gap: 2 }}>
                <Text variant="eyebrow" color="tertiary">
                  Drop
                </Text>
                <Text variant="display2" numberOfLines={2}>
                  {offer.drop.address || "Nearby"}
                </Text>
                {/* Said out loud rather than left as a surprise. The server
                    withholds the door until the job is taken, and a rider who
                    is not told that reads the short line as a bad address. */}
                <Text variant="caption" color="tertiary">
                  Exact address after you accept
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Trip facts ───────────────────────────────────────────────── */}
        <View style={styles.statGrid}>
          <StatCard label="To pickup" value={km === null ? "—" : `${km} km`} />
          <StatCard label="Items" value={String(offer.itemCount)} />
          <StatCard
            label={offer.collectAmount > 0 ? "Collect" : "Payment"}
            value={offer.collectAmount > 0 ? `₹${offer.collectAmount}` : "Prepaid"}
          />
        </View>

        {/* ── What is being carried ────────────────────────────────────── */}
        {offer.lines.length > 0 && (
          <Notice
            tone="info"
            glyph="info"
            title="What you are collecting"
            body={offer.lines
              .map((line) => `${line.quantity}× ${line.productName}`)
              .join(" · ")}
          />
        )}

        {/* Cash is the one thing worth interrupting the layout for: a rider who
            reaches the door without knowing they were meant to collect money
            has to ring somebody. */}
        {offer.collectAmount > 0 && (
          <Notice
            tone="warning"
            glyph="alert"
            title={`Collect ₹${offer.collectAmount} in cash`}
            body="The customer pays at the door. Carry change."
          />
        )}

        {/* ── Decision ─────────────────────────────────────────────────── */}
        {!expired && (
          <View style={{ gap: space[2] }}>
            <Btn
              label={busy ? "Accepting…" : `Accept · ₹${offer.earnings}`}
              large
              glyph="check"
              disabled={busy}
              onPress={onAccept}
            />
            <Btn label="Decline" variant="ghost" disabled={busy} onPress={onDecline} />
          </View>
        )}

        {expired && (
          <View style={{ gap: space[3] }}>
            <View style={styles.expiredCard}>
              <View style={styles.expiredMark}>
                <Icon name="close" size={22} color={colors.danger.on} strokeWidth={2} />
              </View>
              <Text variant="display2">Request expired</Text>
              <Text variant="caption" color="secondary" style={{ textAlign: "center" }}>
                It went to another partner. Missing requests lowers your acceptance rate.
              </Text>
            </View>
            <Btn label="Back to searching" glyph="refresh" onPress={() => router.replace("/")} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Whole seconds left against a wall-clock deadline.
 *
 * Clamped at zero rather than allowed to go negative: the server has already
 * moved on by then, and a screen counting down past zero is a screen promising
 * something that cannot happen.
 */
function secondsLeft(expiresAt?: number): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingTop: space[4], paddingBottom: space[6], gap: space[4] },

  countdownBar: { borderRadius: 0 },

  figures: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  figureCell: { flex: 1, paddingVertical: space[4], paddingHorizontal: space[4], gap: space[1] },

  routeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
  rail: { width: 12, paddingTop: 14, alignItems: "center" },
  railRing: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    borderWidth: 2.5,
    borderColor: colors.brand,
  },
  railLine: { flex: 1, width: 1.5, minHeight: 36, backgroundColor: colors.border, marginVertical: 3 },
  railDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.graphite },

  statGrid: { flexDirection: "row", gap: space[2] },

  expiredCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger.border,
    backgroundColor: colors.danger.tint,
    borderRadius: radius.card,
    padding: space[5],
    alignItems: "center",
    gap: space[2],
  },
  expiredMark: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.danger.base,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[1],
  },
});
