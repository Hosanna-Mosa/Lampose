/* ══════════════════════════════════════════════════════════════════════════
   Food Partner — Real Dynamic Notifications Modal
   Reads real live notifications from backend API (support tickets, live order events & restaurant status).
   Zero dummy / static data.
   ══════════════════════════════════════════════════════════════════════════ */
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";

import { Badge, BottomSheet, EmptyState, InfoNote, Txt } from "@/components/ui";
import { rupees } from "@/lib/money";
import { getMe, listMyOrders, type ServerOrder, type ServerRestaurant } from "@/services/foodPartner";
import {
  listTickets,
  markTicketRead,
  type SupportTicket,
} from "@/services/support";
import { usePartnerStore } from "@/store/partnerStore";
import { font, line, ms, radius, size, ui } from "@/theme/ui";

export type DynamicNotification = {
  id: string;
  reference?: string;
  orderNumber?: string;
  title: string;
  message: string;
  timestamp: string;
  type: "order" | "system" | "payout" | "status";
  read: boolean;
};

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onReadCountChange?: (count: number) => void;
};

/** A glyph and tile colour per kind, so the kind is never carried by colour alone. */
const KIND: Record<DynamicNotification["type"], { icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string }> = {
  order: { icon: "receipt", fg: ui.brandInk, bg: ui.brandSkin },
  payout: { icon: "wallet", fg: ui.success, bg: ui.successSkin },
  status: { icon: "checkmark-circle", fg: ui.success, bg: ui.successSkin },
  system: { icon: "chatbubbles", fg: ui.info, bg: ui.infoSkin },
};

