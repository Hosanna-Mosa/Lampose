/* ══════════════════════════════════════════════════════════════════════════
   Orders, and their status.

   Reads `GET /me/orders` — real rows out of `food_orders`, written when a
   diner checks out in the customer app.

   ## Three ways this screen learns about a new order, on purpose

   A push wakes it, a foreground listener refreshes it, and a twenty-second
   poll catches whatever both missed. That is deliberate redundancy: a token
   goes stale, a permission gets refused, a kitchen wifi drops. An order
   nobody notices for ten minutes is a cold meal and a refund, so this is the
   one screen in the product where belt and braces is the right call.

   The action on each card is whatever the kitchen is actually allowed to do
   next. `ALLOWED_PARTNER_TRANSITIONS` on the server is the rule; this mirrors
   it only to decide which button to draw, and a refused move shows the
   server's own explanation rather than a guess.

   Two of those moves ask a question first, because both of them are somebody
   else's evening: accepting quotes a time the diner then watches count down,
   and rejecting ends the order and sends the money back. Neither may be a
   single unlabelled tap, and neither may be a form either — this is a counter
   mid-service, so both are a row of the answers a kitchen actually gives.
   ══════════════════════════════════════════════════════════════════════════ */
import { prepChoices } from "@/components/common/utils/prepChoices";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  StyleSheet,
} from "react-native";

import { Box, Note, Refresher, Scroller, Tappable, TextField } from "@/components/common";
import { Btn, Card, Chip, ChoiceChip, Icon, ModalSheet, Rule, Seg, Text, TopBar } from "@/components/common";
import { rupees } from "@/lib/money";
import { cancelledOrders, clearCancelledOrders, onQueueChanged } from "@/services/orderPump";
import { getMe, listMyOrders, setOrderStatus, type ServerOrder } from "@/services/foodPartner";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, layout, space, type ToneName } from "@/theme";

const TABS = ["live", "placed", "delivered", "all"] as const;
type Tab = (typeof TABS)[number];

/** What each tab asks the server for. "live" is the working set. */
const QUERY: Record<Tab, string | undefined> = {
  live: "placed,accepted,preparing,ready",
  placed: "placed",
  delivered: "delivered",
  all: undefined,
};

