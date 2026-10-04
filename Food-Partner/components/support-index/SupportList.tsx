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

   Laid out as the Adios case list: one card per request with a status stripe.
   ══════════════════════════════════════════════════════════════════════════ */
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  EmptyState,
  Header,
  InfoNote,
  ScreenShell,
  Txt,
  staggerListItem,
} from "@/components/ui";
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
import { font, fromToneName, line, size, toneColors, ui } from "@/theme/ui";

/** A glyph per status, so the state is never carried by colour alone. */
const STATUS_GLYPH: Record<TicketStatus, keyof typeof Ionicons.glyphMap> = {
  open: "alert-circle-outline",
  awaiting_customer: "time-outline",
  resolved: "checkmark-circle-outline",
  closed: "lock-closed-outline",
};

export function SupportList() {
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
    <ScreenShell
      header={
        <Header
          title="Help & support"
          backLabel="Back to Profile"
          onBack={() => router.back()}
          subtitle={
            unread > 0
              ? `${unread} with a new reply`
              : tickets.length
                ? `${tickets.length} request${tickets.length === 1 ? "" : "s"}`
                : undefined
          }
        />
      }
      scroll
      refreshing={loading}
      onRefresh={load}
      contentStyle={styles.body}
      /* Pinned, and clear of the device navigation bar. The list can be long
         and this is the reason most people arrive on this screen. */
      footer={
        <Button
          title="New request"
          fullWidth
          icon={<Ionicons name="add" size={20} color={ui.onBrand} />}
          onPress={() => router.push("/support/new")}
        />
      }
    >
      {!!error && <InfoNote tone="danger" text={error} />}

      {loading && tickets.length === 0 && !error && <CardSkeleton count={3} />}

      {!loading && !error && tickets.length === 0 && (
        <EmptyState
          icon="help-buoy-outline"
          title="Nothing open"
          subtitle="Anything about a settlement, an order, your menu or a rider — ask here and the reply comes back to this screen."
        />
      )}

      {tickets.map((ticket, index) => {
        const words = categoryWords(ticket.category);
        const status = STATUS_WORD[ticket.status] ?? { label: ticket.status, tone: "muted" as const };
        const tone = fromToneName(status.tone);
        const stripe = tone === "neutral" ? ui.borderStrong : toneColors[tone].fg;

        return (
          <Animated.View key={ticket.reference} entering={staggerListItem(index)}>
            <Card
              bordered
              elevationLevel="none"
              padding={14}
              onPress={() => router.push(`/support/${ticket.reference}`)}
              accessibilityLabel={`${words.label}, ${status.label}${ticket.unread ? ", new reply" : ""}`}
              style={[styles.caseCard, { borderLeftColor: stripe }]}
            >
              <View style={styles.caseTopRow}>
                <Txt style={[styles.caseEyebrow, { color: stripe }]} numberOfLines={1}>
                  {words.label}
                </Txt>
                <Badge label={status.label} tone={tone} icon={STATUS_GLYPH[ticket.status as TicketStatus]} />
              </View>

              <Txt style={styles.caseTitle} numberOfLines={2}>
                {ticket.subject || words.hint}
              </Txt>

              {!!ticket.lastMessagePreview && (
                <Txt style={styles.preview} numberOfLines={1}>
                  {ticket.lastMessagePreview}
                </Txt>
              )}

              <View style={styles.metaRow}>
                <Txt style={styles.caseMeta} numberOfLines={1}>
                  {ticket.reference}
                  {ticket.orderNumber ? ` · ${ticket.orderNumber}` : ""}
                  {whenWords(ticket.lastActivityAt) ? ` · ${whenWords(ticket.lastActivityAt)}` : ""}
                </Txt>
                {/* `unread` is "support said something you have not opened",
                    never "you have not replied" — so it is worded as news
                    rather than as a task. */}
                {ticket.unread ? <Badge label="New reply" tone="brand" dot /> : null}
              </View>
            </Card>
          </Animated.View>
        );
      })}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 12 },
  caseCard: { borderLeftWidth: 3, gap: 6 },
  caseTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  caseEyebrow: {
    flex: 1,
    fontFamily: font.body.bold,
    fontSize: size.small,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  caseTitle: { fontFamily: font.body.semibold, fontSize: size.medium, lineHeight: line.medium, color: ui.text },
  preview: { fontFamily: font.body.regular, fontSize: size.small, lineHeight: line.small, color: ui.sec },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  caseMeta: { flex: 1, fontFamily: font.body.medium, fontSize: size.small, color: ui.muted },
});
