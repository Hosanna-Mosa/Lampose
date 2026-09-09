import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
/*
 * The library's KeyboardAvoidingView, not React Native's.
 *
 * This screen is a scrolling thread with a reply box pinned below it, and the
 * RN component was configured `behavior={Platform.OS === 'ios' ? 'padding' :
 * undefined}` — which is the documented way to say "do nothing on Android".
 * So on Android the keyboard opened straight over the composer and the reply
 * was typed blind, which is the same complaint the sign-up screen drew.
 *
 * This one measures the keyboard from the platform's own animation on both
 * OSes, so `padding` is correct for each and the ternary goes away.
 */
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBottomEdgeInset } from '@/hooks/useActionBarInset';

import { Button, InlineAlert, Text, TextField } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { TicketMessageRow } from '@/components/lifecycle';
import { errorStates } from '@/constants/copy';
import { useTheme } from '@/context/ThemeContext';
import { useTicket } from '@/services';

/**
 * Screen 61 — the thread.
 *
 * Two things here are worth more than the chat itself.
 *
 * **Our side signs as "LAMPOSE Support".** It used to print the admin
 * account's own name, which put a real employee's first name in front of every
 * customer who opened a ticket. See `signatureFor` in
 * `adapters/support.adapter.ts`.
 *
 * **System lines are not bubbles.** They record what *happened* — "we asked
 * Padma on 10 August, she has 3 working days" — rather than what anyone said.
 * Giving a process guarantee the shape of speech lets it be mistaken for a
 * person's reassurance, and those are worth different amounts when the pump is
 * still not fixed on the 21st.
 *
 * ## Opening this screen is what marks it read
 *
 * `useTicket` moves the watermark once the thread has actually loaded — not on
 * mount, because marking something read before it arrived is a claim about a
 * screen nobody has seen.
 *
 * ## "Resolved" is support's word, and the student gets to answer it
 *
 * When the queue marks a thread resolved, the composer used to stay open and
 * nothing said anything had changed — a student whose problem was NOT fixed
 * had no idea a decision had been made about it, and one whose problem WAS
 * fixed had no way to say so.
 *
 * So a resolved thread asks: is this sorted, or do you still need us? Both
 * answers do something real.
 *
 * The "still need help" answer is the important one and it is the honest one:
 * the server accepts replies on a resolved thread (only `closed` is refused
 * with a 409), so continuing the conversation genuinely reopens it in the
 * queue's inbox.
 *
 * The "yes, close it" answer posts a message saying so and then puts the
 * thread away: the composer is replaced by a line stating it is closed from
 * their side, with one button to bring it back if the problem returns. So the
 * screen behaves the way the student just said it should.
 *
 * What it does NOT do is write `status` on the record. `ticket.model.js` is
 * explicit that the customer never sets the status, and the reason is not
 * bureaucratic — the same field decides whether a deposit dispute is still
 * open, and a client that could set it is a client that could be made to.
 * The message the student sends is what the queue closes it on, and until
 * somebody does, replying still works. Nothing here is a claim about the
 * record; it is this screen reflecting a decision its reader made.
 *
 * The answer is remembered on the device, keyed by reference, so re-opening
 * the thread does not ask the same question again — and "Reopen" simply
 * forgets it.
 */
