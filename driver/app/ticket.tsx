/* ══════════════════════════════════════════════════════════════════════════
   One support thread.

   ## What this replaced

   A chat that talked to nobody. The old version seeded itself from a `CHAT`
   constant, and `send()` appended a bubble to local state and toasted "Message
   sent to support." — with no network call anywhere in the file. A rider could
   report being grabbed at a door, watch the message render, read the
   confirmation, and close the app having told us nothing. The fixture also
   contained a support promise about releasing a payment, which a rider chasing
   their own missing money would read as a statement about theirs.

   Every row and every tile opened that same fixture, because both pushed
   `/ticket` with no parameter.

   ## Live, and filtered by reference

   The rider sits in `driver:<id>`, and the server emits support events for
   ALL of their threads into that room. So the subscription must filter on the
   reference of the thread on screen — without it a reply on another ticket
   appends a bubble here. `watchTicket` in `services/support.ts` does the
   filtering; this screen only has to de-duplicate on message id, because a
   reply arrives twice: once as the POST's response and once over the socket.

   ## A closed thread has no composer

   The server answers 409 on a reply into a closed thread. A text box there
   would take a paragraph and lose it, so the composer is replaced by a
   sentence and a way to raise a new request.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Btn, Chip, Icon, Notice, Text, TopBar } from "@/components/ui";
import { useDriverStore } from "@/store/driverStore";
import {
  CATEGORY_LABEL,
  STATUS_WORD,
  fetchTicket,
  markTicketRead,
  replyToTicket,
  watchTicket,
  type SupportMessage,
  type SupportThread,
} from "@/services/support";
import { colors, layout, radius, resolveFontFamily, space, type as typeScale } from "@/theme";

const clock = (iso: string): string => {
  const at = new Date(iso);
  return Number.isFinite(at.getTime())
    ? at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
};

export default function TicketScreen() {
  const insets = useSafeAreaInsets();
  const token = useDriverStore((s) => s.token);
  const params = useLocalSearchParams<{ reference?: string }>();
  const reference = typeof params.reference === "string" ? params.reference : "";

  const [thread, setThread] = useState<SupportThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<ScrollView | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError("You are signed out. Sign in again to read this.");
      return;
    }
    if (!reference) {
      setLoading(false);
      setError("We could not tell which request to open.");
      return;
    }
    setError("");
    try {
      const data = await fetchTicket(token, reference);
      setThread(data);
      /* Its own call, not a side effect of the read — see the service. */
      void markTicketRead(token, reference);
    } catch (err) {
      setError((err as Error)?.message || "We could not open that request.");
    } finally {
      setLoading(false);
    }
  }, [token, reference]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Live messages, appended rather than refetched.
   *
   * A refetch on every incoming message would scroll-jump and blank the
   * composer mid-sentence. The de-duplication on `id` is what makes the two
   * delivery paths safe: the rider's own reply arrives once as the POST's
   * response and again over the socket, and without this it would render
   * twice.
   */
  useEffect(() => {
    if (!reference) return undefined;
    return watchTicket(reference, (event) => {
      if (event.message) {
        const incoming = event.message;
        setThread((current) => {
          if (!current) return current;
          if (current.messages.some((m) => m.id === incoming.id)) return current;
          return { ...current, messages: [...current.messages, incoming] };
        });
      }
      /* A status change carries no message — refetch the head so the chip and
         the composer's availability move with it. */
      if (!event.message) void load();
    });
  }, [reference, load]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !token || !thread || sending) return;

    setSending(true);
    setError("");
    try {
      const updated = await replyToTicket(token, thread.reference, text);
      /* The SERVER's thread, not an optimistic append: it knows what the reply
         did to the status, and showing a bubble while the chip beside it is
         wrong is worse than a half-second wait. */
      setThread(updated);
      setDraft("");
    } catch (err) {
      setError((err as Error)?.message || "That did not send.");
    } finally {
      setSending(false);
    }
  };

  const status = thread ? STATUS_WORD[thread.status] : null;
  const about = thread?.category ? CATEGORY_LABEL[thread.category] : null;
  const closed = thread?.status === "closed";
  const canSend = !!draft.trim() && !sending && !closed;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TopBar
        back="Support"
        title={thread?.reference ?? "Request"}
        onBack={() => router.back()}
      />

      {thread ? (
        <View style={styles.subject}>
          <Text variant="display2">{thread.subject}</Text>
          <View style={styles.subjectMeta}>
            {status ? <Chip label={status.label} tone={status.tone} glyph="clock" /> : null}
            {about ? (
              <Text variant="caption" color="tertiary">
                {about.label}
              </Text>
            ) : null}
            {thread.orderNumber ? (
              <Text variant="caption" color="tertiary">
                · {thread.orderNumber}
              </Text>
            ) : null}
          </View>

          {/* The queue's own words about how it ended. A row that reads only
              "Resolved" tells the rider nothing they can act on. */}
          {!!thread.outcome && (
            <Text variant="body" color="secondary">
              {thread.outcome}
            </Text>
          )}
        </View>
      ) : null}

      <ScrollView
        ref={scroller}
        contentContainerStyle={[styles.content, { paddingBottom: space[4] }]}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text variant="body" color="tertiary">
            Loading…
          </Text>
        ) : !thread ? (
          <Notice
            tone="danger"
            title="We could not open that"
            body={error || "It may have been removed."}
          />
        ) : (
          thread.messages.map((message) => <Bubble key={message.id} message={message} />)
        )}
      </ScrollView>

      {!!error && thread ? (
        <View style={{ paddingHorizontal: layout.gutter, paddingBottom: space[2] }}>
          <Notice tone="danger" title="Not sent" body={error} />
        </View>
      ) : null}

      {/* Pays the whole safe-area clearance itself — the root is a
          KeyboardAvoidingView, which sets its own height and carries no
          inset, so without this the Send control sits on the gesture bar. */}
      <View
        style={[
          styles.composer,
          { paddingBottom: Math.max(insets.bottom, 24) + space[2] },
        ]}
      >
        {closed ? (
          /* No text box on a closed thread: the server answers 409, so a
             composer here takes a paragraph and then loses it. */
          <View style={{ gap: space[2] }}>
            <Text variant="caption" color="tertiary">
              This request is closed. Raise a new one and we will pick it up there.
            </Text>
            <Btn
              label="New request"
              variant="ghost"
              glyph="plus"
              onPress={() => router.replace("/support-new")}
            />
          </View>
        ) : (
          <View style={styles.composerRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a reply…"
              placeholderTextColor={colors.textTertiary}
              multiline
              editable={!!thread && !sending}
              style={styles.input}
            />
            <Pressable
              onPress={() => void send()}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
              style={({ pressed }) => [
                styles.send,
                {
                  backgroundColor: canSend ? colors.brand : colors.surfaceSunken,
                  opacity: pressed && canSend ? 0.85 : 1,
                },
              ]}
            >
              <Icon
                name="arrowRight"
                size={18}
                color={canSend ? colors.onBrand : colors.textTertiary}
              />
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * One message.
 *
 * `system` is drawn as a RULE rather than a bubble, and that is the whole
 * point of the distinction: a system line records what happened ("Marked
 * resolved by Asha Support — Paid, arrived 12 Sep"), and giving a process
 * event the shape of speech lets it be mistaken for a person's promise.
 *
 * `customer` is the rider themselves. The wire value keeps the diner-era word
 * because three apps share one collection and two spellings of one author
 * would be the drift this codebase avoids everywhere else — so it is renamed
 * here, at the last possible moment, to "You".
 */
function Bubble({ message }: { message: SupportMessage }) {
  if (message.author === "system") {
    return (
      <View style={styles.systemRow}>
        <View style={styles.rule} />
        <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
          {message.body}
        </Text>
        <View style={styles.rule} />
      </View>
    );
  }

  const mine = message.author === "customer";

  return (
    <View style={[styles.bubbleRow, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: mine ? colors.brand : colors.surface,
            borderColor: mine ? colors.brand : colors.border,
          },
        ]}
      >
        <Text variant="body" style={{ color: mine ? colors.onBrand : colors.textPrimary }}>
          {message.body}
        </Text>
        <Text
          variant="caption"
          style={{
            color: mine ? colors.onBrand : colors.textTertiary,
            opacity: mine ? 0.75 : 1,
            marginTop: 2,
          }}
        >
          {/* A NAME on support's side. "Lampose Support" answers nobody, and a
              rider getting four replies signed identically cannot tell whether
              anyone is actually holding their problem. */}
          {mine ? "You" : message.authorName || "Support"} · {clock(message.at)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  subject: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[3],
    gap: space[2],
  },
  subjectMeta: { flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" },
  content: { paddingHorizontal: layout.gutter, gap: space[2] },

  bubbleRow: { flexDirection: "row" },
  bubble: {
    maxWidth: "82%",
    padding: space[3],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },

  systemRow: { flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: space[1] },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  composer: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: space[2] },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: space[3],
    paddingTop: space[2],
    paddingBottom: space[2],
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    color: colors.textPrimary,
    fontFamily: resolveFontFamily(typeScale.body.face, typeScale.body.weight),
    fontSize: typeScale.body.size,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
