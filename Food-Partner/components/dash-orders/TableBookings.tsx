/* ══════════════════════════════════════════════════════════════════════════
   Table bookings — the lists on the Dine-in tab.

   Reads `GET /me/table-bookings`: requests waiting for an answer, tables still
   to come (or sitting down now), and everything finished in the last month.
   The server sorts requests by how soon they expire, so the top card is the
   one to answer first.

   ## Three ways this list learns about a request, as the order queue does

   The table pump rings and refreshes on the socket event, a push wakes the
   handset when the app is not in front, and a twenty-second poll while this
   list is on screen catches whatever both missed. A request nobody answers
   in fifteen minutes expires and the diner is told the restaurant did not
   reply, so this gets the same belt and braces as an order.

   ## Two of the buttons ask first

   Declining and cancelling are somebody's evening, so both open a sheet of
   the reasons a counter actually gives. A decline may go without one; a
   cancel may not — the guest had a confirmed table, and the server refuses a
   cancel with no reason (`REASON_REQUIRED`). A no-show is confirmed too: it
   frees the table and cannot be undone. Accepting and "arrived" are one tap.
   ══════════════════════════════════════════════════════════════════════════ */
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { useTabBarHeight } from "@/components/dash/organisms/TabBar";
import { BookingCard } from "@/components/dash-orders/molecules/BookingCard";
import {
  AlertDialog,
  BottomSheet,
  Button,
  CardSkeleton,
  Chip,
  ChipRow,
  EmptyState,
  InfoNote,
  TextField,
  Txt,
  staggerListItem,
} from "@/components/ui";
import {
  actOnTableBooking,
  getDineInSettings,
  listTableBookings,
  readDineInError,
  type DineInSettings,
  type TableAction,
  type TableBooking,
  type TableBookingsPage,
} from "@/services/dineIn";
import { noteTableRequests, onTablesChanged, setDineInOn } from "@/services/tablePump";
import { usePartnerStore } from "@/store/partnerStore";
import { font, line, size, ui } from "@/theme/ui";

const LISTS = ["requests", "upcoming", "past"] as const;
type List = (typeof LISTS)[number];

const LIST_LABEL: Record<List, string> = { requests: "Requests", upcoming: "Upcoming", past: "Past" };

const EMPTY: Record<List, { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }> = {
  requests: {
    icon: "notifications-outline",
    title: "No requests waiting",
    subtitle: "A new table request rings like an order. Each one has 15 minutes to be answered.",
  },
  upcoming: {
    icon: "calendar-outline",
    title: "No tables booked ahead",
    subtitle: "Accepted bookings show here until the guests arrive.",
  },
  past: {
    icon: "time-outline",
    title: "Nothing here yet",
    subtitle: "Finished, declined and cancelled bookings from the last month show here.",
  },
};

/*
 * The reasons a counter actually gives — chips, because this is answered
 * standing up, with free text kept for the case the list does not cover.
 * Nothing is pre-selected: a default reason is a reason nobody chose.
 */
const OTHER = "Something else";
const DECLINE_REASONS = ["Fully booked at that time", "Can't seat a party this size", "Closing early that day", OTHER];
const CANCEL_REASONS = ["Kitchen emergency", "Closing early today", "Table no longer available", OTHER];

const guests = (n: number) => `${n} guest${n === 1 ? "" : "s"}`;

