import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
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
 * **Support is a named person.** "Sneha · LAMPOSE" rather than "LAMPOSE
 * Support". A named human is answerable; a brand is not, and a student who
 * feels they are talking to a queue writes differently — shorter, angrier, and
 * with less of the detail we need. The name comes off the message's
 * `authorName`; a queue that leaves it blank gets the generic label and
 * deserves to.
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
 */
export default function TicketThread() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
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
      >
        {/* The outcome, restated at the top so it survives a long thread. */}
        <Text variant="caption" color="secondary">
          {ticket.stateLabel} · {ticket.whenLabel}
        </Text>

        {messages.map((message) => (
          <TicketMessageRow key={message.id} message={message} />
        ))}
      </ScrollView>

      {/* The composer owns the bottom edge, so it carries the safe-area inset
          itself. Without it the Send button sits under the gesture bar on
          every phone that has one — reachable only by pressing the strip the
          OS uses to go home. */}
      <View
        style={{
          paddingHorizontal: layout.gutter,
          paddingTop: layout.gutter,
          paddingBottom: layout.gutter,
          gap: space[2],
          borderTopColor: colors.borderSubtle,
          borderTopWidth: StyleSheet.hairlineWidth,
          backgroundColor: colors.surface,
        }}
      >
        {canReply ? (
          <>
            {sendError ? (
              <InlineAlert tone="error" title="Not sent" body={sendError.displayMessage} />
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
