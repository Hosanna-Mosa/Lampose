/* ══════════════════════════════════════════════════════════════════════════
   A new order, slid up in front of whatever the kitchen was doing.

   Registered with `animation: "slide_from_bottom"` rather than a library
   sheet, so it reads as a sheet, keeps the back gesture, and needs no new
   dependency. `orderPump` pushes it the moment an order lands, from the root
   layout, so it arrives whichever tab is open.

   ## Accept lives here now, because the rider search waits on it

   This used to be a pure intimation — "Okay" and nothing else, on the
   reasoning that the Orders tab already carried the whole accept/reject
   exchange and asking twice was two places one order could be answered.
   That stopped being the right trade once dispatch changed: a rider is no
   longer searched for at all until the kitchen accepts AND quotes a prep
   time (see `foodDispatch.service.js`'s own header) — so the two-step
   "see the ticket here, then separately go accept it on Orders" cost every
   order the time between those two taps, which is now time a rider is not
   even being looked for. Accepting from the ticket that just rang removes
   that gap entirely.

   Rejecting still does NOT live here. A refusal ends the order and starts a
   refund — the Orders tab is still the one place for that, deliberately
   slower to reach than a single tap, for the same reason it always was.

   Accepting also NAVIGATES, on purpose — see `accept`. The next thing a
   kitchen actually does with an accepted order is start cooking it, and that
   button lives on the Orders tab, not here; landing there instead of just
   closing the sheet is one tap fewer between "I'll take it" and the stove.

   ## `partnerPayout`, not `grandTotal`, is the number that matters

   The diner's total includes delivery and packaging, which are not the
   kitchen's. Both are shown, with the payout given the emphasis, because
   what a kitchen is being told about is what it nets.

   ## Cash is called out

   On a COD order the rider collects, and the kitchen is owed by Lampose
   rather than by the person at the door. Saying so on the ticket stops a
   counter asking a rider for money they are not carrying.

   ## Closing without accepting still counts as seen, not answered

   The "Close" in the top bar and the back gesture both reach the same
   cleanup as before, which tells `orderPump` this order was shown — not
   recorded anywhere the server can see, only enough that the sheet does not
   slide back up over the same ticket the moment another one arrives. An
   order dismissed that way sits exactly where it was, unaccepted, reachable
   from Orders. Accepting is the one path that is NOT just "seen" — it is a
   real write, same as the Orders tab's own Accept button.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Btn, Card, Chip, ChoiceChip, Text, TopBar } from "@/components/ui";
import { Note } from "@/components/form";
import { usePartnerStore } from "@/store/partnerStore";
import { getMe, listMyOrders, setOrderStatus, type ServerOrder } from "@/services/foodPartner";
import { acknowledgeOrder, isAcknowledged, lastArrival, onQueueChanged, setSheetOpen } from "@/services/orderPump";
import { colors, layout, radius, space } from "@/theme";

const rupees = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/*
 * The times a counter actually says.
 *
 * A list rather than free text, because the person answering has their hands
 * full — see the same reasoning on `(dash)/orders.tsx`, which this mirrors
 * exactly so a kitchen answering from either screen is offered the same
 * choices in the same order.
 */
const PREP_MINUTES = [15, 20, 30, 45];

/** The kitchen's own standing preparation time, offered alongside the presets. */
const prepChoices = (standing: number | null) => {
  const all = standing && standing > 0 ? [...PREP_MINUTES, Math.round(standing)] : PREP_MINUTES;
  return Array.from(new Set(all)).sort((a, b) => a - b);
};

