import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '@/components/common';
import { useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Chip,
  ChipRow,
  Input,
} from '@/components/common';
import { useSupportActions, useSupportCategories } from '@/services/hooks/useSupport';
import { ApiError } from '@/services/api/client';
import { backRowBase } from '@/components/common/utils/styles';

/**
 * A ticket about the owner's OWN side of the product — payouts, a listing, a
 * guest's account, the app itself. Categories are fetched rather than
 * hardcoded (`GET /partners/support/categories`), so this screen can never
 * offer a word the server refuses — see `support.audiences.js`.
 *
 * A guest's ticket about a PROPERTY never starts here — that is the student's
 * "What's this about?" question in the User App, and it reaches this owner
 * already in their inbox (`/support`) the moment the student sends it. This
 * screen is one-sided on purpose: an owner cannot open a ticket as though a
 * guest had filed it.
 */
export function NewTicketScreen() {
  const router = useRouter();
  const { data: categories } = useSupportCategories();
  const { create } = useSupportActions();

  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  const canSubmit = Boolean(category) && description.trim().length > 0 && !create.isPending;

  const submit = async () => {
    if (!category || !canSubmit) return;
    try {
      const thread = await create.mutateAsync({ category, body: description.trim() });
      router.replace(`/support/ticket?id=${thread.reference}`);
    } catch {
      /* create.error renders below; the tap simply does nothing further. */
    }
  };

  return (
    <Screen
      padX={22}
      contentStyle={styles.fill}
      footer={<Button label="Submit ticket" onPress={submit} disabled={!canSubmit} loading={create.isPending} />}
      stickyHeader={
        <Box style={styles.backRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </Box>
      }
    >
      <Text variant="pageTitleSm" style={styles.title}>
        New support ticket
      </Text>

      <Text variant="label" style={styles.label}>
        Category
      </Text>
      <ChipRow style={styles.field}>
        {(categories?.categories ?? []).map((cat) => (
          <Chip
            key={cat}
            label={cat}
            selected={category === cat}
            onPress={() => setCategory(category === cat ? null : cat)}
          />
        ))}
      </ChipRow>

      <Input
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Describe what happened…"
        multiline
        minHeight={100}
        containerStyle={styles.field}
      />

      {create.error && (
        <Text variant="caption" color="error" style={styles.error}>
          {create.error instanceof ApiError ? create.error.displayMessage : 'Could not send that. Try again.'}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { ...backRowBase, marginBottom: 2 },
  title: { marginBottom: 18 },
  label: { marginBottom: 8 },
  field: { marginBottom: 16 },
  error: { marginTop: -6, marginBottom: 10 },
});