export function TableBookings({ openAt }: { openAt?: string }) {
  const tabBarHeight = useTabBarHeight();
  const session = usePartnerStore((s) => s.session);

  const [list, setList] = useState<List>("requests");
  const [page, setPage] = useState<TableBookingsPage | null>(null);
  const [settings, setSettings] = useState<DineInSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  /* A refused button belongs to its card, as on the order queue. */
  const [actError, setActError] = useState<{ reference: string; message: string } | null>(null);

  /* The clock the countdowns read. Ticked here, once, not by every card. */
  const [now, setNow] = useState(() => Date.now());

  /* The booking a reason is being asked for, and which question. */
  const [asking, setAsking] = useState<{ booking: TableBooking; action: "decline" | "cancel" } | null>(null);
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [noShow, setNoShow] = useState<TableBooking | null>(null);

  /* Whether the list on show has been chosen — by the counter, or by the
     first load, which opens on Requests when there are any. */
  const chosen = useRef(false);

  const load = useCallback(async () => {
    /* A missing session ENDS the loading state and says so — the same rule
       as the order queue: silence is the one thing this screen may not do. */
    if (!session?.token) {
      setPage(null);
      setLoading(false);
      setError("You are signed out. Sign in again to see your table bookings.");
      return;
    }
    setError("");
    try {
      const next = await listTableBookings(session.token);
      setPage(next);
      noteTableRequests(next.counts.requests);
      if (!chosen.current) {
        chosen.current = true;
        setList(next.requests.length || !next.upcoming.length ? "requests" : "upcoming");
      }
    } catch (err) {
      setError((err as Error)?.message || "We could not load your table bookings.");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  /* The settings only decide two pieces of wording — "dine-in is off" and
     "bookings are paused" — so a failure here is not worth a banner. */
  const loadSettings = useCallback(async () => {
    if (!session?.token) return;
    try {
      const next = await getDineInSettings(session.token);
      setSettings(next);
      setDineInOn(next.enabled);
    } catch {
      /* The list is what this screen is for. */
    }
  }, [session?.token]);

  const [refreshing, setRefreshing] = useState(false);
  const pull = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), loadSettings()]);
    } finally {
      setRefreshing(false);
    }
  }, [load, loadSettings]);

  /* ── On focus, and every twenty seconds while focused ────────────────
     The poll is the fallback for a socket that is down and a push that never
     came. Foreground only, like every other poll in this app. */
  useFocusEffect(
    useCallback(() => {
      void load();
      void loadSettings();
      const timer = setInterval(() => {
        if (AppState.currentState === "active") void load();
      }, 20_000);
      return () => clearInterval(timer);
    }, [load, loadSettings]),
  );

  /* The pump says something moved — a request arrived, a diner cancelled. */
  useEffect(() => onTablesChanged(() => void load()), [load]);

  /* Opened again from a push or the toast while already mounted: re-pick the
     list (Requests, when there are any) and read it fresh. The first value is
     skipped — the mount's own load already does both. */
  const openedAt = useRef(openAt);
  useEffect(() => {
    if (!openAt || openAt === openedAt.current) return;
    openedAt.current = openAt;
    chosen.current = false;
    void load();
  }, [openAt, load]);

  const requests = page?.requests ?? [];
  const ticking = list === "requests" && requests.length > 0;
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  /* A window that shut on screen: ask the server, which moves the request to
     Past as expired. Keyed on the references, so it asks once per request
     even if this device's clock runs ahead of the server's. */
  const lapsed = requests
    .filter((b) => Date.parse(b.respondBy) <= now)
    .map((b) => b.reference)
    .join(",");
  useEffect(() => {
    if (lapsed) void load();
  }, [lapsed, load]);

  const act = async (booking: TableBooking, action: TableAction, why?: string): Promise<boolean> => {
    if (!session?.token) return false;
    setBusy(booking.reference);
    setActError(null);
    try {
      await actOnTableBooking(session.token, booking.reference, action, why);
      await load();
      return true;
    } catch (err) {
      /* The server's own sentence — `NOT_ALLOWED` names the window that shut,
         `REASON_REQUIRED` asks for the reason. */
      const problem = readDineInError(err, "That did not save.");
      setActError({ reference: booking.reference, message: problem.message });
      /* The window passed or the diner cancelled while the card was up: the
         list is stale, and the card may have moved. */
      if (problem.code === "NOT_ALLOWED" || problem.code === "NOT_FOUND") void load();
      return false;
    } finally {
      setBusy(null);
    }
  };

  const onAction = (booking: TableBooking, action: TableAction) => {
    if (action === "decline" || action === "cancel") {
      setAsking({ booking, action });
      setReason("");
      setReasonNote("");
      setActError(null);
      return;
    }
    if (action === "no-show") {
      setNoShow(booking);
      return;
    }
    void act(booking, action);
  };

  const why = (reason === OTHER ? reasonNote : reason).trim();
  const cancelling = asking?.action === "cancel";

  const confirmReason = async () => {
    if (!asking) return;
    if (cancelling && why.length < 3) return;
    if (await act(asking.booking, asking.action, why || undefined)) setAsking(null);
  };

  const shown = page ? page[list] : [];
  const counts: Record<List, number | undefined> = {
    requests: page?.counts.requests,
    upcoming: page?.counts.upcoming,
    past: undefined,
  };
  const nothingAtAll = !!page && !page.requests.length && !page.upcoming.length && !page.past.length;

  return (
    <>
      <ChipRow<List>
        value={list}
        onChange={(key) => {
          chosen.current = true;
          setList(key);
        }}
        options={LISTS.map((key) => ({ key, label: LIST_LABEL[key], count: counts[key] }))}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: tabBarHeight }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={ui.brand} colors={[ui.brand]} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!!error && <InfoNote tone="danger" text={error} />}

        {settings?.enabled && settings.paused && (
          <InfoNote
            tone="warning"
            icon="pause-circle-outline"
            text="Table bookings are paused, so diners can't book. Tap to change."
            onPress={() => router.push("/dine-in")}
          />
        )}

        {loading && !page && !error && <CardSkeleton count={2} />}

        {!loading && !!page && shown.length === 0 &&
          (settings && !settings.enabled && nothingAtAll ? (
            <EmptyState
              icon="restaurant-outline"
              title="Dine-in is off"
              subtitle="Turn it on and diners can book a table with you."
              actionLabel="Set up dine-in"
              primaryAction
              onAction={() => router.push("/dine-in")}
            />
          ) : (
            <EmptyState icon={EMPTY[list].icon} title={EMPTY[list].title} subtitle={EMPTY[list].subtitle} />
          ))}

        {shown.map((booking, index) => (
          <Animated.View key={booking.reference} entering={staggerListItem(index)}>
            <BookingCard
              booking={booking}
              now={now}
              busy={busy === booking.reference}
              error={actError?.reference === booking.reference ? actError.message : undefined}
              onAction={(action) => onAction(booking, action)}
            />
          </Animated.View>
        ))}
      </ScrollView>

      {/*
        ── Why, and are you sure ─────────────────────────────────────────────
        One sheet for both questions, as the order queue's reject sheet does:
        the reason is what the guest is told, and the sheet being in the way is
        the confirmation.
      */}
      <BottomSheet
        visible={!!asking}
        title={cancelling ? "Cancel this booking?" : "Decline this request?"}
        onClose={() => setAsking(null)}
        closeButton
        footer={
          <>
            <Button
              title={cancelling ? "Cancel the booking" : "Decline request"}
              variant="danger"
              fullWidth
              disabled={cancelling && why.length < 3}
              loading={!!asking && busy === asking.booking.reference}
              onPress={confirmReason}
            />
            <Button
              title={cancelling ? "Keep the booking" : "Keep the request"}
              variant="ghost"
              fullWidth
              onPress={() => setAsking(null)}
            />
          </>
        }
      >
        {!!asking && actError?.reference === asking.booking.reference && (
          <InfoNote tone="danger" text={actError.message} />
        )}

        {!!asking && (
          <Txt style={styles.sheetText}>
            {asking.booking.guestName || "Guest"} · {guests(asking.booking.partySize)} · {asking.booking.dayLabel}{" "}
            {asking.booking.timeLabel}.{" "}
            {cancelling
              ? "Their table is confirmed, so tell them why. They are told what you pick here."
              : "The diner is told what you pick here. A reason is optional."}
          </Txt>
        )}

        <View style={styles.choices}>
          {(cancelling ? CANCEL_REASONS : DECLINE_REASONS).map((option) => (
            <Chip key={option} label={option} selected={reason === option} onPress={() => setReason(option)} />
          ))}
        </View>

        {reason === OTHER && (
          <TextField
            value={reasonNote}
            onChangeText={setReasonNote}
            placeholder={cancelling ? "Tell the guest what happened" : "Tell the diner why"}
            maxLength={200}
            multiline
          />
        )}
      </BottomSheet>

      <AlertDialog
        visible={!!noShow}
        tone="warning"
        title="Mark as a no-show?"
        message={
          noShow
            ? `${noShow.guestName || "Guest"} · ${guests(noShow.partySize)} · ${noShow.timeLabel}. Only if they did not come — this frees the table and cannot be undone.`
            : undefined
        }
        onDismiss={() => setNoShow(null)}
        actions={[
          {
            text: "Mark no-show",
            style: "destructive",
            onPress: () => {
              const booking = noShow;
              setNoShow(null);
              if (booking) void act(booking, "no-show");
            },
          },
          { text: "Not yet", style: "cancel", onPress: () => setNoShow(null) },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sheetText: { fontFamily: font.body.regular, fontSize: size.medium, lineHeight: line.medium, color: ui.sec },
});
