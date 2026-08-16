import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text, TextField } from '@/components/ui';
import { StandardHeader, StateTemplate } from '@/components/shell';
import { TicketMessageRow } from '@/components/lifecycle';
import { errorStates } from '@/constants/copy';
import { findTicket, ticketThread } from '@/data/support';
import { useTheme } from '@/context/ThemeContext';

/**
 * Screen 61 — the thread.
 *
 * Two things here are worth more than the chat itself.
 *
 * **Support is a named person.** "Sneha · LAMPOSE" rather than "LAMPOSE
 * Support". A named human is answerable; a brand is not, and a student who
 * feels they are talking to a queue writes differently — shorter, angrier, and
 * with less of the detail we need.
 *
 * **System lines are not bubbles.** They record what *happened* — "we asked
 * Padma on 10 August, she has 3 working days" — rather than what anyone said.
 * Giving a process guarantee the shape of speech lets it be mistaken for a
 * person's reassurance, and those are worth different amounts when the pump is
 * still not fixed on the 21st.
 */
export default function TicketThread() {
  const { colors, space, layout, mode } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const ticket = useMemo(() => (id ? findTicket(id) : undefined), [id]);
  const [reply, setReply] = useState('');

  if (!ticket) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StateTemplate copy={errorStates.notFound()} onPrimary={() => router.replace('/support')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title={ticket.title}
        subtitle={`${ticket.id} · ${ticket.place}`}
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

        {ticketThread.map((message) => (
          <TicketMessageRow key={message.id} message={message} />
        ))}
      </ScrollView>

      <View
        style={{
          padding: layout.gutter,
          gap: space[2],
          borderTopColor: colors.borderSubtle,
          borderTopWidth: StyleSheet.hairlineWidth,
          backgroundColor: colors.surface,
        }}
      >
        <TextField
          label="Reply"
          value={reply}
          onChangeText={setReply}
          placeholder="Add anything new — a date, a photo, what the owner said."
          multiline
        />
        <Button label="Send" fullWidth disabled={reply.trim().length === 0} onPress={() => setReply('')} />
      </View>
    </KeyboardAvoidingView>
  );
}
