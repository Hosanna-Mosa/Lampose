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
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View, type ScrollView } from "react-native";

import { Badge, Button, Card, Header, IconButton, InfoNote, ScreenShell, Txt } from "@/components/ui";
import { stampWords } from "@/lib/when";
import {
  BODY_MAX_FALLBACK,
  categoryWords,
  fetchTicket,
  markTicketRead,
  replyToTicket,
  watchTicket,
  STATUS_WORD,
  type SupportThread,
  type TicketStatus,
} from "@/services/support";
import { usePartnerStore } from "@/store/partnerStore";
import { MAX_FONT_SCALE, font, fromToneName, line, ms, size, ui } from "@/theme/ui";
import { Message } from "@/components/support-reference/molecules/Message";

const STATUS_GLYPH: Record<TicketStatus, keyof typeof Ionicons.glyphMap> = {
  open: "alert-circle-outline",
  awaiting_customer: "time-outline",
  resolved: "checkmark-circle-outline",
  closed: "lock-closed-outline",
};

/** What the state means for the person reading it, not what it is called. */
const STATUS_SENTENCE: Record<TicketStatus, string> = {
  open: "We have this and are working through it.",
  awaiting_customer: "We have asked you something — a reply here moves it along.",
  resolved: "We think this is settled. Reply if it is not, and it reopens.",
  closed: "This one is closed.",
};

export function SupportThreadScreen() {
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
    <ScreenShell
      keyboardAvoiding
      header={
        <Header
          bar
          title={thread ? words.label : "Request"}
          subtitle={reference || undefined}
          onBack={() => router.back()}
          backLabel="Back to Help & support"
        />
      }
      scroll
      scrollRef={scroller}
      refreshing={loading}
      onRefresh={() => load()}
      scrollProps={{ onContentSizeChange: () => scroller.current?.scrollToEnd({ animated: true }) }}
      contentStyle={styles.body}
      footer={
        thread ? (
          /* ── The composer, or the sentence that replaces it ──────────── */
          <>
            {closed && (
              <>
                <InfoNote
                  tone="info"
                  icon="lock-closed-outline"
                  text={`This one is closed, so it cannot take a reply. Open a new request and we will pick it up there — quote ${thread.reference} and whoever answers has the history.`}
                />
                <Button
                  title="Open a new request"
                  variant="secondary"
                  fullWidth
                  icon={<Ionicons name="add" size={18} color={ui.text} />}
                  onPress={() => router.push("/support/new")}
                />
              </>
            )}

            {keepComposer && (
              <View style={styles.composer}>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={closed ? "Copy this into the new request" : "Write a reply"}
                    placeholderTextColor={ui.muted}
                    multiline
                    maxLength={BODY_MAX_FALLBACK}
                    autoCorrect={false}
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                  />
                </View>
                {sending ? (
                  <View style={styles.sending}>
                    <ActivityIndicator color={ui.onBrand} />
                  </View>
                ) : (
                  <IconButton
                    icon="send"
                    size={44}
                    color={ui.onBrand}
                    background={ui.brand}
                    /* A closed thread cannot take this, and the server would say so
                       with a 409. The box stays only so the words survive. */
                    disabled={!text || sending || closed}
                    onPress={send}
                    accessibilityLabel="Send"
                  />
                )}
              </View>
            )}
          </>
        ) : undefined
      }
    >
      {!!error && <InfoNote tone="danger" text={error} />}

      {loading && !thread && !error && (
        <ActivityIndicator size="large" color={ui.brand} style={styles.loader} accessibilityLabel="Opening this request…" />
      )}

      {!!thread && (
        <>
          <Card bordered elevationLevel="none" style={styles.summary}>
            <View style={styles.headRow}>
              <Txt style={styles.subject} numberOfLines={2}>
                {thread.subject || words.label}
              </Txt>
              {!!status && (
                <Badge
                  label={status.label}
                  tone={fromToneName(status.tone)}
                  icon={STATUS_GLYPH[thread.status as TicketStatus]}
                />
              )}
            </View>

            {/* A status this build has never heard of gets no sentence
                rather than an invented one — the badge above still shows
                the server's own word for it. */}
            {!!STATUS_SENTENCE[thread.status as TicketStatus] && (
              <Txt style={styles.sentence}>{STATUS_SENTENCE[thread.status as TicketStatus]}</Txt>
            )}

            <View style={styles.facts}>
              <Fact label="Reference" value={thread.reference} first />
              <Fact label="Filed" value={stampWords(thread.createdAt) || "—"} />
              {!!thread.orderNumber && <Fact label="Order" value={thread.orderNumber} />}
              {!!thread.outcome && <Fact label="Outcome" value={thread.outcome} />}
            </View>
          </Card>

          <View style={styles.messages}>
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
          </View>
        </>
      )}
    </ScreenShell>
  );
}

/** One label / value line of the request's facts. */
function Fact({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.fact, !first && styles.factDivider]}>
      <Txt style={styles.factLabel}>{label}</Txt>
      <Txt style={styles.factValue} selectable>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 14 },
  loader: { marginTop: 40 },

  summary: { gap: 10 },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  subject: {
    flex: 1,
    fontFamily: font.heading.semibold,
    fontSize: size.large,
    lineHeight: line.large,
    color: ui.text,
  },
  sentence: { fontFamily: font.body.medium, fontSize: size.small, lineHeight: line.small, color: ui.sec },
  facts: { marginTop: 2 },
  fact: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingVertical: 8 },
  factDivider: { borderTopWidth: 1, borderTopColor: ui.border },
  factLabel: { fontFamily: font.body.medium, fontSize: size.small, color: ui.sec },
  factValue: { flexShrink: 1, fontFamily: font.body.semibold, fontSize: size.small, color: ui.text, textAlign: "right" },

  messages: { gap: 10 },

  composer: { flexDirection: "row", alignItems: "center", gap: 10 },
  inputWrap: {
    flex: 1,
    backgroundColor: ui.bg,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 22,
    minHeight: ms(44),
    maxHeight: 120,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  input: {
    fontFamily: font.body.regular,
    fontSize: size.medium,
    color: ui.text,
    paddingVertical: 10,
  },
  sending: {
    width: ms(44),
    height: ms(44),
    borderRadius: ms(22),
    backgroundColor: ui.brand,
    alignItems: "center",
    justifyContent: "center",
  },
});
