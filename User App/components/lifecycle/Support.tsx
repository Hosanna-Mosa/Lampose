import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { Ticket, TicketMessage, TicketState } from '@/types/support';

/**
 * Support rows and thread bubbles.
 *
 * The rule that shapes both: **a state label states the outcome, not the
 * state.** "Resolved" tells a student nothing they can act on; "Refunded
 * ₹1,000" and "Resolved · refund arrived 19 Mar" tell them whether they still
 * have a problem. Every closed ticket in this product has to answer "so what
 * happened" from the list, without opening it.
 *
 * Unread is carried by a left rule *and* a filled dot, never by colour alone.
 */

const STATE_STYLE: Record<TicketState, { icon: 'clock' | 'check' | 'alert' }> = {
  open: { icon: 'clock' },
  'awaiting-you': { icon: 'alert' },
  resolved: { icon: 'check' },
};

export type TicketRowProps = { ticket: Ticket; onPress?: () => void };

export function TicketRow({ ticket, onPress }: TicketRowProps) {
  const { colors, space, radius } = useTheme();

  const tone =
    ticket.state === 'resolved'
      ? { bg: colors.surfaceSunken, ink: colors.textSecondary, border: colors.border }
      : ticket.state === 'awaiting-you'
        ? { bg: colors.danger.tint, ink: colors.danger.ink, border: colors.danger.border }
        : { bg: colors.warning.tint, ink: colors.warning.ink, border: colors.warning.border };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.title}. ${ticket.stateLabel}. ${ticket.unread ? 'Unread.' : ''}`}
      style={({ pressed }) => [
        {
          backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          // The left rule. Paired with the dot below — never colour alone.
          borderLeftWidth: ticket.unread ? 3 : StyleSheet.hairlineWidth,
          borderLeftColor: ticket.unread ? colors.brand : colors.border,
          borderRadius: radius.card,
          padding: space[3],
          gap: space[2],
        },
      ]}
    >
      <View style={[styles.headRow, { gap: space[2] }]}>
        <View
          style={[
            styles.chip,
            {
              backgroundColor: tone.bg,
              borderColor: tone.border,
              borderRadius: radius.chip,
              paddingHorizontal: space[2],
              gap: space[1],
            },
          ]}
        >
          <Icon name={STATE_STYLE[ticket.state].icon} size={16} color={tone.ink} />
          {/* The outcome. Never the state name on its own. */}
          <Text variant="numMeta" style={{ color: tone.ink }}>
            {ticket.stateLabel}
          </Text>
        </View>
        <View style={[styles.whenRow, { gap: space[2] }]}>
          {ticket.unread ? (
            <View style={[styles.dot, { backgroundColor: colors.brand, borderRadius: radius.pill }]} />
          ) : null}
          <Text variant="numMeta" color="tertiary">
            {ticket.whenLabel}
          </Text>
        </View>
      </View>

      <Text variant="bodyStrong">{ticket.title}</Text>

      <View style={[styles.metaRow, { gap: space[2] }]}>
        <Text variant="numMeta" color="tertiary">
          {ticket.id}
        </Text>
        <Text variant="caption" color="tertiary" style={styles.flex}>
          {ticket.place}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * One message.
 *
 * A system line is not a bubble. It records **what happened** rather than what
 * anyone said — "we asked Padma, she has 3 working days" — and giving it the
 * shape of speech would let a student mistake a process guarantee for a
 * person's reassurance. Those are worth different amounts.
 */
export type TicketMessageRowProps = { message: TicketMessage };

export function TicketMessageRow({ message }: TicketMessageRowProps) {
  const { colors, space, radius } = useTheme();

  if (message.systemNote) {
    return (
      <View
        style={[
          styles.system,
          {
            borderLeftColor: colors.border,
            paddingLeft: space[3],
            paddingVertical: space[1],
            gap: 2,
          },
        ]}
      >
        <Text variant="caption" color="secondary">
          {message.body}
        </Text>
        <Text variant="numMeta" color="tertiary">
          {message.whenLabel}
        </Text>
      </View>
    );
  }

  const mine = message.author === 'you';

  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: space[1] }}>
      <View
        style={{
          maxWidth: '88%',
          backgroundColor: mine ? colors.brand : colors.surface,
          borderColor: colors.border,
          borderWidth: mine ? 0 : StyleSheet.hairlineWidth,
          borderRadius: radius.card,
          padding: space[3],
          gap: space[1],
        }}
      >
        {/* A named human on the support side. "LAMPOSE Support" answers nobody. */}
        {message.authorName ? (
          <Text variant="numMeta" color="secondary">
            {message.authorName} · LAMPOSE
          </Text>
        ) : null}
        <Text variant="body" style={mine ? { color: colors.onBrand } : undefined}>
          {message.body}
        </Text>
      </View>
      <Text variant="numMeta" color="tertiary">
        {message.whenLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  whenRow: { flexDirection: 'row', alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 26,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 7, height: 7 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  system: { borderLeftWidth: 2 },
  flex: { flex: 1 },
});
