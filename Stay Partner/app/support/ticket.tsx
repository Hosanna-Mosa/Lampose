import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Screen, Text, IconButton, Icon, Badge, Divider, EmptyState } from '@/components/ui';
import { useSupportActions, useSupportTicket } from '@/services/hooks/useSupport';
import type { SupportMessage, SupportTicketStatus } from '@/services/api/support.api';
import { watchSupportTicket } from '@/services/realtimeSocket';
import { queryKeys } from '@/services/hooks/keys';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

const STATUS_TONE: Record<SupportTicketStatus, 'warning' | 'accent' | 'success' | 'neutral'> = {
  open: 'warning',
  awaiting_customer: 'accent',
  resolved: 'success',
  closed: 'neutral',
};
const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  open: 'Open',
  awaiting_customer: 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
};

/**
 * The thread — the owner's own ticket, or a guest's ticket about one of
 * their properties, whichever `id` (the reference) names. `useSupportTicket`
 * does not need to be told which: `/partners/support/tickets/:reference`
 * answers with a 404 for anything this owner is not a party to, exactly as
 * the guarded read does everywhere else in this app.
 */
export default function TicketThreadScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reference = id ?? '';

  const { data: thread, isLoading, isError, isRefetching, refetch } = useSupportTicket(reference);
  const { reply, markRead } = useSupportActions();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const markedRef = useRef<string | null>(null);

  /* Arriving at the thread is what "read" means — once per reference, not on
     every refetch. */
  useEffect(() => {
    if (!reference || !thread || markedRef.current === reference) return;
    markedRef.current = reference;
    markRead.mutate(reference);
  }, [reference, thread, markRead]);

  /* The live half — an open thread appends the other side's reply the
     instant it lands, rather than on the next 30-second poll. `reply`'s own
     `onSuccess` already refreshes the cache for OUR sends; this is what
     covers the other side's — a student's message, or a system status
     change. */
  useEffect(() => {
    if (!reference) return undefined;
    return watchSupportTicket(reference, () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.supportTicket(reference) });
    });
  }, [reference, queryClient]);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, [thread?.messages.length]);

  if (isLoading) {
    return (
      <Screen scroll={false} padX={20} background="bg">
        <EmptyState icon="clock" title="Loading" body="Fetching this thread…" />
      </Screen>
    );
  }

  if (isError || !thread) {
    return (
      <Screen scroll={false} padX={20} background="bg">
        <EmptyState
          icon="search"
          title="Ticket not found"
          actionLabel="Back to Support"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  /* On a ticket a GUEST filed about a property (`linkedPartnerId` set), this
     owner's own words are tagged `partner`; on the owner's own ticket their
     words are tagged `customer`, the generic tag every non-diner audience's
     own messages carry. Whichever it is, that is "mine". */
  const mine: SupportMessage['author'] = thread.linkedPartnerId ? 'partner' : 'customer';

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      await reply.mutateAsync({ reference, body });
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch {
      setDraft(body);
    }
  };

  return (
    <Screen
      scroll={false}
      padX={20}
      contentStyle={styles.fill}
      footer={
        <View style={styles.composer}>
          <View style={[styles.inputPill, { borderColor: c.border }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message…"
              placeholderTextColor={c.textTertiary}
              multiline
              editable={thread.status !== 'closed'}
              style={[styles.input, { color: c.textPrimary }]}
            />
          </View>
          <Pressable
            onPress={send}
            disabled={!draft.trim() || thread.status === 'closed' || reply.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: draft.trim() ? c.accent : c.borderSubtle, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Icon name="send" size={17} color={draft.trim() ? c.white : c.textTertiary} strokeWidth={2} />
          </Pressable>
        </View>
      }
      stickyHeader={
        <View style={styles.backRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </View>
      }
    >
      <Text style={styles.subject} numberOfLines={2}>
        {thread.subject}
      </Text>
      <View style={styles.badgeRow}>
        <Badge label={STATUS_LABEL[thread.status]} tone={STATUS_TONE[thread.status]} />
        {thread.linkedPartnerId && (
          <Badge
            label={thread.placeLabel ? `About ${thread.placeLabel}` : 'Guest issue'}
            tone="neutral"
          />
        )}
      </View>
      {thread.status === 'closed' && (
        <Text variant="caption" color="textTertiary" style={styles.closedNote}>
          This one is closed. Raise a new ticket if it comes up again.
        </Text>
      )}
      <Divider style={styles.divider} />

      <ScrollView
        ref={scrollRef}
        style={styles.fill}
        contentContainerStyle={styles.messages}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.accent} colors={[c.accent]} />
        }
      >
        {thread.messages.map((m) => (
          <Bubble key={m.id} message={m} mine={mine} />
        ))}
      </ScrollView>
    </Screen>
  );
}

function Bubble({
  message,
  mine,
}: {
  message: SupportMessage;
  mine: SupportMessage['author'];
}) {
  const c = useColors();

  if (message.author === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text variant="badge" color="textTertiary" style={styles.systemText}>
          {message.body}
        </Text>
      </View>
    );
  }

  const isMine = message.author === mine;
  const senderLabel = isMine
    ? 'You'
    : message.author === 'support'
      ? (message.authorName || 'Support')
      : message.author === 'partner'
        ? (message.authorName || 'Property owner')
        : (message.authorName || 'Guest');

  return (
    <View style={[styles.bubbleGroup, { alignItems: isMine ? 'flex-end' : 'flex-start' }]}>
      <View
        style={[
          styles.bubble,
          isMine
            ? [styles.bubbleOwner, { backgroundColor: c.accent }]
            : [styles.bubbleSupport, { backgroundColor: c.surfaceSunken }],
        ]}
      >
        <Text style={[styles.bubbleText, { color: isMine ? c.white : c.textPrimary }]}>
          {message.body}
        </Text>
      </View>
      <Text variant="badge" color="textTertiary" style={styles.bubbleMeta}>
        {senderLabel} · {new Date(message.at).toLocaleString(undefined, {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginTop: 2 },
  subject: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 22, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  closedNote: { marginTop: -8, marginBottom: 10 },
  divider: { marginBottom: 4 },

  messages: { paddingVertical: 14, gap: 12 },
  systemRow: { paddingVertical: 4, alignItems: 'center' },
  systemText: { textAlign: 'center' },
  bubbleGroup: { gap: 4 },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleOwner: { borderBottomRightRadius: 4 },
  bubbleSupport: { borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  bubbleMeta: { fontSize: 11 },

  composer: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  inputPill: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderWidth: 1.5,
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  input: { fontFamily: fonts.regular, fontSize: 14, padding: 0, maxHeight: 90 },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