export default function TicketThread() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomEdgeInset();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [reply, setReply] = useState('');

  const {
    ticket,
    messages,
    canReply,
    isPending,
    error,
    refetch,
    isFetching,
    sendReply,
    isSending,
    sendError,
  } = useTicket(id);

  /* The box is cleared only once the server has the message. Clearing on tap
     and failing would lose what somebody just wrote. */
  const send = async () => {
    const body = reply.trim();
    if (!body) return;
    try {
      await sendReply(body);
      setReply('');
    } catch {
      /* Held in `sendError`, rendered above the box. */
    }
  };

  /* ------------------------------------------------------------------ *
   * "Support marked this resolved" — see the note on the component.
   * ------------------------------------------------------------------ */

  /** What this device has already answered for this thread, or null. */
  const [verdict, setVerdict] = useState<'sorted' | 'continue' | null>(null);
  /** Null until the stored answer has been read — the prompt must not flash. */
  const [verdictLoaded, setVerdictLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const verdictKey = id ? `@lampose/support-resolved/${id}` : null;

  useEffect(() => {
    if (!verdictKey) return;
    let live = true;
    AsyncStorage.getItem(verdictKey)
      .then((stored) => {
        if (!live) return;
        setVerdict(stored === 'sorted' || stored === 'continue' ? stored : null);
      })
      /* A device that cannot read its own storage gets the prompt. Asking a
         question twice is a smaller failure than never asking it. */
      .catch(() => {})
      .finally(() => {
        if (live) setVerdictLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [verdictKey]);

  const remember = useCallback(
    (answer: 'sorted' | 'continue') => {
      setVerdict(answer);
      if (verdictKey) void AsyncStorage.setItem(verdictKey, answer).catch(() => {});
    },
    [verdictKey],
  );

  /*
   * Confirming sends a real message. The status stays support's to set — this
   * app cannot close a ticket and does not pretend to — so what "yes, sorted"
   * produces is the sentence the queue closes it on.
   *
   * The verdict is only remembered once the message is actually with the
   * server. Recording it first would leave a student who lost signal at that
   * moment with a thread that never asks again and a support queue that was
   * never told.
   */
  const confirmSorted = async () => {
    setConfirming(true);
    try {
      await sendReply('Thanks — this is sorted from my side. You can close it.');
      remember('sorted');
    } catch {
      /* `sendError` renders it. The prompt stays up so it can be retried. */
    } finally {
      setConfirming(false);
    }
  };

  /**
   * Undo the close, without asking again.
   *
   * `remember('continue')` rather than clearing the key: forgetting entirely
   * would put the "is this sorted?" question back the next time this screen
   * opens, at somebody who has just answered it twice.
   */
  const reopen = () => remember('continue');

  /*
   * Only while support has said resolved AND this device has not answered.
   * `closed` is deliberately excluded: a closed thread takes no replies at
   * all, and the composer already says so.
   */
  const askingVerdict =
    Boolean(ticket) && ticket?.state === 'resolved' && verdictLoaded && verdict === null;

  /** They answered "sorted" and have not reopened it. */
  const closedByYou = ticket?.state === 'resolved' && verdictLoaded && verdict === 'sorted';

  if (isPending) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.bg }, styles.centre]}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  /*
   * A 404 is the only thing that means "no such ticket".
   *
   * Every other failure is the network or the server, and showing the
   * not-found template for those would tell a student their deposit dispute
   * had been deleted because their train went into a tunnel.
   */
  if (error?.status === 404) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StateTemplate copy={errorStates.notFound()} onPrimary={() => router.replace('/support')} />
      </View>
    );
  }

  if (error || !ticket) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Support" onBack={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', padding: layout.gutter, gap: space[3] }}>
          <Text variant="title1">We could not open this</Text>
          <Text variant="bodyLg" color="secondary">
            {error?.displayMessage ?? 'Something went wrong. Please try again.'}
          </Text>
          <Button
            label={isFetching ? 'Trying…' : 'Try again'}
            onPress={() => refetch()}
            disabled={isFetching}
            fullWidth
          />
          <Button label="Back to support" variant="ghost" onPress={() => router.back()} fullWidth />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding">
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title={ticket.title}
        /* The reference first — it is what support asks for — then where this
           happened, when it is about somewhere. */
        subtitle={[ticket.id, ticket.place].filter(Boolean).join(' · ')}
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[4], paddingBottom: space[6] }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isPending}
            onRefresh={() => refetch()}
            tintColor={colors.brand}
          />
        }
      >
        {/* The outcome, restated at the top so it survives a long thread. */}
        <Text variant="caption" color="secondary">
          {ticket.stateLabel} · {ticket.whenLabel}
        </Text>

        {messages.map((message) => (
          <TicketMessageRow key={message.id} message={message} />
        ))}
      </ScrollView>

      {/* The composer owns the bottom edge, so it carries the whole safe-area
          clearance itself — the root here is a KeyboardAvoidingView, which
          sets its own height and applies no inset. Without this the Send
          button sits under the gesture bar on every phone that has one,
          reachable only by pressing the strip the OS uses to go home.
          `useBottomEdgeInset` and not `useActionBarInset`: the shortfall
          version assumes a root that already paid, and there is none. */}
      <View
        style={{
          paddingHorizontal: layout.gutter,
          paddingTop: layout.gutter,
          paddingBottom: layout.gutter + bottomInset,
          gap: space[2],
          borderTopColor: colors.borderSubtle,
          borderTopWidth: StyleSheet.hairlineWidth,
          backgroundColor: colors.surface,
        }}
      >
        {canReply && askingVerdict ? (
          /*
           * Support says it is resolved. The student says whether it is.
           *
           * This replaces the composer rather than sitting above it, because
           * the question has to be answered to be useful — a box and a
           * question side by side is a question everybody scrolls past. Both
           * answers lead somewhere: "still need help" hands back the composer
           * on the spot, and the thread genuinely accepts the reply.
           */
          <>
            {sendError ? (
              <InlineAlert tone="error" title="Not sent" body={sendError.displayMessage} />
            ) : null}
            <Text variant="bodyStrong">Support marked this resolved</Text>
            <Text variant="caption" color="secondary">
              {ticket?.stateLabel ? `${ticket.stateLabel}. ` : ''}
              Is it sorted? Close this, or keep the conversation going.
            </Text>
            <Button
              label="Yes, close this"
              loadingLabel="Sending"
              loading={confirming}
              fullWidth
              disabled={confirming || isSending}
              onPress={confirmSorted}
            />
            <Button
              label="No, I still need help"
              variant="secondary"
              fullWidth
              disabled={confirming}
              onPress={() => remember('continue')}
            />
          </>
        ) : canReply && closedByYou ? (
          /*
           * Closed from their side.
           *
           * The composer is put away rather than left open under a note — the
           * student said the thing is finished, and a text box is the screen
           * asking them to keep talking about it. One button brings it back,
           * because a problem that comes back is exactly the case this has to
           * survive, and the thread genuinely still accepts replies.
           */
          <>
            <Text variant="bodyStrong">You closed this</Text>
            <Text variant="caption" color="secondary">
              You told us it was sorted, so we have stopped here. If it comes back, pick the
              conversation up again — it goes to the same person.
            </Text>
            <Button label="Reopen this conversation" variant="secondary" fullWidth onPress={reopen} />
          </>
        ) : canReply ? (
          <>
            {sendError ? (
              <InlineAlert tone="error" title="Not sent" body={sendError.displayMessage} />
            ) : null}
            {/* Said once, above the box, on a thread the student has chosen to
                carry on. Without it a reply into a resolved ticket looks like
                shouting into a closed room. */}
            {ticket?.state === 'resolved' && verdict === 'continue' ? (
              <Text variant="caption" color="secondary">
                This was marked resolved. Reply here and it goes back to support.
              </Text>
            ) : null}
            <TextField
              label="Reply"
              value={reply}
              onChangeText={setReply}
              placeholder="Add anything new — a date, a photo, what the owner said."
              multiline
            />
            <Button
              label="Send"
              loadingLabel="Sending"
              loading={isSending}
              fullWidth
              disabled={reply.trim().length === 0 || isSending}
              onPress={send}
            />
          </>
        ) : (
          /*
           * A closed thread offers a new request instead of a text box.
           *
           * The server refuses a reply to one with a 409, so a composer here
           * would be a box that accepts typing and then rejects it. Saying so
           * up front, with the way forward attached, is the honest version.
           */
          <>
            <Text variant="caption" color="secondary" style={styles.centred}>
              This one is closed. If it has come back, open a new request and we will pick it up
              there.
            </Text>
            <Button
              label="New support request"
              variant="secondary"
              fullWidth
              onPress={() => router.push('/support/new')}
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
});