const STATUS_TONE: Record<string, ToneName> = {
  placed: "warning",
  accepted: "info",
  preparing: "info",
  ready: "brand",
  picked_up: "info",
  delivered: "success",
  rejected: "danger",
  cancelled: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  placed: "New",
  accepted: "Accepted",
  preparing: "Cooking",
  ready: "Ready",
  picked_up: "With the rider",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/*
 * "Ready" is where the two tracks meet.
 *
 * The kitchen's last move is `ready`; everything after it belongs to the rider,
 * who marks `picked_up` at the pass and `delivered` at the door. The server
 * enforces that (`ALLOWED_PARTNER_TRANSITIONS`) and this table only mirrors it
 * to decide which button to draw — a kitchen that could mark an order delivered
 * would be reporting a hand-over that never happened.
 */

/** Mirrors the server's rule, only to pick a button. The server decides. */
const NEXT_MOVE: Record<string, { status: string; label: string } | null> = {
  placed: { status: "accepted", label: "Accept the order" },
  accepted: { status: "preparing", label: "Start cooking" },
  preparing: { status: "ready", label: "Mark as ready" },
  ready: null,
  picked_up: null,
  delivered: null,
  rejected: null,
  cancelled: null,
};

/*
 * Where a kitchen is allowed to say no.
 *
 * The same table's other column: `ALLOWED_PARTNER_TRANSITIONS` permits
 * `rejected` from `accepted` as well as from `placed`, and the server unwinds
 * the whole thing when it happens — it frees the rider it had already found,
 * calls off the dispatch and flags prepaid money for refund. This screen drew
 * the button on `placed` only, so an order taken in a rush and then found to
 * be uncookable had no way out of the app at all, and the unwind the backend
 * carries for exactly that case was unreachable.
 *
 * `preparing` is deliberately absent, because the server refuses it. Food that
 * is already on the heat is a phone call, not a button.
 */
const CAN_REJECT = new Set(["placed", "accepted"]);

/*
 * The times a counter actually says, and the reasons it actually gives.
 *
 * Both are lists rather than free text because the person answering has their
 * hands full: a picker somebody has to type into during a rush is a picker
 * they will skip, and a skipped question is the diner told nothing. The free
 * text is kept for the one case a list cannot cover.
 */

const REJECT_OTHER = "Something else";
const REJECT_REASONS = [
  "An item is out of stock",
  "The kitchen is too busy",
  "We are closed right now",
  REJECT_OTHER,
];

/** The kitchen's own standing preparation time, offered alongside the presets. */

export function DashOrders() {
  const session = usePartnerStore((s) => s.session);

  const [tab, setTab] = useState<Tab>("live");
  const [orders, setOrders] = useState<ServerOrder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  /* A refused move belongs to the card whose button produced it, not to the
     top of a list that can be a screen and a half long — the cook taps
     "Mark as ready", nothing appears to happen, and the server's explanation
     is sitting somewhere they would have to scroll to find. */
  const [moveError, setMoveError] = useState<{ orderNumber: string; message: string } | null>(null);

  /* How many orders were waiting last time we looked. A NEW one arriving is
     what earns a noise — re-rendering the same three does not. */
  const lastPlaced = useRef<number | null>(null);
  const [arrived, setArrived] = useState(0);

  /* Orders the diner called off, collected by the pump whether or not this
     screen was mounted when it happened. */
  const [cancelled, setCancelled] = useState<string[]>([]);

  /* How long the kitchen is promising, per order, when it accepts. */
  const [standingPrep, setStandingPrep] = useState<number | null>(null);
  const [prepFor, setPrepFor] = useState<Record<string, number>>({});

  /* The order a rejection is being explained for, and the explanation. */
  const [rejecting, setRejecting] = useState<ServerOrder | null>(null);
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");

  const load = useCallback(async () => {
    /*
     * A missing session has to END the loading state, not skip past it.
     *
     * This used to `return` while `loading` was still its initial `true`, and
     * every branch below it is gated on that flag: the order list was empty,
     * the empty state renders only `!loading`, `error` was never set, and the
     * RefreshControl spins on `refreshing={loading}`. So a partner whose
     * session had not hydrated — or had expired — got a screen with a tab bar,
     * a spinner and NOTHING ELSE, which is indistinguishable from "no orders
     * have been placed" and is exactly the "I am not seeing any new order
     * requests" report this fixes.
     *
     * Silence is the one thing this screen may never do. Either it shows
     * orders, or it says why it cannot.
     */
    if (!session?.token) {
      setOrders([]);
      setCounts({});
      setLoading(false);
      setError("You are signed out. Sign in again to see your orders.");
      return;
    }
    setError("");
    try {
      const page = await listMyOrders(session.token, QUERY[tab]);
      setOrders(page.data);
      setCounts(page.counts);

      /* Compared against the previous count rather than a timestamp: an order
         the kitchen already accepted leaves `placed`, so this rises only when
         something genuinely new is waiting. */
      const waiting = page.counts.placed ?? 0;
      const seen = lastPlaced.current;
      /*
       * The banner only. The SOUND belongs to `orderPump`, which runs for the
       * life of the app — ringing here as well would chime twice for one order
       * whenever this screen happens to be mounted.
       *
       * And it counts orders that are STILL WAITING, which is what retires it.
       * The banner used to be dismissible only by tapping it: a kitchen that
       * did the obvious thing instead — accepted the two orders it was telling
       * them about — was left with "2 new orders just came in" standing over a
       * queue with nothing new in it, for the rest of the shift. Clamping to
       * the waiting count means dealing with the orders clears the message
       * about them, from either end.
       */
      setArrived((n) => Math.min(seen !== null && waiting > seen ? n + (waiting - seen) : n, waiting));
      lastPlaced.current = waiting;
    } catch (err) {
      setError((err as Error)?.message || "We could not load your orders.");
    } finally {
      setLoading(false);
    }
  }, [session?.token, tab]);

  useFocusEffect(
    useCallback(() => {
      setCancelled(cancelledOrders());
      void load();
    }, [load]),
  );

  /* ── What the kitchen normally promises ───────────────────────────────
     Read once, not with every refresh. `avgPreparationTime` is this
     restaurant's own standing figure — the one already shown to diners on its
     page — which makes it the honest default for the quote below: accepting
     stays a single tap, and the time that travels is a number this kitchen
     chose rather than one this screen made up. When it cannot be read, no
     time is pre-selected and none is sent. */
  useEffect(() => {
    if (!session?.token) return;
    let dropped = false;
    getMe(session.token)
      .then((me) => {
        if (!dropped) setStandingPrep(Number(me?.avgPreparationTime) || null);
      })
      .catch(() => {
        /* The queue is what this screen is for. A missing default costs a tap. */
      });
    return () => { dropped = true; };
  }, [session?.token]);

  /* ── A push arriving while the app is open ─────────────────────────────
     The OS shows nothing useful when the app is foregrounded, and a tablet
     face-up on a counter IS foregrounded. So the listener refreshes the queue
     itself and buzzes — the sound comes from the notification handler, the
     vibration from here, because a kitchen is a loud room. */
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((event) => {
      if (event.request.content.data?.kind !== "food_order") return;
      /* Refresh only. `orderPump` already rang — see the note on the poll. */
      void load();
    });
    return () => sub.remove();
  }, [load]);

  /* Tapping the notification opens this tab on the new order. */
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((event) => {
      if (event.notification.request.content.data?.kind !== "food_order") return;
      setTab("placed");
      void load();
    });
    return () => sub.remove();
  }, [load]);

  /* ── The pump tells this screen when to refresh ───────────────────────
     The socket, the poll and the chime all live in `services/orderPump.ts`,
     started from the root layout so they run whichever tab is open. This
     screen only needs to know that something changed — and, since one of the
     things that changes is a diner calling an order off, which of them went
     away. That list is the pump's because the cancellation can land while the
     kitchen is looking at its menu; it is read here and cleared when somebody
     acknowledges it. */
  useEffect(
    () =>
      onQueueChanged(() => {
        setCancelled(cancelledOrders());
        void load();
      }),
    [load],
  );

  /* ── Polling, because neither a push nor a socket is a guarantee ───────
     A token can be stale, a permission refused, a network flaky. The queue is
     small and indexed, so a poll every twenty seconds while the tab is open
     and the app is in the foreground costs almost nothing and is what makes
     the screen trustworthy when the alert does not arrive. */
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void load();
    }, 20_000);
    return () => clearInterval(timer);
  }, [load]);

  const move = async (
    order: ServerOrder,
    status: string,
    extra?: { reason?: string; promisedMinutes?: number },
  ): Promise<boolean> => {
    if (!session?.token) return false;
    setBusy(order.orderNumber);
    setMoveError(null);
    try {
      await setOrderStatus(session.token, order.orderNumber, status, extra);
      await load();
      return true;
    } catch (err) {
      /* Against the order, so the sentence appears under the button that was
         pressed. The server's own words — it knows things this screen does
         not, such as the diner having cancelled while the card was on screen. */
      setMoveError({
        orderNumber: order.orderNumber,
        message: (err as Error)?.message || "That did not save.",
      });
      return false;
    } finally {
      setBusy(null);
    }
  };

  /*
   * Accepting carries the quote with it.
   *
   * The diner's tracking screen has a live countdown and nothing to count
   * until this number arrives, so every accept sends one — the chips below let
   * a kitchen say something other than its usual, and saying nothing sends the
   * usual. The only case that travels without a time is a restaurant whose own
   * standing figure could not be read, because the alternative is this screen
   * inventing a promise on the kitchen's behalf.
   */
  const accept = (order: ServerOrder) => {
    const minutes = prepFor[order.orderNumber] ?? standingPrep ?? 0;
    void move(order, "accepted", minutes > 0 ? { promisedMinutes: minutes } : undefined);
  };

  const askWhy = (order: ServerOrder) => {
    setRejecting(order);
    setReason("");
    setReasonNote("");
    setMoveError(null);
  };

  /*
   * The rejection, once there is a reason for it.
   *
   * Two things happen here that did not before: the tap is confirmed, and the
   * reason travels. A rejection is the end of somebody's dinner and the start
   * of a refund, and it used to be one red button on a card with no second
   * step and nothing recorded — the diner was told an order was refused and
   * never why, and the office had nothing to answer them with.
   */
  const confirmReject = async () => {
    const order = rejecting;
    if (!order) return;
    const why = (reason === REJECT_OTHER ? reasonNote : reason).trim();
    if (!why) return;
    if (await move(order, "rejected", { reason: why })) setRejecting(null);
  };

  const liveCount =
    (counts.placed ?? 0) + (counts.accepted ?? 0) + (counts.preparing ?? 0) + (counts.ready ?? 0);

  return (
    <Box style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        back={null}
        title="Orders"
        subtitle={liveCount ? `${liveCount} in the kitchen` : undefined}
      />

      <Scroller
        contentContainerStyle={styles.body}
        refreshControl={<Refresher refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}

        {arrived > 0 && (
          <Tappable accessibilityRole="button" onPress={() => { setArrived(0); setTab("placed"); }}>
            <Note tone="ok" glyph="bell">
              {arrived} new order{arrived === 1 ? "" : "s"} just came in. Tap to see {arrived === 1 ? "it" : "them"}.
            </Note>
          </Tappable>
        )}

        {/* A ticket that left rather than arrived. The card itself is already
            gone from the list by the time this renders, which is exactly the
            problem it answers — so the message is the order NUMBER, because
            that is what is printed on the docket clipped above the pass. It
            stays until somebody clears it: an order called off during service
            is worth interrupting for. */}
        {cancelled.length > 0 && (
          <Tappable
            accessibilityRole="button"
            onPress={() => { clearCancelledOrders(); setCancelled([]); }}
          >
            <Note tone="warn" glyph="alert">
              {cancelled.length === 1
                ? `The diner cancelled order ${cancelled[0]}. Do not cook it.`
                : `The diner cancelled ${cancelled.length} orders. Do not cook them: ${cancelled.join(", ")}.`}
              {" Tap to clear this."}
            </Note>
          </Tappable>
        )}

        <Seg
          options={TABS}
          value={tab}
          onChange={setTab}
          labels={{ live: "In the kitchen", placed: "New", delivered: "Done", all: "All" }}
        />

        {!loading && orders.length === 0 && (
          <Card style={{ alignItems: "center", gap: space[2], paddingVertical: space[6] }}>
            <Icon name="doc" size={26} color={colors.textTertiary} />
            <Text variant="title1">No orders here</Text>
            <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
              Orders placed by diners appear here as they come in. Nothing has been placed with this
              restaurant yet.
            </Text>
          </Card>
        )}

        {orders.map((order) => {
          const move_ = NEXT_MOVE[order.status];
          const canReject = CAN_REJECT.has(order.status);
          /* A rejected or cancelled order is not going to be paid for. */
          const paying = order.status !== "rejected" && order.status !== "cancelled";
          const promised = prepFor[order.orderNumber] ?? standingPrep;
          return (
            <Card key={order.orderNumber} style={{ gap: space[3] }}>
              <Box style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="priceMd">{order.orderNumber}</Text>
                  <Text variant="caption" color="tertiary">
                    {new Date(order.placedAt).toLocaleString([], {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </Box>
                <Chip
                  label={STATUS_LABEL[order.status] ?? order.status}
                  tone={STATUS_TONE[order.status] ?? "muted"}
                />
              </Box>

              <Rule subtle />

              {order.lines.map((line, i) => (
                <Box key={`${order.orderNumber}-${i}`} style={styles.line}>
                  <Text variant="priceSm" color="tertiary">
                    {line.quantity}×
                  </Text>
                  <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                    {line.productName}
                    {line.variantName ? ` · ${line.variantName}` : ""}
                  </Text>
                  <Text variant="priceSm">{rupees(line.lineTotal)}</Text>
                </Box>
              ))}

              <Rule subtle />

              <Box style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                <Box style={{ flex: 1 }}>
                  <Text variant="caption" color="tertiary">
                    {order.paymentMode === "cod" ? "Cash on delivery" : "Paid online"}
                  </Text>
                  <Text variant="priceLg">{rupees(order.grandTotal)}</Text>
                </Box>
                {/* `partnerPayout` is written once, when the order is placed,
                    and nothing zeroes it afterwards — so a rejected or
                    cancelled card went on promising a kitchen money for food
                    it never cooked, which is the figure they would eventually
                    query an invoice against. There is nothing to put in its
                    place, so nothing is what goes there. */}
                <Box style={{ alignItems: "flex-end" }}>
                  <Text variant="caption" color="tertiary">
                    {paying ? "You receive" : "Nothing to receive"}
                  </Text>
                  {paying ? (
                    <Text variant="priceMd" color="brand">
                      {rupees(order.partnerPayout)}
                    </Text>
                  ) : (
                    <Text variant="priceMd" color="tertiary">
                      —
                    </Text>
                  )}
                </Box>
              </Box>

              {!!order.deliveryAddress && (
                <Text variant="caption" color="tertiary" numberOfLines={2}>
                  {order.customerName ? `${order.customerName} · ` : ""}
                  {order.deliveryAddress}
                </Text>
              )}

              {/*
                ── Who is collecting it ─────────────────────────────────────

                Three states, worded as three different things rather than one
                spinner, because the kitchen does something different in each:

                  searching    riders are being asked. Carry on cooking.
                  unassigned   nobody took it yet. Still carry on cooking — the
                               server tries again the moment this is marked
                               ready — but do not plate it early.
                  assigned     somebody is on the way, and the code below is
                               what they will ask for at the pass.
              */}
              {order.dispatch?.state === "searching" && !order.rider && (
                <Note tone="info">Finding a delivery partner for this order.</Note>
              )}

              {order.dispatch?.state === "unassigned" && !order.rider && (
                <Note tone="warn" glyph="clock">
                  No rider has taken this one yet. Keep cooking — we look again as soon as you
                  mark it ready.
                </Note>
              )}

              {order.rider && (
                <Box style={styles.rider}>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="caption" color="tertiary">
                      {order.rider.pickedUpAt ? "Collected by" : "Rider on the way"}
                    </Text>
                    <Text variant="title2" numberOfLines={1}>
                      {order.rider.name}
                    </Text>
                    <Text variant="caption" color="tertiary" numberOfLines={1}>
                      {[order.rider.vehicle?.type, order.rider.vehicle?.plate, order.rider.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </Box>

                  {/* Shown from `ready` onwards only. Before that there is
                      nothing to hand over, and a code on screen through the
                      whole cook is a code somebody reads out early. */}
                  {order.status === "ready" && !!order.pickupCode && (
                    <Box style={{ alignItems: "flex-end" }}>
                      <Text variant="caption" color="tertiary">
                        Hand-over code
                      </Text>
                      <Text variant="priceLg">{order.pickupCode}</Text>
                    </Box>
                  )}
                </Box>
              )}

              {(move_ || canReject) && (
                <Box style={{ gap: space[2] }}>
                  {/* Asked before the order is taken, not after: the answer
                      travels with the acceptance, and the diner's screen has
                      a countdown that has nothing to count without it. The
                      row is pre-answered, so a kitchen that does not want to
                      think about it still accepts in one tap. */}
                  {order.status === "placed" && (
                    <>
                      <Text variant="caption" color="tertiary">
                        Ready in
                      </Text>
                      <Box style={styles.choices}>
                        {prepChoices(standingPrep).map((minutes) => (
                          <ChoiceChip
                            key={minutes}
                            label={`${minutes} min`}
                            selected={promised === minutes}
                            onPress={() =>
                              setPrepFor((all) => ({ ...all, [order.orderNumber]: minutes }))
                            }
                          />
                        ))}
                      </Box>
                    </>
                  )}

                  {moveError?.orderNumber === order.orderNumber && (
                    <Note tone="bad">{moveError.message}</Note>
                  )}

                  {move_ && (
                    <Btn
                      label={move_.label}
                      loading={busy === order.orderNumber}
                      onPress={() => {
                        if (move_.status === "accepted") accept(order);
                        else void move(order, move_.status);
                      }}
                    />
                  )}
                  {canReject && (
                    <Btn
                      label="Reject"
                      variant="danger"
                      disabled={busy === order.orderNumber}
                      onPress={() => askWhy(order)}
                    />
                  )}
                </Box>
              )}
            </Card>
          );
        })}
      </Scroller>

      {/*
        ── Why, and are you sure ─────────────────────────────────────────────

        One sheet doing both jobs. The reason is what the diner is told and
        what the office reads when they ask about the refund, and the sheet
        being in the way is the confirmation — a rejection that needed one tap
        on a red button beside "Start cooking" was one clumsy thumb away from
        ending an order that was perfectly fine.

        Chips rather than a text box, because this is answered standing up
        during service with the free-text option kept for the case the four
        lines do not cover. Nothing is pre-selected: a default reason would be
        a reason nobody chose, attached to somebody's dinner.
      */}
      <ModalSheet
        visible={!!rejecting}
        title="Why are you rejecting this?"
        onClose={() => setRejecting(null)}
        footer={
          <Box style={{ gap: space[2] }}>
            <Btn
              label="Reject the order"
              variant="danger"
              disabled={!(reason === REJECT_OTHER ? reasonNote.trim() : reason)}
              loading={!!rejecting && busy === rejecting.orderNumber}
              onPress={confirmReject}
            />
            <Btn label="Keep the order" variant="ghost" onPress={() => setRejecting(null)} />
          </Box>
        }
      >
        {!!rejecting && moveError?.orderNumber === rejecting.orderNumber && (
          <Note tone="bad">{moveError.message}</Note>
        )}

        <Text variant="body" color="secondary">
          {rejecting?.orderNumber} · {rupees(rejecting?.grandTotal ?? 0)}. The diner is told what you
          say here, and anything they have paid is sent back to them.
        </Text>

        <Box style={styles.choices}>
          {REJECT_REASONS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              selected={reason === option}
              onPress={() => setReason(option)}
            />
          ))}
        </Box>

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
    </Box>
  );
}

const styles = StyleSheet.create({
  body: { padding: layout.gutter, gap: space[3], paddingBottom: space[10] },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  rider: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space[3],
  },
});
