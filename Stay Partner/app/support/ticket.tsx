import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Text, IconButton, Icon, Badge, Divider, EmptyState } from '@/components/ui';
import {
  STATUS_TONE,
  getTicket,
  markTicketOpened,
  sendMessage,
  statusLabel,
  subscribeTickets,
  ticketTimeLabel,
  type TicketMessage,
} from '@/lib/support';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * The only messaging surface in the design set. Everywhere else a "Message"
 * button sits inert for lack of a thread to open — this is the thread.
 */
export default function TicketThreadScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeTickets(() => setRevision((r) => r + 1)), []);

  // Arriving at the thread is what "read" means.
  useEffect(() => {
    if (id) markTicketOpened(id);
  }, [id]);

  const ticket = getTicket(id);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, [ticket?.messages.length]);

  if (!ticket) {
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

  const send = () => {
    if (!draft.trim()) return;
    sendMessage(ticket.id, draft);
    setDraft('');
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  return (
    <Screen
      scroll={false}
            padX={20}
            contentStyle={styles.fill}
            key={revision}
            footer={
              <View style={styles.composer}>
                <View style={[styles.inputPill, { borderColor: c.border }]}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Type a message…"
                    placeholderTextColor={c.textTertiary}
                    multiline
                    style={[styles.input, { color: c.textPrimary }]}
                  />
                </View>
                <Pressable
                  onPress={send}
                  disabled={!draft.trim()}
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
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>
        </>
      }
    >

      <Text style={styles.subject} numberOfLines={2}>
        {ticket.subject}
      </Text>
      <Badge label={statusLabel(ticket.status)} tone={STATUS_TONE[ticket.status]} style={styles.badge} />
      <Divider style={styles.divider} />

      <ScrollView
        ref={scrollRef}
        style={styles.fill}
        contentContainerStyle={styles.messages}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {ticket.messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
      </ScrollView>
    </Screen>
  );
}

function Bubble({ message }: { message: TicketMessage }) {
  const c = useColors();
  const fromOwner = message.from === 'owner';

  return (
    <View style={[styles.bubbleGroup, { alignItems: fromOwner ? 'flex-end' : 'flex-start' }]}>
      <View
        style={[
          styles.bubble,
          fromOwner
            ? [styles.bubbleOwner, { backgroundColor: c.accent }]
            : [styles.bubbleSupport, { backgroundColor: c.surfaceSunken }],
        ]}
      >
        <Text style={[styles.bubbleText, { color: fromOwner ? c.white : c.textPrimary }]}>
          {message.text}
        </Text>
      </View>
      <Text variant="badge" color="textTertiary" style={styles.bubbleMeta}>
        {fromOwner ? 'You' : 'Support'} · {ticketTimeLabel(message.sentAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginTop: 2 },
  subject: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 22, marginBottom: 6 },
  badge: { marginBottom: 14 },
  divider: { marginBottom: 4 },

  messages: { paddingVertical: 14, gap: 12 },
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
