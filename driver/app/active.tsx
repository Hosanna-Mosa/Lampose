import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, IconBtn, MapPanel, Notice, Sheet, StepBars, Text, Toast, TopBar } from "@/components/ui";
import { STAGE_HINTS, STAGES } from "@/constants/lampose";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { useSheet } from "@/hooks/useSheet";
import {
  LOCATION_HEARTBEAT_MS,
  canCollect,
  restaurantLabel,
  selectStage,
  useDriverStore,
} from "@/store/driverStore";
import { TOTAL_STAGES, useFlowStore } from "@/store/flowStore";
import { socketService } from "@/utils/socketService";
import { colors, layout, radius, space } from "@/theme";

/**
 * The job in hand.
 *
 * The stage rail is the screen's spine, and every bar on it is derived from
 * the ORDER'S status rather than counted up locally — `selectStage`. That
 * matters more than it looks: a rider whose app is killed at the restaurant
 * counter, or who reinstalls mid-delivery, has to come back to the step they
 * are actually on, and a local counter would put them back at the start with a
 * bag of food in their hand.
 *
 * ## Two buttons, and each one needs a code somebody else is holding
 *
 * Collecting needs the kitchen's four digits; delivering needs the diner's.
 * Neither is checked here — the code is posted and the SERVER compares it
 * against that one order. A client-side check would need the delivery PIN in
 * the app, which is exactly the thing that must not be true about it.
 *
 * ## Waiting for the kitchen is a state, not an error
 *
 * A rider can arrive before the food is ready, and that is ordinary. The
 * collect button stays disabled until the order says `ready` — which arrives
 * over the socket the moment the cook taps it, so nobody has to pull to
 * refresh at the pass.
 */
