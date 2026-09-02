/* ══════════════════════════════════════════════════════════════════════════
   Help — the rider's own support threads.

   This screen used to be a grid of six topic tiles and three invented tickets,
   all of which pushed to one hardcoded conversation. Every part of it was a
   fixture: the tiles went nowhere in particular, the ticket ids belonged to
   nobody, and the thread they opened contained a support promise about a
   payment that did not exist. A rider who raised a real problem here was
   talking to a screen.

   Now it is the real list from `/api/v2/drivers/support/tickets`.

   ## The tiles survived, because they were doing something useful

   They are the fastest way to say what a problem is ABOUT, and a category
   chosen up front is a ticket that reaches the right desk first time. So they
   are kept — but each one now carries a real category id and preselects it on
   the new-request screen, rather than being decoration that opened a fixture.

   ## Live, without depending on live

   The rider is already in `driver:<id>` from the offer socket, and the server
   emits support events into that room — so `watchSupport` gives this list a
   badge that updates the moment support replies, with no polling and no extra
   connection. It is an optimisation: the list is fetched on focus regardless,
   and a rider whose socket is down sees everything on their next visit.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Btn, Chip, Icon, Notice, SectionHeader, Text, TopBar } from "@/components/ui";
import { useDriverStore } from "@/store/driverStore";
import {
  CATEGORY_LABEL,
  STATUS_WORD,
  listTickets,
  watchSupport,
  type SupportTicket,
} from "@/services/support";
import { colors, layout, radius, space } from "@/theme";

/**
 * The topics, each bound to a real category the server accepts.
 *
 * The words are the rider's, not the API's: `payout` is "A payout that has not
 * arrived" because that is the sentence in their head at the moment they open
 * this screen. The id underneath is what actually travels.
 */
const TILES: readonly { category: string; title: string; sub: string }[] = [
  { category: "payout", title: "Payout", sub: "Missing or short settlement" },
  { category: "earnings", title: "Trip earnings", sub: "One delivery paid wrong" },
  { category: "order", title: "A delivery", sub: "Restaurant, customer, address" },
  { category: "account", title: "My account", sub: "Documents, suspension, ID" },
  { category: "app", title: "The app", sub: "GPS, notifications, offers" },
  { category: "safety", title: "Safety", sub: "Something happened on a trip" },
];

const when = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const token = useDriverStore((s) => s.token);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      /* Cleared, not left true. A signed-out early return that forgets this is
         a screen that spins for ever — the exact bug that shipped on five
         Food-Partner screens. */
      setLoading(false);
      setError("You are signed out. Sign in again to see your requests.");
      return;
    }
    setError("");
    try {
      const page = await listTickets(token);
      setTickets(page.tickets);
    } catch (err) {
      setError((err as Error)?.message || "We could not load your requests.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  /* On focus, not just on mount: this screen is returned to from the thread
     and from the new-request form, and a list that still shows the old state
     is a list the rider pulls to refresh by hand. */
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /* Live. The rider's own room carries every event for their own threads, so
     no per-ticket subscription is needed for a list. */
  useEffect(() => watchSupport(() => void load()), [load]);

  const openCount = tickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "awaiting_customer",
  ).length;

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Help &amp; support" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[8] }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      >
        <Text variant="caption" color="tertiary">
          Pick the closest topic — most issues are answered the same day.
        </Text>

        <View style={styles.grid}>
          {TILES.map((tile) => (
            <Pressable
              key={tile.category}
              /* Carries the category through, so the form opens with the
                 answer already given rather than asking it again. */
              onPress={() => router.push(`/support-new?category=${tile.category}`)}
              accessibilityRole="button"
              accessibilityLabel={`New request about ${tile.title}`}
              style={({ pressed }) => [
                styles.tile,
                pressed && { backgroundColor: colors.surfaceSunken },
              ]}
            >
              <Text variant="title2" numberOfLines={2}>
                {tile.title}
              </Text>
              <Text variant="caption" color="tertiary">
                {tile.sub}
              </Text>
            </Pressable>
          ))}
        </View>

        <Btn
          label="New request"
          glyph="plus"
          onPress={() => router.push("/support-new")}
        />

        {!!error && <Notice tone="danger" title="We could not load that" body={error} />}

        <View style={{ gap: space[2] }}>
          <SectionHeader
            title="Your requests"
            trailing={openCount ? `${openCount} open` : undefined}
          />

          {loading && !tickets.length ? (
            <Text variant="body" color="tertiary">
              Loading your requests…
            </Text>
          ) : !tickets.length ? (
            <Notice
              tone="info"
              title="Nothing raised yet"
              body="When you raise something it appears here, with every reply from support."
            />
          ) : (
            tickets.map((ticket) => {
              const status = STATUS_WORD[ticket.status];
              const about = ticket.category ? CATEGORY_LABEL[ticket.category] : null;

              return (
                <Pressable
                  key={ticket.reference}
                  onPress={() => router.push(`/ticket?reference=${ticket.reference}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${ticket.subject}, ${status.label}`}
                  style={({ pressed }) => [
                    styles.ticket,
                    pressed && { backgroundColor: colors.surfaceSunken },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={styles.ticketHead}>
                      {/* The dot marks something SUPPORT said that has not
                          been opened — not any activity. A dot that lit up for
                          the rider's own messages would always be on. */}
                      {ticket.unread ? <View style={styles.dot} /> : null}
                      <Text variant="title3" numberOfLines={1} style={{ flex: 1 }}>
                        {ticket.subject}
                      </Text>
                    </View>

                    <Text variant="caption" color="tertiary" numberOfLines={1}>
                      {about ? `${about.label} · ` : ""}
                      {ticket.reference} · {when(ticket.lastActivityAt)}
                    </Text>

                    {/* The queue's own words, where it has written any.
                        "Paid — arrived 12 Sep" is worth ten status chips. */}
                    {!!ticket.outcome && (
                      <Text variant="caption" color="secondary" numberOfLines={1}>
                        {ticket.outcome}
                      </Text>
                    )}
                  </View>

                  <Chip label={status.label} tone={status.tone} />
                  <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, gap: space[3] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  tile: {
    flexGrow: 1,
    flexBasis: "47%",
    gap: 2,
    padding: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ticket: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    padding: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ticketHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: colors.brand },
});
