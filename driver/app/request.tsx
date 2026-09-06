import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { StatCard } from "@/app/(tabs)/index";
import { Btn, Notice, Text, TopBar } from "@/components/ui";
import { dropKm, pickupEtaMinutes, pickupKm, restaurantLabel, useDriverStore } from "@/store/driverStore";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

/**
 * One offer, two numbers, one dominant action — and no countdown any more.
 *
 * Dispatch used to hold one rider at a time and this screen's whole shape
 * came from that: a fifteen-second clock, an "expiring" colour flip, an
 * expired card. All of that assumed there was a queue behind this rider that
 * a timeout existed to protect. There is not, now — every rider within
 * reach of the kitchen's prep-time quote is offered the same job together,
 * and whoever accepts first gets it (see `foodDispatch.service.js`'s own
 * header). Rushing THIS rider with a clock made sense when the next one was
 * waiting their turn; it does not when the next one is looking at the exact
 * same offer right now.
 *
 * What replaces the countdown is `readyAt` — the fact a rider actually needs
 * to decide when to leave, not a number of seconds they need to decide
 * before.
 *
 * ## What is NOT shown before accepting
 *
 * The diner's name, their phone number and the full door address. The server
 * withholds all three from an offer and sends them on acceptance — a rider who
 * has not taken the job has no business holding a stranger's address.
 *
 * ## "This offer is gone" is still possible, just not on a clock
 *
 * Somebody else can still win the race, decline can still close it, and the
 * order can still be cancelled out from under it. Those arrive as `offer`
 * turning null (the effect below sends the rider back when that happens) or
 * as the server's own refusal the moment Accept is actually tapped — see
 * `onAccept`'s catch. Neither needs a local "expired" state to represent.
 */
export default function RequestScreen() {
  const say = useFlowStore((s) => s.say);
  const offer = useDriverStore((s) => s.offer);
  const acceptOffer = useDriverStore((s) => s.acceptOffer);
  const declineOffer = useDriverStore((s) => s.declineOffer);
  const busy = useDriverStore((s) => s.busy);

  /*
    The offer being cleared from under this screen is the ORDINARY case: the
    order was taken, declined away, or cancelled. Going back rather than
    showing a dead-end card avoids stranding a rider on a screen with the
    next offer already arriving.

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

  const km = pickupKm(offer);
  const etaMin = pickupEtaMinutes(offer);
  const tripKm = dropKm(offer);
  const readyBy = readyByLabel(offer.readyAt);

  const onAccept = async () => {
    leaving.current = true;
    try {
      const job = await acceptOffer();
      say(`Order accepted · ${job.orderNumber}`);
      router.replace("/active");
    } catch (err) {
      /* The server's own words. "Another rider took this one" and "that
         order was cancelled" feel very different to a rider, and one
         message for both is how they come to believe the button is broken. */
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
      <TopBar title="New delivery request" subtitle={offer.orderNumber} />

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
              Ready by
            </Text>
            <Text
              variant="codeHero"
              adjustsFontSizeToFit
              numberOfLines={1}
              style={{ marginTop: space[1] }}
            >
              {readyBy}
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
                  {pickupEyebrow(km, etaMin)}
                </Text>
                {/* The restaurant's NAME, through the one selector that knows
                    to fall back. This heading used to render the raw
                    `restaurantId` — FP-9C4A21B8 — on the single screen in the
                    app with a decision attached to it, so the one fact a
                    rider needs to judge an offer, which shutter in the
                    market they would be riding to, was the one fact it did
                    not give them. */}
                <Text variant="display2" numberOfLines={2}>
                  {restaurantLabel(offer)}
                </Text>
                {/* The kitchen's own address, not just its name — a rider who
                    has never collected from this one before is otherwise
                    told WHO to ride to but not WHERE, and finds out only
                    once they are already close enough for the map to fill
                    in the gap. Omitted rather than a placeholder when the
                    restaurant profile never recorded one. */}
                {offer.restaurant?.address ? (
                  <Text variant="caption" color="tertiary" numberOfLines={2}>
                    {offer.restaurant.address}
                  </Text>
                ) : null}
                <Text variant="caption" color="tertiary">
                  {offer.itemCount} item{offer.itemCount === 1 ? "" : "s"} to collect
                </Text>
              </View>
              <View style={{ gap: 2 }}>
                <Text variant="eyebrow" color="tertiary">
                  {dropEyebrow(tripKm)}
                </Text>
                {/* The full address, not a fragment — the server sends it in
                    full before the job is even accepted now, so a rider can
                    judge a delivery against their own route, not just its
                    distance from the kitchen. Only the diner's NAME and
                    PHONE number still wait for accept. */}
                <Text variant="display2" numberOfLines={2}>
                  {offer.drop.address || "Nearby"}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Trip facts ───────────────────────────────────────────────── */}
        <View style={styles.statGrid}>
          <StatCard
            label="To pickup"
            value={km === null ? "—" : etaMin === null ? `${km} km` : `${km} km · ~${etaMin} min`}
          />
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
      </ScrollView>
    </View>
  );
}

/**
 * "8:45 PM", in the rider's own device time — never a UTC string, never a
 * guess. "—" when the kitchen gave no quote at all: there is genuinely
 * nothing to show, and a placeholder time would read as a real one.
 */
function readyByLabel(readyAt?: string | null): string {
  if (!readyAt) return "—";
  const date = new Date(readyAt);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * "Pick up · 1.3 km · ~4 min away" — and every shorter version of it an
 * older server, or one that never measured either number, can still send.
 *
 * `~` on the minutes and never on the kilometres: distance is measured
 * (straight-line, but real), while the minutes are `foodDispatch.service.js`'s
 * own planning estimate — the same number the offer itself was paced
 * against, not a routed ETA. Marking it a guess here is the same honesty
 * rule the delivery map already applies to distance shown to a diner.
 */
function pickupEyebrow(km: number | null, etaMin: number | null): string {
  if (km === null && etaMin === null) return "Pick up";
  if (km === null) return `Pick up · ~${etaMin} min away`;
  if (etaMin === null) return `Pick up · ${km} km away`;
  return `Pick up · ${km} km · ~${etaMin} min away`;
}

/**
 * "Drop · 2.3 km" — the kitchen-to-door leg, alongside the pickup leg above
 * it. No `~` here: unlike the pickup ETA this is not `foodDispatch.service.js`'s
 * planning estimate, it is the same measured straight-line distance
 * `pickupKm` already shows without one. Just "Drop" when either pin is
 * missing — an older order, or one placed before a delivery pin was
 * required — same honesty rule as `pickupEyebrow`.
 */
function dropEyebrow(km: number | null): string {
  return km === null ? "Drop" : `Drop · ${km} km`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingTop: space[4], paddingBottom: space[6], gap: space[4] },

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
});
