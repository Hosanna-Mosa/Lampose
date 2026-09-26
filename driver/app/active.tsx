import { router } from "expo-router";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, IconBtn, MapPanel, Notice, Sheet, StepBars, Text, Toast, TopBar } from "@/components/ui";
import { CollectPayment, collectReady, type CollectState } from "@/components/CollectPayment";
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
  const openUpiQr = useDriverStore((s) => s.openUpiQr);
  const checkCollection = useDriverStore((s) => s.checkCollection);
  const fetchActiveJob = useDriverStore((s) => s.fetchActiveJob);
  const pushLocation = useDriverStore((s) => s.pushLocation);
  const jobEndedNote = useDriverStore((s) => s.jobEndedNote);
  const clearJobEndedNote = useDriverStore((s) => s.clearJobEndedNote);

  const scrollRef = useRef<ScrollView>(null);

  /*
   * True while the rider is typing a hand-over code, and the map is taken off
   * the screen for exactly that long.
   *
   * On Android the Google map redraws continuously on this screen — the pulse
   * marker is a JS-driven loop with `tracksViewChanges`, the camera re-fits on
   * every GPS fix and the rider marker turns with the compass — and those
   * native redraws pull focus off the code field: the keypad opens and closes
   * again before a digit can be typed. The rider is standing at the counter or
   * the door at this point, so the map is not what they need, and it comes
   * back the moment the field loses focus.
   */
  const [typing, setTyping] = useState(false);

  /* Cash or UPI at the door, and the "I have the cash" tick. Reset for each
     order: a tick left over from the last door is money nobody counted. */
  const [collect, setCollect] = useState<CollectState>({ method: null, cashConfirmed: false });
  const jobNumber = job?.orderNumber;
  useEffect(() => {
    setCollect({ method: null, cashConfirmed: false });
  }, [jobNumber]);

  /* The order total, kept once seen: `collectAmount` drops to 0 the moment
     the diner pays, and "Paid by UPI · ₹0" would read as nothing received. */
  const totalRef = useRef<{ order?: string; amount: number }>({ amount: 0 });
  if (job && job.collectAmount > 0) totalRef.current = { order: job.orderNumber, amount: job.collectAmount };
  const collectTotal =
    job && totalRef.current.order === job.orderNumber ? totalRef.current.amount : job?.collectAmount ?? 0;

  /* A cash-on-delivery order at the door — the payment card shows, and
     Delivered waits for it. */
  const collecting = !!job && job.paymentMode === "cod" && job.status === "picked_up";
  const paidByUpi = !!job && job.paymentStatus === "paid" && job.collection?.method === "upi_qr";
  const payReady = !collecting || collectReady(collect, paidByUpi).ready;

  /* The code field sits under the map, the stops and the item list, so the
     keypad opening covers it and the button beneath it. Bring both into view
     once the keyboard has taken its space. Stable, so `CodeEntry` below never
     re-renders because of them. */
  const onCodeFocus = useCallback(() => {
    setTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);
  }, []);

  /* And again once the keypad has actually finished opening — on Android its
     height is only known then, and scrolling earlier lands the field exactly
     where the keys are about to be. */
  useEffect(() => {
    if (!typing) return;
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    });
    return () => sub.remove();
  }, [typing]);
  const onCodeBlur = useCallback(() => setTyping(false), []);

  /* `CodeEntry` is handed a submit function that never changes identity and
     always calls the latest `onAdvance` — see the note on `CodeEntry`. */
  const advanceRef = useRef<(code: string) => Promise<boolean>>(async () => false);
  const submitCode = useCallback((code: string) => advanceRef.current(code), []);

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
  const onAdvance = async (code: string): Promise<boolean> => {
    const wanted = stage >= 3 ? "delivered" : "picked_up";

    if (wanted === "picked_up" && !readyToCollect) {
      say("The kitchen has not marked this order ready yet.");
      return false;
    }
    if (code.length !== 4) {
      say(
        wanted === "picked_up"
          ? "Ask the restaurant for the 4-digit pickup code."
          : "Ask the customer for their 4-digit PIN.",
      );
      return false;
    }

    /* The money first, on a cash-on-delivery order — see `CollectPayment`. */
    const pay = wanted === "delivered" && collecting ? collectReady(collect, paidByUpi) : null;
    if (pay && !pay.ready) {
      say(
        collect.method === "cash"
          ? `Tick the box once you have ₹${collectTotal} in cash.`
          : collect.method === "upi"
            ? "Wait for the QR to show Paid before delivering."
            : `Collect ₹${collectTotal} first — choose Cash or UPI.`,
      );
      return false;
    }

    Keyboard.dismiss();
    try {
      if (wanted === "delivered") leaving.current = true;
      await advanceJob(wanted, code, pay?.send);
      if (wanted === "delivered") router.replace("/complete");
      return true;
    } catch (err) {
      /* Released again: the hand-over was refused, the job is still in hand,
         and a guard left standing would suppress the redirect the rider needs
         if the order really does go away later. */
      leaving.current = false;
      const payload = (err as { payload?: { message?: string; code?: string } } | null)?.payload;
      say(payload?.message || (err as Error)?.message || "That did not go through.");
      /* The server found a UPI payment the screen had not shown yet. Read it,
         so the card flips to "Paid by UPI" instead of still offering cash. */
      if (payload?.code === "ALREADY_PAID_BY_UPI" || payload?.code === "PAYMENT_PENDING") {
        checkCollection().catch(() => {});
      }
      return false;
    }
  };
  advanceRef.current = onAdvance;

  return (
    /* `padding` on Android too. Expo SDK 54 draws the app edge-to-edge, and
       under edge-to-edge the manifest's `adjustResize` no longer shrinks the
       window for the keypad — so without this the screen keeps its full
       height, the keys sit on top of the code field and the button, and there
       is nothing left to scroll them up into. */
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <TopBar
        back="Home"
        onBack={() => router.replace("/")}
        title={`Order ${job.orderNumber}`}
        action="Help"
        onAction={() => router.push("/support")}
      />

      {/* `handled`: without it the first tap on the hand-over button while the
          keypad is open only closes the keypad, and the rider at the counter
          sees a button that does nothing. */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: space[6] }}
      >
        {/* Real coordinates, not a placeholder: the rider's own GPS against
            the two ends of the order. The distance under it is measured from
            those, so it keeps up as they ride rather than freezing at whatever
            the dispatcher computed when it made the offer. */}
        {!typing && (
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
        )}

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

          {/* ── The money, on a cash-on-delivery order ──────────────── */}
          {collecting && (
            <CollectPayment
              amount={collectTotal}
              paid={job.paymentStatus === "paid"}
              collection={job.collection}
              state={collect}
              onChange={setCollect}
              openUpiQr={openUpiQr}
              checkCollection={checkCollection}
            />
          )}

          {/* ── The hand-over code ───────────────────────────────────── */}
          {/* Keyed on the leg so the pickup code never carries over into the
              delivery PIN field. */}
          <CodeEntry
            key={pickedUp ? "drop" : "pickup"}
            pickedUp={pickedUp}
            open={(readyToCollect || pickedUp) && stage < 4}
            payReady={payReady}
            busy={busy}
            onSubmit={submitCode}
            onFocus={onCodeFocus}
            onBlur={onCodeBlur}
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
    </KeyboardAvoidingView>
  );
}