export function NotificationsModal({ visible, onDismiss, onReadCountChange }: Props) {
  const session = usePartnerStore((s) => s.session);

  const [items, setItems] = useState<DynamicNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchDynamicNotifications = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError("");

    try {
      const [ticketsRes, ordersRes, restaurantRes] = await Promise.allSettled([
        listTickets(session.token),
        listMyOrders(session.token, "placed,accepted,preparing,ready"),
        getMe(session.token),
      ]);

      const notifications: DynamicNotification[] = [];

      // 1. Restaurant Status Alerts
      if (restaurantRes.status === "fulfilled") {
        const rest: ServerRestaurant = restaurantRes.value;
        /* "Live" only when it IS — approved AND active. An approved kitchen
           that has been switched off was told it was live, under a "Just now"
           nothing had happened at. No timestamp is shown for a standing fact. */
        if (rest.verificationStatus === "approved" && rest.isActive !== false) {
          notifications.push({
            id: `status-${rest.restaurantId}`,
            title: "Verified & Live",
            message: `${rest.restaurantName} is verified and active for customer orders.`,
            timestamp: "",
            type: "status",
            read: true,
          });
        } else if (rest.verificationStatus === "approved") {
          notifications.push({
            id: `status-${rest.restaurantId}`,
            title: "Approved — not live",
            message: `${rest.restaurantName} is approved but switched off, so diners cannot see it. Contact Lampose support to go live.`,
            timestamp: "",
            type: "status",
            read: false,
          });
        } else if (rest.verificationStatus === "rejected") {
          notifications.push({
            id: `status-${rest.restaurantId}`,
            title: "Verification Update",
            message: rest.verificationNote || "Your application requires updates.",
            timestamp: "Action required",
            type: "status",
            read: false,
          });
        }
      }

      // 2. Active Placed / Live Orders Notifications
      if (ordersRes.status === "fulfilled") {
        const orders: ServerOrder[] = Array.isArray(ordersRes.value?.data)
          ? ordersRes.value.data
          : [];
        orders.slice(0, 10).forEach((ord) => {
          notifications.push({
            id: `order-${ord.orderNumber}`,
            orderNumber: ord.orderNumber,
            title: `Order #${ord.orderNumber}`,
            message: `Status: ${(ord.status || "PLACED").toUpperCase()} · ${ord.lines?.length || 1} item(s) · ${rupees(ord.itemsTotal || 0)}`,
            timestamp: (ord as any).placedAt || (ord as any).createdAt
              ? new Date((ord as any).placedAt || (ord as any).createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : "Recently",
            type: "order",
            read: ord.status !== "placed",
          });
        });
      }

      // 3. Real Support Tickets & Admin Messages
      if (ticketsRes.status === "fulfilled") {
        const tickets: SupportTicket[] = Array.isArray(ticketsRes.value?.tickets)
          ? ticketsRes.value.tickets
          : [];

        tickets.forEach((t) => {
          notifications.push({
            id: `ticket-${t.reference}`,
            reference: t.reference,
            title: t.subject || `Support Thread #${t.reference}`,
            message: t.lastMessagePreview || "New message from Lampose Support",
            timestamp: t.lastActivityAt
              ? new Date(t.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : "Support update",
            type: "system",
            read: !t.unread,
          });
        });
      }

      setItems(notifications);
      const unreadCount = notifications.filter((n) => !n.read).length;
      if (onReadCountChange) onReadCountChange(unreadCount);
    } catch (err) {
      setError((err as Error)?.message || "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [session?.token, onReadCountChange]);

  useEffect(() => {
    if (visible) {
      void fetchDynamicNotifications();
    }
  }, [visible, fetchDynamicNotifications]);

  const markAllRead = async () => {
    if (!session?.token) return;
    /* Orders stay as the server has them — see `openItem`. */
    setItems((list) => {
      const next = list.map((n) => (n.type === "order" ? n : { ...n, read: true }));
      if (onReadCountChange) onReadCountChange(next.filter((n) => !n.read).length);
      return next;
    });

    for (const item of items) {
      if (item.reference && !item.read) {
        await markTicketRead(session.token, item.reference);
      }
    }
  };

  /* Tapping OPENS what it is about — it used to only mark it read and stay
     put. An order is "unread" for as long as it waits to be accepted, which
     is the server's fact (its status), not a flag on this phone — so it is
     not marked here: accepting it is what clears it, everywhere. */
  const openItem = (item: DynamicNotification) => {
    void markItemRead(item);
    onDismiss();
    if (item.reference) router.push(`/support/${item.reference}` as never);
    else if (item.type === "order") {
      router.push((item.read ? "/(dash)/orders" : "/new-order") as never);
    }
  };

  const markItemRead = async (item: DynamicNotification) => {
    if (!session?.token || item.read || item.type === "order") return;
    setItems((list) => {
      const updated = list.map((n) => (n.id === item.id ? { ...n, read: true } : n));
      const unreadCount = updated.filter((n) => !n.read).length;
      if (onReadCountChange) onReadCountChange(unreadCount);
      return updated;
    });

    if (item.reference) {
      await markTicketRead(session.token, item.reference);
    }
  };

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <BottomSheet
      visible={visible}
      onClose={onDismiss}
      title="Notifications"
      closeButton
      titleRight={
        unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead} hitSlop={8} accessibilityRole="button">
            <Txt style={styles.markRead}>Mark all read</Txt>
          </TouchableOpacity>
        ) : null
      }
    >
      {unreadCount > 0 && <Badge label={`${unreadCount} new`} tone="error" dot />}

      {!!error && <InfoNote tone="danger" text={error} />}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={ui.brand} />
          <Txt style={styles.loadingText}>Fetching live notifications...</Txt>
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon="notifications-outline"
          title="No Notifications"
          subtitle="Your kitchen has no new alerts or notifications."
        />
      ) : (
        items.map((item) => {
          const kind = KIND[item.type];
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.item, !item.read && styles.itemUnread]}
              onPress={() => openItem(item)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${item.read ? "" : ", unread"}`}
            >
              <View style={[styles.iconTile, { backgroundColor: kind.bg }]}>
                <Ionicons name={kind.icon} size={ms(18)} color={kind.fg} />
              </View>
              <View style={styles.itemTexts}>
                <View style={styles.itemTitleRow}>
                  <Txt style={styles.itemTitle} numberOfLines={2}>
                    {item.title}
                  </Txt>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
                <Txt style={styles.itemMessage}>{item.message}</Txt>
                {!!item.timestamp && <Txt style={styles.itemTime}>{item.timestamp}</Txt>}
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  markRead: { fontFamily: font.body.semibold, fontSize: size.medium, color: ui.brandInk },
  loading: { alignItems: "center", justifyContent: "center", paddingVertical: 30, gap: 8 },
  loadingText: { fontFamily: font.body.medium, fontSize: size.small, color: ui.sec },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: ui.surface,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: ui.border,
  },
  itemUnread: { backgroundColor: ui.brandSkin, borderColor: ui.brand },
  iconTile: { width: ms(40), height: ms(40), borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemTexts: { flex: 1, minWidth: 0, gap: 2 },
  itemTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  itemTitle: { flex: 1, fontFamily: font.body.semibold, fontSize: size.medium, lineHeight: line.medium, color: ui.text },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ui.brand },
  itemMessage: { fontFamily: font.body.regular, fontSize: size.small, lineHeight: line.small, color: ui.sec },
  itemTime: { fontFamily: font.body.medium, fontSize: size.small, color: ui.muted, marginTop: 4 },
});
