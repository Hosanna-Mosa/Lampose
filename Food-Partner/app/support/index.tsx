/* ══════════════════════════════════════════════════════════════════════════
   Every request this restaurant has filed.

   Reads `GET /api/v2/food-partners/support/tickets` — the same collection the
   admin console works, filtered by the server to this restaurant. Nothing on
   this screen can change a status: the queue owns that, and there is no
   endpoint for it.

   ## It is live without asking to be

   The socket handshake already put this app in `restaurant:<id>`, and the
   backend fans every support event for this restaurant into that room. So
   `watchSupport` needs no `track_ticket` and no reference filter — it wants
   all of them, and one of the payloads it wants (a ticket having just been
   opened) carries no reference to filter on anyway.

   An event is a SIGNAL, never state. `event.ticket` is the admin's view of the
   row, whose `unread` means the opposite of ours, so this refetches rather
   than splices. And it refetches on focus regardless, because the socket is an
   optimisation: with it down, this screen is a pull-to-refresh list and loses
   nothing but the seconds.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Note } from "@/components/form";
import { Btn, Card, Chip, Icon, Text, TopBar, type IconName } from "@/components/ui";
import { whenWords } from "@/lib/when";
import {
  categoryWords,
  listTickets,
  watchSupport,
  STATUS_WORD,
  type SupportTicket,
  type TicketStatus,
} from "@/services/support";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, layout, radius, space } from "@/theme";

/** A glyph per status, so the state is never carried by colour alone. */
const STATUS_GLYPH: Record<TicketStatus, IconName> = {
  open: "alert",
  awaiting_customer: "clock",
  resolved: "check",
  closed: "lock",
};

export default function SupportList() {
  const insets = useSafeAreaInsets();
  const session = usePartnerStore((s) => s.session);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    /* A missing session must END the loading state, never skip past it — the
       same bug fixed in `(dash)/orders.tsx`: `loading` starts `true`, so an
       early return leaves a spinner turning over a blank screen that is
       indistinguishable from "you have never asked us anything". */
    if (!session?.token) {
      setLoading(false);
      setError("You are signed out. Sign in again to see your requests.");
      return;
    }
    setError("");
    try {
      const page = await listTickets(session.token);
      setTickets(page.tickets);
      setUnread(page.unread);
    } catch (err) {
      setError((err as Error)?.message || "We could not load your requests.");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!session?.token) return;
    return watchSupport(() => {
      void load();
    });
  }, [session?.token, load]);

  return (
    <View style={styles.root}>
      <TopBar
        back="Profile"
        title="Help &amp; support"
        subtitle={
          unread > 0
            ? `${unread} with a new reply`
            : tickets.length
              ? `${tickets.length} request${tickets.length === 1 ? "" : "s"}`
              : undefined
        }
      />

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />
        }
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}

        {loading && tickets.length === 0 && !error && (
          <Text variant="body" color="tertiary">
            Loading your requests…
          </Text>
        )}

        {!loading && !error && tickets.length === 0 && (
          <Card style={styles.empty}>
            <Icon name="help" size={26} color={colors.textTertiary} />
            <Text variant="title1">Nothing open</Text>
            <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
              Anything about a settlement, an order, your menu or a rider — ask here and the reply
              comes back to this screen.
            </Text>
          </Card>
        )}

        {tickets.map((ticket) => {
          const words = categoryWords(ticket.category);
          const status = STATUS_WORD[ticket.status] ?? { label: ticket.status, tone: "muted" as const };

          return (
            <Pressable
              key={ticket.reference}
              accessibilityRole="button"
              accessibilityLabel={`${words.label}, ${status.label}${ticket.unread ? ", new reply" : ""}`}
              onPress={() => router.push(`/support/${ticket.reference}`)}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.surfaceSunken },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
                <View style={styles.rowHead}>
                  <Text variant="title2" numberOfLines={1} style={{ flex: 1 }}>
                    {words.label}
                  </Text>
                  <Chip label={status.label} tone={status.tone} glyph={STATUS_GLYPH[ticket.status]} />
                </View>

                <Text variant="body" numberOfLines={2}>
                  {ticket.subject || words.hint}
                </Text>

                {!!ticket.lastMessagePreview && (
                  <Text variant="caption" color="tertiary" numberOfLines={1}>
                    {ticket.lastMessagePreview}
                  </Text>
                )}

                <View style={styles.rowMeta}>
                  <Text variant="numMeta" color="tertiary">
                    {ticket.reference}
                    {ticket.orderNumber ? ` · ${ticket.orderNumber}` : ""}
                    {whenWords(ticket.lastActivityAt) ? ` · ${whenWords(ticket.lastActivityAt)}` : ""}
                  </Text>
                  {/* `unread` is "support said something you have not opened",
                      never "you have not replied" — so it is worded as news
                      rather than as a task. */}
                  {ticket.unread ? <Chip label="New reply" tone="brand" glyph="bell" /> : null}
                </View>
              </View>

              <Icon name="chevronRight" size={15} color={colors.textTertiary} />
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Pinned, and clear of the device navigation bar. The list can be long
          and this is the reason most people arrive on this screen. */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + space[3] }]}>
        <Btn label="New request" glyph="plus" onPress={() => router.push("/support/new")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: layout.gutter, gap: space[3], paddingBottom: space[6] },
  empty: { alignItems: "center", gap: space[2], paddingVertical: space[6] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[3],
    backgroundColor: colors.surface,
  },
  rowHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: 2 },
  actions: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
});
