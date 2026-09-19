/* ══════════════════════════════════════════════════════════════════════════
   Food Partner — Real Dynamic Notifications Modal
   Reads real live notifications from backend API (support tickets, live order events & restaurant status).
   Zero dummy / static data.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, Text } from "@/components/common";
import { rupees } from "@/lib/money";
import { getMe, listMyOrders, type ServerOrder, type ServerRestaurant } from "@/services/foodPartner";
import {
  listTickets,
  markTicketRead,
  type SupportTicket,
} from "@/services/support";
import { usePartnerStore } from "@/store/partnerStore";

export type DynamicNotification = {
  id: string;
  reference?: string;
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

export function NotificationsModal({ visible, onDismiss, onReadCountChange }: Props) {
  const insets = useSafeAreaInsets();
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
        if (rest.verificationStatus === "approved") {
          notifications.push({
            id: `status-${rest.restaurantId}`,
            title: "Verified & Live",
            message: `${rest.restaurantName} is verified and active for customer orders.`,
            timestamp: "Just now",
            type: "status",
            read: true,
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
            title: `Order #${ord.orderNumber}`,
            message: `Status: ${(ord.status || "PLACED").toUpperCase()} · ${ord.lines?.length || 1} item(s) · ${rupees(ord.grandTotal || ord.itemsTotal || 0)}`,
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
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    if (onReadCountChange) onReadCountChange(0);

    for (const item of items) {
      if (item.reference && !item.read) {
        await markTicketRead(session.token, item.reference);
      }
    }
  };

  const markItemRead = async (item: DynamicNotification) => {
    if (!session?.token || item.read) return;
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

  const renderIcon = (type: DynamicNotification["type"]) => {
    switch (type) {
      case "order":
        return <Icon name="utensils" size={18} color="#059669" />;
      case "payout":
        return <Icon name="wallet" size={18} color="#10B981" />;
      case "status":
        return <Icon name="check" size={18} color="#047857" strokeWidth={2.5} />;
      default:
        return <Icon name="bell" size={18} color="#0284C7" />;
    }
  };

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.scrim} onPress={onDismiss}>
        <Pressable
          style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 20) }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Grabber */}
          <View style={styles.grabber} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Icon name="bell" size={20} color="#111827" />
              <Text style={styles.headerTitle}>Notifications</Text>
              {unreadCount > 0 && (
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>{unreadCount} new</Text>
                </View>
              )}
            </View>

            <View style={styles.headerActions}>
              {unreadCount > 0 && (
                <Pressable onPress={markAllRead}>
                  <Text style={styles.markReadText}>Mark all read</Text>
                </Pressable>
              )}
              <Pressable onPress={onDismiss} hitSlop={8}>
                <Icon name="close" size={20} color="#6B7280" />
              </Pressable>
            </View>
          </View>

          {/* List */}
          <ScrollView contentContainerStyle={styles.listContainer} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={styles.loadingText}>Fetching live notifications...</Text>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Icon name="bell" size={32} color="#9CA3AF" />
                <Text style={styles.emptyTitle}>No Notifications</Text>
                <Text style={styles.emptySub}>Your kitchen has no new alerts or notifications.</Text>
              </View>
            ) : (
              items.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.itemCard, !item.read && styles.itemCardUnread]}
                  onPress={() => markItemRead(item)}
                >
                  <View style={styles.iconCircle}>{renderIcon(item.type)}</View>

                  <View style={styles.itemContent}>
                    <View style={styles.itemTitleRow}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {!item.read && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.itemMessage}>{item.message}</Text>
                    <Text style={styles.itemTime}>{item.timestamp}</Text>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "80%",
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  badgePill: {
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#EF4444",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  markReadText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#059669",
  },
  listContainer: {
    paddingVertical: 14,
    gap: 12,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#6B7280",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  itemCardUnread: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10B981",
  },
  itemMessage: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
  },
  itemTime: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
  },
  emptySub: {
    fontSize: 13,
    color: "#9CA3AF",
  },
});
