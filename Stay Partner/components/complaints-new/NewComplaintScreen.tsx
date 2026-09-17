import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '@/components/common';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Chip, ChipRow, Input, Select } from '@/components/common';
import { useMyProperties } from '@/services/hooks/usePortfolio';
import { useSupportActions } from '@/services/hooks/useSupport';
import { ApiError } from '@/services/api/client';
import { backRowBase } from '@/components/common/utils/styles';

/**
 * Report a problem with a guest.
 *
 * ## This is a support ticket now
 *
 * It used to write to `partner_complaints`, a collection nothing but this app
 * ever read: no admin page, no student view, no push. An owner reporting a
 * guest who broke a window was writing a note to themselves.
 *
 * A complaint about a guest is a conversation with the Lampose team, so it is
 * filed as one — a support ticket in the `guest` category, which lands in the
 * console's queue beside every other ticket, gets a reply, and pushes that
 * reply back to the owner. The "Complaints" tile on the dashboard counts
 * these tickets.
 *
 * ## What is kept from the old form
 *
 * The property (the team needs to know which), a one-line summary, the
 * details, and how urgent the owner thinks it is. Category chips went: every
 * one of these is about a guest, and "what kind of guest problem" is better
 * said in the summary than picked from a list of six.
 */
const PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Normal' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' },
] as const;

export function NewComplaintScreen() {
  const router = useRouter();
  const { properties } = useMyProperties();
  const { create } = useSupportActions();

  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]['id']>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const propertyOptions = properties.map((p) => p.name).filter(Boolean) as string[];
  const selectedLabel = properties.find((p) => (p.id || p._id) === propertyId)?.name || null;

  const canSubmit =
    Boolean(propertyId) && title.trim().length > 0 && description.trim().length > 0 && !create.isPending;

  const submit = async () => {
    if (!canSubmit || !propertyId) return;
    setError(null);
    try {
      /*
       * One body, shaped so the team reads it top-down: the summary first,
       * then the urgency, then what happened. The server derives the ticket's
       * subject from the first line, so the summary becomes the queue row.
       */
      const urgency = PRIORITIES.find((p) => p.id === priority)?.label ?? 'Normal';
      const body = `${title.trim()}\n\nPriority: ${urgency}\nProperty: ${selectedLabel ?? propertyId}\n\n${description.trim()}`;
      const thread = await create.mutateAsync({ category: 'guest', body, listingId: propertyId });
      router.replace(`/support/ticket?id=${thread.reference}` as never);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'Could not send this report. Please try again.');
    }
  };

  return (
    <Screen
      padX={22}
      contentStyle={styles.stack}
      footer={<Button label="Send to Lampose" onPress={() => { void submit(); }} disabled={!canSubmit} loading={create.isPending} />}
      stickyHeader={(
        <Box style={styles.backRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </Box>
      )}
    >
      <Text variant="pageTitleSm" style={styles.title}>
        Report a guest problem
      </Text>
      <Text variant="body" color="textSecondary" style={styles.lede}>
        This goes to the Lampose team as a support conversation. They will reply here, and you
        will be notified.
      </Text>

      <Box style={styles.field}>
        <Select
          label="Which property?"
          options={propertyOptions}
          value={selectedLabel}
          onChange={(name) => {
            const match = properties.find((p) => p.name === name);
            setPropertyId(match ? String(match.id || match._id) : null);
          }}
          placeholder="Choose a property"
        />
      </Box>

      <Box style={styles.field}>
        <Text variant="label" color="textSecondary" style={styles.label}>How urgent?</Text>
        <ChipRow>
          {PRIORITIES.map((p) => (
            <Chip key={p.id} label={p.label} selected={priority === p.id} onPress={() => setPriority(p.id)} />
          ))}
        </ChipRow>
      </Box>

      <Input
        label="In one line"
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Guest in room 4 has not paid this month"
        containerStyle={styles.field}
        maxLength={140}
      />

      <Input
        label="What happened?"
        value={description}
        onChangeText={setDescription}
        placeholder="Dates, room, what was said or done, anything you have tried."
        multiline
        numberOfLines={5}
        containerStyle={styles.field}
      />

      {error ? (
        <Text variant="caption" color="errorInk" style={styles.error}>{error}</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 0 },
  backRow: { ...backRowBase, marginBottom: 4 },
  title: { marginBottom: 6 },
  lede: { marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { marginBottom: 8 },
  error: { marginTop: 4 },
});
