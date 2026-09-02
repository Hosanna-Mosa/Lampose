/* ══════════════════════════════════════════════════════════════════════════
   One request, and the conversation on it.

   ## Three kinds of line, and only two of them are speech

   `customer` is this restaurant — the wire word means "whoever filed it",
   whichever app they used, and it is deliberately not renamed because the
   diner's app already reads it. It renders as "You".

   `support` is the person answering.

   `system` is neither. It is a record of what HAPPENED — "Marked resolved by
   Asha Support — Refunded ₹600" — and it is drawn as a centred divider, never
   as a bubble. A process event in the shape of speech is a process event that
   gets read as a person's promise.

   ## The reference filter

   This app is already in `restaurant:<id>` from the socket handshake, so it
   receives support events for EVERY thread it owns, not just this one.
   `watchTicket` filters on the reference for that reason; without it a reply
   on another ticket would append a bubble here, under this ticket's subject.

   ## Nothing here sets a status

   Status, outcome and priority belong to the queue and there is no endpoint
   for them. What this screen can do is reply — and a reply to a thread that
   was `awaiting_customer` or `resolved` REOPENS it server-side, which is why
   every send re-renders from the response rather than from what was on screen.

   A CLOSED thread refuses a reply with 409 and a sentence. It gets no live
   composer at all: a composer that takes a paragraph and then throws it away
   is worse than no composer.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Note, TextField } from "@/components/form";
import { Btn, Card, Chip, DataRow, Rule, Text, TopBar, type IconName } from "@/components/ui";
import { clockWords, stampWords } from "@/lib/when";
import {
  BODY_MAX_FALLBACK,
  categoryWords,
  fetchTicket,
  markTicketRead,
  replyToTicket,
  watchTicket,
  STATUS_WORD,
  type SupportMessage,
  type SupportThread,
  type TicketStatus,
} from "@/services/support";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, layout, radius, space } from "@/theme";

const STATUS_GLYPH: Record<TicketStatus, IconName> = {
  open: "alert",
  awaiting_customer: "clock",
  resolved: "check",
  closed: "lock",
};

/** What the state means for the person reading it, not what it is called. */
const STATUS_SENTENCE: Record<TicketStatus, string> = {
  open: "We have this and are working through it.",
  awaiting_customer: "We have asked you something — a reply here moves it along.",
  resolved: "We think this is settled. Reply if it is not, and it reopens.",
  closed: "This one is closed.",
};

