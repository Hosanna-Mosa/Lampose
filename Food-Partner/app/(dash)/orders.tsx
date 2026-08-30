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
   ══════════════════════════════════════════════════════════════════════════ */
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Vibration, View } from "react-native";

import { Note } from "@/components/form";
import { Btn, Card, Chip, Icon, Rule, Seg, Text, TopBar } from "@/components/ui";
import { rupees } from "@/lib/money";
import { getPushToken } from "@/services/orderAlerts";
import { listMyOrders, registerDevice, setOrderStatus, type ServerOrder } from "@/services/foodPartner";
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

export default function DashOrders() {
  const session = usePartnerStore((s) => s.session);

  const [tab, setTab] = useState<Tab>("live");
  const [orders, setOrders] = useState<ServerOrder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  /* How many orders were waiting last time we looked. A NEW one arriving is
     what earns a noise — re-rendering the same three does not. */
  const lastPlaced = useRef<number | null>(null);
  const [arrived, setArrived] = useState(0);

  const load = useCallback(async () => {
    if (!session?.token) return;
    setError("");
    try {
      const page = await listMyOrders(session.token, QUERY[tab]);
      setOrders(page.data);
      setCounts(page.counts);

      /* Compared against the previous count rather than a timestamp: an order
         the kitchen already accepted leaves `placed`, so this rises only when
         something genuinely new is waiting. */
      const waiting = page.counts.placed ?? 0;
      if (lastPlaced.current !== null && waiting > lastPlaced.current) {
        setArrived(waiting - lastPlaced.current);
        Vibration.vibrate([0, 400, 200, 400]);
      }
      lastPlaced.current = waiting;
    } catch (err) {
      setError((err as Error)?.message || "We could not load your orders.");
    } finally {
      setLoading(false);
    }
  }, [session?.token, tab]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /* ── This handset, so the kitchen can be rung ──────────────────────────
     On mount rather than only at sign-in: a token can be reissued at any
     time, and a kitchen that reinstalled would otherwise never ring again.
     The server upserts by token, so repeating it is free. */
  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    (async () => {
      const registration = await getPushToken();
      if (cancelled || !registration) return;
      try {
        await registerDevice(registration.token, registration.platform, session.token);
      } catch {
        /* A handset that cannot register still sees orders — the queue polls.
           Not worth an error in front of a cook. */
      }
    })();
    return () => { cancelled = true; };
  }, [session?.token]);

  /* ── A push arriving while the app is open ─────────────────────────────
     The OS shows nothing useful when the app is foregrounded, and a tablet
     face-up on a counter IS foregrounded. So the listener refreshes the queue
     itself and buzzes — the sound comes from the notification handler, the
     vibration from here, because a kitchen is a loud room. */
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((event) => {
      if (event.request.content.data?.kind !== "food_order") return;
      Vibration.vibrate([0, 400, 200, 400]);
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

  /* ── Polling, because a push is not a guarantee ────────────────────────
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

  const move = async (order: ServerOrder, status: string) => {
    if (!session?.token) return;
    setBusy(order.orderNumber);
    setError("");
    try {
      await setOrderStatus(session.token, order.orderNumber, status);
      await load();
    } catch (err) {
      setError((err as Error)?.message || "That did not save.");
    } finally {
      setBusy(null);
    }
  };

  const liveCount =
    (counts.placed ?? 0) + (counts.accepted ?? 0) + (counts.preparing ?? 0) + (counts.ready ?? 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        back={null}
        title="Orders"
        subtitle={liveCount ? `${liveCount} in the kitchen` : undefined}
      />

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}

        {arrived > 0 && (
          <Pressable accessibilityRole="button" onPress={() => { setArrived(0); setTab("placed"); }}>
            <Note tone="ok" glyph="bell">
              {arrived} new order{arrived === 1 ? "" : "s"} just came in. Tap to see {arrived === 1 ? "it" : "them"}.
            </Note>
          </Pressable>
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
          return (
            <Card key={order.orderNumber} style={{ gap: space[3] }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="priceMd">{order.orderNumber}</Text>
                  <Text variant="caption" color="tertiary">
                    {new Date(order.placedAt).toLocaleString([], {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <Chip
                  label={STATUS_LABEL[order.status] ?? order.status}
                  tone={STATUS_TONE[order.status] ?? "muted"}
                />
              </View>

              <Rule subtle />

              {order.lines.map((line, i) => (
                <View key={`${order.orderNumber}-${i}`} style={styles.line}>
                  <Text variant="priceSm" color="tertiary">
                    {line.quantity}×
                  </Text>
                  <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                    {line.productName}
                    {line.variantName ? ` · ${line.variantName}` : ""}
                  </Text>
                  <Text variant="priceSm">{rupees(line.lineTotal)}</Text>
                </View>
              ))}

              <Rule subtle />

              <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color="tertiary">
                    {order.paymentMode === "cod" ? "Cash on delivery" : "Paid online"}
                  </Text>
                  <Text variant="priceLg">{rupees(order.grandTotal)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text variant="caption" color="tertiary">
                    You receive
                  </Text>
                  <Text variant="priceMd" color="brand">
                    {rupees(order.partnerPayout)}
                  </Text>
                </View>
              </View>

              {!!order.deliveryAddress && (
                <Text variant="caption" color="tertiary" numberOfLines={2}>
                  {order.customerName ? `${order.customerName} · ` : ""}
                  {order.deliveryAddress}
                </Text>
              )}

              {move_ && (
                <View style={{ gap: space[2] }}>
                  <Btn
                    label={move_.label}
                    loading={busy === order.orderNumber}
                    onPress={() => move(order, move_.status)}
                  />
                  {order.status === "placed" && (
                    <Btn
                      label="Reject"
                      variant="danger"
                      disabled={busy === order.orderNumber}
                      onPress={() => move(order, "rejected")}
                    />
                  )}
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: layout.gutter, gap: space[3], paddingBottom: space[10] },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
});