export default function NewOrderScreen() {
  const insets = useSafeAreaInsets();
  const session = usePartnerStore((s) => s.session);

  const [order, setOrder] = useState<ServerOrder | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* Accepting, and the quote that travels with it — see `(dash)/orders.tsx`
     for why a time always goes with an accept rather than only sometimes. */
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [standingPrep, setStandingPrep] = useState<number | null>(null);
  const [prepMinutes, setPrepMinutes] = useState<number | null>(null);

  /* The restaurant's own standing figure, read once — the same default
     `(dash)/orders.tsx` pre-selects, so a kitchen that does not want to think
     about it gets its usual answer whichever screen it accepts from. */
  useEffect(() => {
    if (!session?.token) return;
    let dropped = false;
    getMe(session.token)
      .then((me) => {
        if (!dropped) setStandingPrep(Number(me?.avgPreparationTime) || null);
      })
      .catch(() => {
        /* No default pre-selected is a tap, not a failure worth showing. */
      });
    return () => {
      dropped = true;
    };
  }, [session?.token]);

  /**
   * The oldest UNSEEN order, not the newest and not the oldest overall.
   *
   * A kitchen with three tickets should work through them in the order they
   * were placed, so the newest is wrong; one already closed with "Okay" is
   * wrong too, or the sheet would hand back the very ticket the kitchen just
   * told it they had seen. `lastArrival()` is preferred only when it is both
   * still in the queue and not yet acknowledged, so the sheet opens on the
   * ticket that actually rang.
   */
  const load = useCallback(async () => {
    if (!session?.token) {
      setLoading(false);
      setError("You are signed out. Sign in again to see new orders.");
      return;
    }
    setError("");
    try {
      const page = await listMyOrders(session.token, "placed");
      const rows = page.data || [];
      setWaiting(rows.length);

      const unseen = rows.filter((row) => !isAcknowledged(row.orderNumber));
      const rang = lastArrival();
      setOrder(unseen.find((row) => row.orderNumber === rang) ?? unseen[unseen.length - 1] ?? null);
    } catch (err) {
      setError((err as Error)?.message || "We could not load the order.");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    void load();
  }, [load]);

  /* The pump only pushes this sheet when none is showing, and this is what
     tells it. Cleared on unmount, so it is released whichever way the sheet
     left — "Okay", the back gesture or the close control. */
  useEffect(() => {
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, []);

  /* What closing the sheet marks as seen, whichever way it happens. A ref
     rather than the `order` state itself, because the cleanup below runs
     after this component has already rendered its last frame and can only
     read a ref, not a state variable from that final render. Kept in step
     with `order` on every change, including the in-place refresh below, so
     what gets marked seen is whatever was actually on screen when the sheet
     closed — not necessarily the ticket it first opened on. */
  const shownRef = useRef<string | null>(null);
  useEffect(() => {
    shownRef.current = order?.orderNumber ?? null;
    /* A new ticket on screen starts its own quote and its own error state —
       a selection or a failure left over from the last one has nothing to
       do with this one. */
    setPrepMinutes(null);
    setAcceptError("");
  }, [order]);
  useEffect(() => {
    return () => acknowledgeOrder(shownRef.current);
  }, []);

  /* Another order landing while this is open refreshes it in place rather
     than stacking a second sheet — the pump pushes only when none is
     showing. The order this sheet opened on is not marked seen by that; only
     actually closing the sheet does. */
  useEffect(() => onQueueChanged(() => void load()), [load]);

  const close = () => router.back();

  /*
   * Accepting sends whatever time is selected, defaulting to the standing
   * figure exactly like `(dash)/orders.tsx` — the diner's tracking screen and
   * the rider search both need a number, and the only case that travels
   * without one is a restaurant whose own standing figure could not be read
   * either, because the alternative is this screen inventing a promise on
   * the kitchen's behalf.
   */
  const accept = async () => {
    if (!order || !session?.token) return;
    const minutes = prepMinutes ?? standingPrep ?? 0;
    setAccepting(true);
    setAcceptError("");
    try {
      await setOrderStatus(
        session.token,
        order.orderNumber,
        "accepted",
        minutes > 0 ? { promisedMinutes: minutes } : undefined,
      );
      /* Not `close()` — accepting is the one path off this sheet that is not
         "seen and dismissed", it is a real step in the order's life, and the
         next one is standing at the stove. `replace` rather than `push` so
         the sheet does not linger under Orders on the back stack — Back from
         there should return to wherever the kitchen was before the order
         rang, not into a notification for an order already accepted. */
      router.replace("/(dash)/orders");
    } catch (err) {
      /* The server's own words, against the button that was pressed — it
         knows things this screen does not, such as the diner having
         cancelled while the ticket was on screen. */
      setAcceptError((err as Error)?.message || "That did not save.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <View style={styles.root}>
      <TopBar
        back="Close"
        onBack={close}
        title="New order"
        subtitle={waiting > 1 ? `${waiting} waiting` : undefined}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[6] }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text variant="body" color="tertiary">
            Loading the order…
          </Text>
        ) : !order ? (
          <Note tone="info" glyph="check">
            {waiting > 0
              ? "Nothing new to show you here. Open Orders to act on what is waiting."
              : "Nothing is waiting. Either it was taken on another handset, or the diner cancelled."}
          </Note>
        ) : (
          <>
            {!!error && <Note tone="bad">{error}</Note>}

            <Card style={{ gap: space[2] }}>
              <View style={styles.headRow}>
                <Text variant="title1">{order.orderNumber}</Text>
                <Chip
                  tone={order.paymentStatus === "paid" ? "success" : "warning"}
                  label={order.paymentStatus === "paid" ? "Paid online" : "Cash on delivery"}
                />
              </View>
              {/* The kitchen's number, given the emphasis. `grandTotal` is the
                  diner's and includes delivery and packaging, which are not
                  this restaurant's to keep. */}
              <Text variant="display2">{rupees(order.partnerPayout)}</Text>
              <Text variant="numMeta" color="tertiary">
                You keep this · diner pays {rupees(order.grandTotal)}
              </Text>
            </Card>

            <Card style={{ gap: space[2] }}>
              <Text variant="numMeta" color="tertiary">
                {order.lines.length} ITEM{order.lines.length === 1 ? "" : "S"}
              </Text>
              {order.lines.map((line, i) => (
                <View key={`${line.productName}-${i}`} style={styles.line}>
                  <Text variant="body" style={{ flex: 1 }}>
                    {line.quantity}× {line.productName}
                    {line.variantName ? ` · ${line.variantName}` : ""}
                  </Text>
                  <Text variant="numMeta" color="tertiary">
                    {rupees(line.lineTotal)}
                  </Text>
                </View>
              ))}
              {/* A note is the one line on a ticket somebody has to read rather
                  than skim, so it sits apart from the dish it belongs to. */}
              {order.lines
                .filter((line) => !!line.note)
                .map((line, i) => (
                  <Note key={`note-${i}`} tone="warn" glyph="alert">
                    {line.productName}: {line.note}
                  </Note>
                ))}
            </Card>

            {order.paymentMode === "cod" && (
              <Note tone="info">
                The rider collects {rupees(order.grandTotal)} at the door. Do not ask them for
                money at the counter.
              </Note>
            )}

            <Note tone="info">
              Cannot take this one? Reject it from the Orders tab.
            </Note>
          </>
        )}
      </ScrollView>

      {/* Pinned, not at the end of a scroll. Answering this is something
          somebody does standing up with their hands full, and a control they
          have to find is one they take late. */}
      {!!order && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + space[3] }]}>
          {/* Asked before the order is taken, not after: the answer travels
              with the acceptance, and the diner's tracking screen — and the
              rider search itself — have nothing to count or aim at until it
              does. Pre-answered with the kitchen's own standing figure, so a
              counter that does not want to think about it still accepts in
              one tap. */}
          <Text variant="caption" color="tertiary">
            Ready in
          </Text>
          <View style={styles.choices}>
            {prepChoices(standingPrep).map((minutes) => (
              <ChoiceChip
                key={minutes}
                label={`${minutes} min`}
                selected={(prepMinutes ?? standingPrep) === minutes}
                onPress={() => setPrepMinutes(minutes)}
              />
            ))}
          </View>

          {!!acceptError && <Note tone="bad">{acceptError}</Note>}

          <Btn
            label={accepting ? "Accepting…" : "Accept the order"}
            loading={accepting}
            onPress={accept}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, gap: space[3] },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  actions: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    gap: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