export default function SupportThreadScreen() {
  const insets = useSafeAreaInsets();
  const session = usePartnerStore((s) => s.session);
  const params = useLocalSearchParams<{ reference: string }>();

  /* The server upper-cases the route param and the socket payload both, so
     this does too — a link followed in lower case must reach the same thread
     and join the same room. */
  const reference = String(params.reference || "").toUpperCase();

  const [thread, setThread] = useState<SupportThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const scroller = useRef<ScrollView>(null);

  /**
   * Fetch the thread, then move the read watermark.
   *
   * `quiet` is for the socket path: an event arriving while somebody is
   * reading must not put a spinner over what they are reading.
   *
   * The watermark is its own call and stays that way — the server keeps
   * `customerReadAt` deliberately, and a GET that cleared it would clear a
   * badge nobody ever looked at.
   */
  const load = useCallback(
    async (quiet = false) => {
      /* A missing session must END the loading state, never skip past it —
         the same bug fixed in `(dash)/orders.tsx`. */
      if (!session?.token || !reference) {
        setLoading(false);
        setError(
          session?.token
            ? "We could not tell which request this is. Open it again from the list."
            : "You are signed out. Sign in again to read this request.",
        );
        return;
      }
      if (!quiet) setError("");
      try {
        const detail = await fetchTicket(session.token, reference);
        setThread(detail);
        setError("");
        void markTicketRead(session.token, reference);
      } catch (err) {
        setError((err as Error)?.message || "We could not open this request.");
      } finally {
        setLoading(false);
      }
    },
    [session?.token, reference],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /**
   * Live, but never depended on.
   *
   * The bubble is appended straight from the event so the reply lands while
   * somebody is looking at the screen, and the refetch behind it is what keeps
   * the status, the outcome and the watermark honest — `event.ticket` is the
   * ADMIN's view of the row and is not usable here. With the socket down this
   * screen still works: the focus refetch and pull-to-refresh both stand.
   */
  useEffect(() => {
    if (!session?.token || !reference) return;
    return watchTicket(session.token, reference, (event) => {
      if (event.message) {
        const incoming = event.message;
        setThread((current) => {
          if (!current) return current;
          /* The server echoes our own message back into this room too, and the
             reply response has already added it. Same id, so it is dropped
             rather than drawn twice. */
          if (current.messages.some((m) => m.id === incoming.id)) return current;
          return { ...current, messages: [...current.messages, incoming] };
        });
      }
      void load(true);
    });
  }, [session?.token, reference, load]);

  const words = categoryWords(thread?.category);
  /* A status the server adds later still gets a chip — its own word in the
     neutral tone — rather than the chip disappearing. */
  const status = thread
    ? STATUS_WORD[thread.status] ?? { label: thread.status, tone: "muted" as const }
    : null;
  const closed = thread?.status === "closed";
  const text = draft.trim();

  /* A closed thread normally shows no composer at all. The exception is a
     thread that closed WHILE somebody was typing in it: taking the box away
     then would take their paragraph with it. */
  const keepComposer = !closed || text.length > 0;

  const send = async () => {
    if (!session?.token || !thread || !text || sending) return;
    setSending(true);
    setError("");
    try {
      const updated = await replyToTicket(session.token, reference, text);
      /* Rendered from the RESPONSE. A reply to `awaiting_customer` or
         `resolved` reopens the ticket, so the status that comes back is
         routinely not the one that was on screen a second ago. */
      setThread(updated);
      setDraft("");
    } catch (err) {
      setError((err as Error)?.message || "That did not send. Try again in a moment.");
      /* 409 TICKET_CLOSED: the queue closed it between this screen loading and
         the send. Refresh so the closed notice appears — the draft above is
         kept, and `keepComposer` leaves the box on screen so it can be copied
         into the new request. */
      if ((err as { status?: number })?.status === 409) void load(true);
    } finally {
      setSending(false);
    }
  };

  const messages = useMemo(() => thread?.messages ?? [], [thread]);

  return (
    <View style={styles.root}>
      <TopBar
        back="Help &amp; support"
        title={thread ? words.label : "Request"}
        subtitle={reference || undefined}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.body}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={colors.brand} />
          }
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!!error && <Note tone="bad">{error}</Note>}

          {loading && !thread && !error && (
            <Text variant="body" color="tertiary">
              Opening this request…
            </Text>
          )}

          {!!thread && (
            <>
              <Card style={{ gap: space[2] }}>
                <View style={styles.headRow}>
                  <Text variant="title1" style={{ flex: 1 }} numberOfLines={2}>
                    {thread.subject || words.label}
                  </Text>
                  {!!status && (
                    <Chip
                      label={status.label}
                      tone={status.tone}
                      glyph={STATUS_GLYPH[thread.status]}
                    />
                  )}
                </View>

                {/* A status this build has never heard of gets no sentence
                    rather than an invented one — the chip above still shows
                    the server's own word for it. */}
                {!!STATUS_SENTENCE[thread.status] && (
                  <Text variant="caption" color="secondary">
                    {STATUS_SENTENCE[thread.status]}
                  </Text>
                )}

                <DataRow first label="Reference" value={thread.reference} />
                <DataRow label="Filed" value={stampWords(thread.createdAt) || "—"} tabular={false} />
                {!!thread.orderNumber && <DataRow label="Order" value={thread.orderNumber} />}
                {!!thread.outcome && (
                  <DataRow label="Outcome" value={thread.outcome} tabular={false} />
                )}
              </Card>

              {messages.map((message) => (
                <Message key={message.id} message={message} />
              ))}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── The composer, or the sentence that replaces it ───────────────── */}
      {!!thread && (
        <View style={[styles.foot, { paddingBottom: insets.bottom + space[3] }]}>
          {closed && (
            <>
              <Note tone="info" glyph="lock">
                This one is closed, so it cannot take a reply. Open a new request and we will pick
                it up there — quote {thread.reference} and whoever answers has the history.
              </Note>
              <Btn
                label="Open a new request"
                variant="ghost"
                glyph="plus"
                onPress={() => router.push("/support/new")}
              />
            </>
          )}

          {keepComposer && (
            <>
              <TextField
                value={draft}
                onChangeText={setDraft}
                placeholder={closed ? "Copy this into the new request" : "Write a reply"}
                multiline
                maxLength={BODY_MAX_FALLBACK}
                style={styles.composer}
              />
              <Btn
                label={sending ? "Sending…" : "Send"}
                glyph="arrowRight"
                loading={sending}
                /* A closed thread cannot take this, and the server would say so
                   with a 409. The box stays only so the words survive. */
                disabled={!text || sending || closed}
                onPress={send}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * One line of the conversation
 * ------------------------------------------------------------------ */

function Message({ message }: { message: SupportMessage }) {
  const at = clockWords(message.at);

  /*
   * A system line is what the queue DID, not what anybody said. It gets the
   * shape of a divider — rules above and below, centred, no bubble, no side —
   * because a bubble is the shape of a promise.
   */
  if (message.author === "system") {
    return (
      <View style={styles.system}>
        <Rule subtle />
        <Text variant="numMeta" color="tertiary" style={{ textAlign: "center" }}>
          {message.body}
          {at ? ` · ${at}` : ""}
        </Text>
        <Rule subtle />
      </View>
    );
  }

  /* `customer` is whoever FILED the ticket — this restaurant, in this app. */
  const mine = message.author === "customer";

  return (
    <View style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirsRow]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Text variant="label" color={mine ? "brand" : "tertiary"}>
          {mine ? "You" : message.authorName || "Lampose support"}
        </Text>
        <Text variant="body">{message.body}</Text>
        {!!at && (
          <Text variant="numMeta" color="tertiary">
            {at}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: layout.gutter, gap: space[3], paddingBottom: space[4] },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },

  system: { gap: space[2], paddingVertical: space[1] },

  bubbleRow: { flexDirection: "row" },
  mineRow: { justifyContent: "flex-end" },
  theirsRow: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "88%",
    gap: 3,
    padding: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mine: { backgroundColor: colors.brandTint, borderColor: colors.brandOnDark },
  theirs: { backgroundColor: colors.surface, borderColor: colors.border },

  foot: {
    gap: space[2],
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  composer: { minHeight: 88 },
});
