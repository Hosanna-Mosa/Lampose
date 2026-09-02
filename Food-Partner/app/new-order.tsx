/* ══════════════════════════════════════════════════════════════════════════
   A new order, slid up in front of whatever the kitchen was doing.

   The counterpart to the Driver app's `request.tsx`, and built the same way:
   a route registered with `animation: "slide_from_bottom"` rather than a
   library sheet, so it reads as a sheet, keeps the back gesture, and needs no
   new dependency. `orderPump` pushes it the moment an order lands, from the
   root layout, so it arrives whichever tab is open.

   ## What is different from the rider's, and why

   A rider's offer is a FIFTEEN-SECOND exclusive hold: the countdown is the
   screen, and the server hands the job to somebody else when it expires. A
   kitchen's order has no clock — nobody else is going to cook it — so there is
   no timer here, and inventing one would be a threat the server does not make.

   What it keeps is the shape: one dominant action, the refusal beside it, and
   every figure the decision actually needs — what was ordered, what it pays,
   and whether the money has already arrived.

   ## `partnerPayout`, not `grandTotal`, is the number that matters

   The diner's total includes delivery and packaging, which are not the
   kitchen's. Both are shown, with the payout given the emphasis, because a
   kitchen deciding whether to accept is deciding about what it nets.

   ## Cash is called out

   On a COD order the rider collects, and the kitchen is owed by Lampose rather
   than by the person at the door. Saying so on the ticket stops a counter
   asking a rider for money they are not carrying.

   ## Both answers ask one question first

   Accepting sends a time, because the diner's screen starts a countdown the
   moment it hears one and has nothing to show until then. Rejecting asks why,
   because that sentence is what the diner is told and what the office reads
   when they are asked about the refund. Neither question may cost the kitchen
   more than a tap: the time is pre-answered with the restaurant's own standing
   figure, and the reasons are the four a counter actually gives.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Btn, Card, Chip, ChoiceChip, ModalSheet, Text, TopBar } from "@/components/ui";
import { Note, TextField } from "@/components/form";
import { usePartnerStore } from "@/store/partnerStore";
import { getMe, listMyOrders, setOrderStatus, type ServerOrder } from "@/services/foodPartner";
import { lastArrival, onQueueChanged, setSheetOpen } from "@/services/orderPump";
import { colors, layout, radius, space } from "@/theme";

const rupees = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/* The same two lists the Orders tab offers, for the same reason — this sheet
   and that screen are the two places one order is answered, and a kitchen that
   met different questions depending on which it happened to be looking at
   would be answering a different app. */
const PREP_MINUTES = [15, 20, 30, 45];