/**
 * The hand-over code field and the button that sends it.
 *
 * Its own memoised component, holding its own digits, for one reason: the
 * screen above re-renders several times a second — the compass moves
 * `heading` on every tick, GPS moves `location` — and while the code field
 * lived inline it was re-rendered with every one of them. On Android (new
 * architecture) a controlled input re-rendered that often while it is taking
 * focus drops the focus again: the keypad flashes up and away and not one
 * digit can be typed, at the counter or at the door. Every prop here is a
 * primitive or a stable callback, so a compass tick no longer reaches it.
 */
const CodeEntry = memo(function CodeEntry({
  pickedUp,
  open,
  payReady,
  busy,
  onSubmit,
  onFocus,
  onBlur,
}: {
  pickedUp: boolean;
  /** Whether a code can be taken yet — false while the kitchen is cooking. */
  open: boolean;
  /** False while a cash-on-delivery order has not been collected for. */
  payReady: boolean;
  busy: boolean;
  onSubmit: (code: string) => Promise<boolean>;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const [code, setCode] = useState("");

  /* A number pad has no Done key on iOS. Four digits is a complete code, so
     the keypad gets out of the way on its own and the button is reachable. */
  const onChange = (v: string) => {
    const next = v.replace(/\D/g, "").slice(0, 4);
    setCode(next);
    if (next.length === 4) Keyboard.dismiss();
  };

  const submit = async () => {
    if (await onSubmit(code)) setCode("");
  };

  return (
    <>
      {open && (
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
            onChangeText={onChange}
            onFocus={onFocus}
            onBlur={onBlur}
            keyboardType="number-pad"
            returnKeyType="done"
            placeholder="••••"
            placeholderTextColor={colors.textTertiary}
          />
        </View>
      )}

      <Btn
        label={
          busy
            ? "One moment…"
            : pickedUp && !payReady
              ? "Collect the payment first"
              : pickedUp
                ? "Delivered · enter the PIN"
                : open
                  ? "Collected · enter the code"
                  : "Waiting for the kitchen"
        }
        large
        glyph="check"
        /* Not disabled while the payment is outstanding: a tap says what is
           missing, where a greyed-out button would leave a rider guessing. */
        variant={pickedUp && !payReady ? "ghost" : undefined}
        disabled={busy || !open}
        onPress={submit}
      />
    </>
  );
});

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