export default function ActiveOrderScreen() {
  const insets = useSafeAreaInsets();
  const { toast, setOverlay, say } = useFlowStore();
  const sheet = useSheet();

  const job = useDriverStore((s) => s.currentJob);
  const busy = useDriverStore((s) => s.busy);
  const advanceJob = useDriverStore((s) => s.advanceJob);
  const fetchActiveJob = useDriverStore((s) => s.fetchActiveJob);
  const pushLocation = useDriverStore((s) => s.pushLocation);
  const jobEndedNote = useDriverStore((s) => s.jobEndedNote);
  const clearJobEndedNote = useDriverStore((s) => s.clearJobEndedNote);

  const [code, setCode] = useState("");

  const stage = selectStage(job);
  /* The two legs: to the restaurant, then to the customer. */
  const travelling = stage === 1 || stage === 3;
  const pickedUp = stage >= 3;
  const toRestaurant = !pickedUp;
  const readyToCollect = canCollect(job);

  /* The diner's map follows the rider through the order room. Relayed over
     the socket rather than posted, because this is a marker position rather
     than the fix the dispatcher matches on — see `socketService.sendLocation`. */
  const { location, heading } = useDriverLocation();

  /*
   * Heading is READ here and never depended on.
   *
   * The compass updates several times a second on a moving scooter. Listing
   * `heading` in the effect below would therefore re-run it several times a
   * second: each run fires an immediate `report()` — a PATCH of a position
   * that has not changed — and clears the fifteen-second heartbeat before it
   * has had a chance to fire, so the one beat the dispatcher relies on never
   * happens while the rider is actually riding, and the per-rider write
   * limiter is the only thing left holding the rate down.
   *
   * A ref gives the report the latest bearing without making the bearing a
   * reason to report. What is worth reporting is a new POSITION, and that is
   * what the effect still watches.
   */
  const headingRef = useRef<number | null>(null);
  headingRef.current = heading ?? null;

  useEffect(() => {
    if (!job || !location) return;

    const report = () => {
      const bearing = headingRef.current ?? undefined;
      pushLocation(location.lat, location.lng, bearing);
      socketService.sendLocation({
        orderNumber: job.orderNumber,
        lat: location.lat,
        lng: location.lng,
        heading: bearing,
      });
    };

    report();
    /* And on a heartbeat, for the reason given on `LOCATION_HEARTBEAT_MS`:
       `watchPositionAsync` is silent below five metres of movement, so a rider
       waiting at the pass or at a gate would otherwise go stale — and here
       that also freezes the marker on the diner's tracking map, which reads as
       a rider who has stopped moving rather than one who is standing still. */
    const beat = setInterval(report, LOCATION_HEARTBEAT_MS);
    return () => clearInterval(beat);
  }, [job, location, pushLocation]);

  /* One read on open, in case the kitchen moved the order while the app was
     closed and the socket event was missed. The store keeps reading it after
     that — on a slow timer and on every return to the foreground — so this
     screen never depends on the socket having stayed up. */
  useEffect(() => {
    fetchActiveJob().catch(() => {});
  }, [fetchActiveJob]);

  /* The job going away UNDER this screen — cancelled by the diner, rejected by
     the kitchen — is a real case, and standing on a dead screen is not a state
     a rider should have to work out for themselves. Neither is arriving back
     on the home screen mid-ride with no word about it, so the sentence the
     server sent with the cancellation goes with them.

     `leaving` is what stops this fighting the delivery hand-off: completing an
     order also clears the job, and without the guard this would fire on the
     next commit and pop the rider straight off their own completion screen. */
  const leaving = useRef(false);

  useEffect(() => {
    if (job || leaving.current) return;
    if (jobEndedNote) {
      say(jobEndedNote);
      clearJobEndedNote();
    }
    router.replace("/");
  }, [job, jobEndedNote, say, clearJobEndedNote]);

  if (!job) {
    return (
      <View style={styles.root}>
        <TopBar title="No active delivery" back="Home" onBack={() => router.replace("/")} />
      </View>
    );
  }

  const dial = (number: string, who: string) => {
    if (!number) {
      say(`We do not have a number for the ${who}.`);
      return;
    }
    Linking.openURL(`tel:${number}`).catch(() => say("This phone cannot place calls."));
  };

  /*
    The one button, and which hand-over it is depends on where the order is.

    Before the food is collected it is `picked_up`, gated on the KITCHEN'S
    code; after, it is `delivered`, gated on the DINER'S. Both are requests
    whose refusal is shown in the server's own words — it is the server that
    compares the code, because a client-side check would need the delivery PIN
    inside the app, which is exactly the thing that must not be true about it.
  */
  const onAdvance = async () => {
    const wanted = stage >= 3 ? "delivered" : "picked_up";

    if (wanted === "picked_up" && !readyToCollect) {
      say("The kitchen has not marked this order ready yet.");
      return;
    }
    if (code.length !== 4) {
      say(
        wanted === "picked_up"
          ? "Ask the restaurant for the 4-digit pickup code."
          : "Ask the customer for their 4-digit PIN.",
      );
      return;
    }

    try {
      if (wanted === "delivered") leaving.current = true;
      await advanceJob(wanted, code);
      setCode("");
      if (wanted === "delivered") router.replace("/complete");
    } catch (err) {
      /* Released again: the hand-over was refused, the job is still in hand,
         and a guard left standing would suppress the redirect the rider needs
         if the order really does go away later. */
      leaving.current = false;
      const payload = (err as { payload?: { message?: string } } | null)?.payload;
      say(payload?.message || (err as Error)?.message || "That did not go through.");
    }
  };

  return (
    <View style={styles.root}>
      <TopBar
        back="Home"
        onBack={() => router.replace("/")}
        title={`Order ${job.orderNumber}`}
        action="Help"
        onAction={() => router.push("/support")}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space[6] }}>
        {/* Real coordinates, not a placeholder: the rider's own GPS against
            the two ends of the order. The distance under it is measured from
            those, so it keeps up as they ride rather than freezing at whatever
            the dispatcher computed when it made the offer. */}
        <MapPanel
          height={travelling ? 252 : 168}
          kicker={toRestaurant ? "To restaurant" : "To customer"}
          target={toRestaurant ? "Restaurant" : "Customer"}
          me={location ? [location.lng, location.lat] : null}
          pickup={job.pickup.location}
          drop={job.drop.location}
          heading={heading}
          pickedUp={pickedUp}
        />

        <View style={styles.body}>
          {/* ── Where we are ─────────────────────────────────────────── */}
          <View style={styles.stageCard}>
            <View style={styles.stageHead}>
              <Chip label={`Stage ${stage + 1} of ${TOTAL_STAGES}`} tone="brand" />
              <Text variant="numMeta" color="tertiary">
                ₹{job.earnings}
                {job.collectAmount > 0 ? ` · collect ₹${job.collectAmount}` : " · prepaid"}
              </Text>
            </View>

            <Text variant="display1" style={{ marginTop: space[3] }}>
              {STAGES[stage]}
            </Text>

            <StepBars total={TOTAL_STAGES} current={stage} height={5} style={{ marginTop: space[3] }} />

            <Text variant="caption" color="secondary" style={{ marginTop: space[3] }}>
              {STAGE_HINTS[stage]}
            </Text>
          </View>

          {/* ── Stops ────────────────────────────────────────────────── */}
          <View style={styles.stopsCard}>
            <View style={styles.stopRow}>
              <View
                style={[
                  styles.stopDot,
                  pickedUp
                    ? { backgroundColor: colors.brand }
                    : { borderWidth: 2.5, borderColor: colors.brand },
                ]}
              />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="eyebrow" color="tertiary">
                  Pickup
                </Text>
                {/* The name, and the id only when the server has not sent one.
                    A rider looking for a shutter in a market cannot ride to
                    `FP-9C4A21B8`, which is what this said before the contract
                    carried the restaurant's own details. */}
                <Text variant="title1" numberOfLines={2}>
                  {restaurantLabel(job)}
                </Text>
                {!!job.restaurant?.address && (
                  <Text variant="numMeta" color="tertiary" numberOfLines={2}>
                    {job.restaurant.address}
                  </Text>
                )}
                <Text variant="numMeta" color="tertiary">
                  {readyToCollect ? "Ready for collection" : "Still being prepared"}
                </Text>
              </View>
              {/* No button at all rather than one that apologises when tapped.
                  A restaurant with no number on file is ordinary, and a dial
                  control that can only ever say "we do not have a number" is a
                  promise of a call this app cannot place. */}
              {!!job.restaurant?.phone && (
                <IconBtn
                  glyph="phone"
                  fg={colors.brandInk}
                  tone={colors.brandOnDark}
                  bg={colors.brandTint}
                  accessibilityLabel={`Call ${restaurantLabel(job)}`}
                  onPress={() => dial(job.restaurant?.phone ?? "", "restaurant")}
                />
              )}
            </View>

            <View style={[styles.stopRow, styles.stopRowDivided]}>
              <View
                style={[
                  styles.stopDot,
                  stage >= 4
                    ? { backgroundColor: colors.brand }
                    : { borderWidth: 2.5, borderColor: colors.borderInput },
                ]}
              />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="eyebrow" color="tertiary">
                  Drop
                </Text>
                <Text variant="title1" numberOfLines={2}>
                  {job.customerName || "Customer"}
                </Text>
                <Text variant="numMeta" color="tertiary">
                  {job.drop.address || "Address unavailable"}
                </Text>
              </View>
              <IconBtn
                glyph="phone"
                fg={colors.brandInk}
                tone={colors.brandOnDark}
                bg={colors.brandTint}
                accessibilityLabel="Call the customer"
                onPress={() => dial(job.customerPhone, "customer")}
              />
            </View>
          </View>

          {/* ── Items, once at the counter ───────────────────────────── */}
          {/* ── What is in the bag ───────────────────────────────────── */}
          <View style={styles.itemsCard}>
            <Text variant="eyebrow" color="tertiary">
              Order · {job.itemCount} item{job.itemCount === 1 ? "" : "s"} ·{" "}
              {job.collectAmount > 0 ? `collect ₹${job.collectAmount}` : "prepaid"}
            </Text>
            <View style={{ marginTop: space[3], gap: space[2] }}>
              {job.lines.map((line, index) => (
                <View key={`${line.productName}-${index}`} style={styles.itemRow}>
                  <Text variant="body" style={{ flex: 1 }}>
                    {line.productName}
                    {line.variantName ? ` · ${line.variantName}` : ""}
                  </Text>
                  <Text variant="priceSm" color="secondary">
                    ×{line.quantity}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Waiting for the kitchen is a state, not an error — see the
              header. Said plainly so a rider standing at the pass knows the
              disabled button is the restaurant's move, not a fault. */}
          {!pickedUp && !readyToCollect && (
            <Notice
              tone="info"
              glyph="clock"
              title="The kitchen is still cooking"
              body="Collect becomes available the moment the restaurant marks this order ready."
            />
          )}

          {/* ── The hand-over code ───────────────────────────────────── */}
          {(readyToCollect || pickedUp) && stage < 4 && (
            <View style={styles.codeCard}>
              <Text variant="eyebrow" color="tertiary">
                {pickedUp ? "Customer's 4-digit PIN" : "Restaurant's 4-digit code"}
              </Text>
              <Text variant="caption" color="secondary" style={{ marginTop: space[1] }}>
                {pickedUp
                  ? "Ask the customer to read out the PIN in their app."
                  : "Ask at the counter. It is on the kitchen's order screen."}
              </Text>
              <TextInput
                style={styles.codeInput}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="••••"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          )}

          <Btn
            label={
              busy
                ? "One moment…"
                : pickedUp
                  ? "Delivered · enter the PIN"
                  : readyToCollect
                    ? "Collected · enter the code"
                    : "Waiting for the kitchen"
            }
            large
            glyph="check"
            disabled={busy || (!pickedUp && !readyToCollect)}
            onPress={onAdvance}
          />

          <View style={styles.secondaryRow}>
            <Btn
              label="Report problem"
              variant="quiet"
              onPress={() => setOverlay("problem")}
              style={{ flex: 1 }}
            />
            {/* Wording matters: this hands the order back to the dispatcher so
                another rider can carry it. It is not a cancellation — the diner
                has paid and the food exists — and calling it one is how a
                rider comes to avoid the only button that helps them. */}
            <Btn
              label="Give back"
              variant="danger"
              disabled={pickedUp}
              onPress={() => setOverlay("cancel")}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.gutter, paddingTop: space[4], gap: space[3] },

  stageCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
  stageHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[2] },

  stopsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  stopRow: { padding: space[3], flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  stopRowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  stopDot: { width: 11, height: 11, borderRadius: radius.pill, marginTop: 6 },

  itemsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] },

  codeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
  /* Martian Mono carries every figure in this app, and four digits read out
     across a noisy counter is precisely what the mono scale is for. */
  codeInput: {
    marginTop: space[3],
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    borderRadius: radius.button,
    height: 56,
    textAlign: "center",
    fontSize: 24,
    letterSpacing: 10,
    color: colors.textPrimary,
  },

  secondaryRow: { flexDirection: "row", gap: space[2] },
});