const REJECT_OTHER = "Something else";
const REJECT_REASONS = [
  "An item is out of stock",
  "The kitchen is too busy",
  "We are closed right now",
  REJECT_OTHER,
];

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /* The quote, and the refusal. `standingPrep` is the restaurant's own
     `avgPreparationTime` — the figure already shown to diners on its page — so
     the pre-selected answer is one this kitchen chose rather than one this
     screen made up. Null when it could not be read, and then nothing is
     promised rather than something invented. */
  const [standingPrep, setStandingPrep] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");

  /**
   * The oldest order still waiting, not the newest.
   *
   * A kitchen with three tickets should work through them in the order they
   * were placed — showing the most recent would leave the first diner waiting
   * longest. `lastArrival()` is preferred only when it is still in the queue,
   * so the sheet opens on the ticket that actually rang.
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

      const rang = lastArrival();
      setOrder(rows.find((row) => row.orderNumber === rang) ?? rows[rows.length - 1] ?? null);
    } catch (err) {
      setError((err as Error)?.message || "We could not load the order.");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Read once, beside the order rather than with it: this is a property of the
     restaurant, not of the ticket, and a sheet that is open for thirty seconds
     has no reason to ask twice. A failure costs the default, not the sheet. */
  useEffect(() => {
    if (!session?.token) return;
    let dropped = false;
    getMe(session.token)
      .then((me) => {
        if (!dropped) setStandingPrep(Number(me?.avgPreparationTime) || null);
      })
      .catch(() => {
        /* The ticket is what this sheet is for. A missing default costs a tap. */
      });
    return () => { dropped = true; };
  }, [session?.token]);

  /* A different ticket is a different quote. The sheet reloads in place when
     the order it was opened for is taken on another handset, and a time chosen
     for that one must not follow the next diner's order in. */
  useEffect(() => {
    setMinutes(null);
  }, [order?.orderNumber]);

  /* The pump only pushes this sheet when none is showing, and this is what
     tells it. Cleared on unmount, so it is released whichever way the sheet
     left — Accept, Reject, the back gesture or the close control. */
  useEffect(() => {
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, []);

  /* Another order landing while this is open refreshes it rather than stacking
     a second sheet — the pump pushes only when none is showing. */
  useEffect(() => onQueueChanged(() => void load()), [load]);

  const decide = async (
    status: "accepted" | "rejected",
    extra?: { reason?: string; promisedMinutes?: number },
  ) => {
    if (!session?.token || !order) return;
    setBusy(true);
    setError("");
    try {
      await setOrderStatus(session.token, order.orderNumber, status, extra);
      /* Straight back to whatever was on screen. The Orders tab is subscribed
         to the pump and refreshes itself, so there is nothing to hand back. */
      router.back();
    } catch (err) {
      /* The SERVER's sentence. It knows things this screen does not — that the
         diner cancelled while the sheet was open, that the order was already
         accepted on the other handset behind the counter. */
      setError((err as Error)?.message || "That did not save.");
      setBusy(false);
    }
  };

  /* The chosen time, or the kitchen's usual one. Zero means the restaurant's
     own figure could not be read, and then the order is accepted without a
     promise rather than with a made-up one. */
  const accept = () => {
    const promised = minutes ?? standingPrep ?? 0;
    void decide("accepted", promised > 0 ? { promisedMinutes: promised } : undefined);
  };

  const confirmReject = () => {
    const why = (reason === REJECT_OTHER ? reasonNote : reason).trim();
    if (!why) return;
    void decide("rejected", { reason: why });
  };

  return (
    <View style={styles.root}>
      <TopBar
        back="Close"
        onBack={() => router.back()}
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
            Nothing is waiting. Either it was taken on another handset, or the diner cancelled.
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
          </>
        )}
      </ScrollView>

      {/* Pinned, not at the end of a scroll. A ticket is a decision somebody
          makes standing up with their hands full, and an action they have to
          find is an action they take late. */}
      {!!order && (
        <View style={[styles.actions, { paddingBottom: insets.bottom + space[3] }]}>
          {/* Above the button, because it is part of the same answer. The
              kitchen's usual time is already selected, so accepting is still
              one tap for somebody who does not want to be asked. */}
          <Text variant="caption" color="tertiary">
            Ready in
          </Text>
          <View style={styles.choices}>
            {prepChoices(standingPrep).map((option) => (
              <ChoiceChip
                key={option}
                label={`${option} min`}
                selected={(minutes ?? standingPrep) === option}
                onPress={() => setMinutes(option)}
              />
            ))}
          </View>

          <Btn
            label={busy ? "Saving…" : "Accept the order"}
            loading={busy}
            disabled={busy}
            onPress={accept}
          />
          <Btn
            label="Reject"
            variant="danger"
            disabled={busy}
            onPress={() => {
              setReason("");
              setReasonNote("");
              setRejecting(true);
            }}
          />
        </View>
      )}

      {/*
        The refusal, asked rather than taken.

        A rejection ends somebody's dinner and starts a refund, and on a sheet
        that slid up unannounced under whatever the kitchen was doing it was
        one tap away from a thumb that only meant to dismiss it. The sheet in
        the way is the confirmation, and the reason it collects is the sentence
        the diner is given — the server stores it on the order.
      */}
      <ModalSheet
        visible={rejecting}
        title="Why are you rejecting this?"
        onClose={() => setRejecting(false)}
        footer={
          <View style={{ gap: space[2] }}>
            <Btn
              label="Reject the order"
              variant="danger"
              disabled={!(reason === REJECT_OTHER ? reasonNote.trim() : reason) || busy}
              loading={busy}
              onPress={confirmReject}
            />
            <Btn label="Keep the order" variant="ghost" disabled={busy} onPress={() => setRejecting(false)} />
          </View>
        }
      >
        {/* A refusal the server would not take — the diner cancelled while the
            sheet was open, another handset accepted it — is answered where the
            button was, not on the ticket behind this. */}
        {!!error && <Note tone="bad">{error}</Note>}

        <Text variant="body" color="secondary">
          {order?.orderNumber} · {rupees(order?.grandTotal ?? 0)}. The diner is told what you say
          here, and anything they have paid is sent back to them.
        </Text>

        <View style={styles.choices}>
          {REJECT_REASONS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              selected={reason === option}
              onPress={() => setReason(option)}
            />
          ))}
        </View>

        {reason === REJECT_OTHER && (
          <TextField
            value={reasonNote}
            onChangeText={setReasonNote}
            placeholder="Tell the diner what happened"
            maxLength={200}
            multiline
          />
        )}
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, gap: space[3] },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
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
});
