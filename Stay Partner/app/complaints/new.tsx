import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Chip, ChipRow, Input, Select } from '@/components/ui';
import { useMyProperties } from '@/services/hooks/usePortfolio';
import { createComplaintApi } from '@/services/api/domain.api';
import { ApiError } from '@/services/api/client';

const CATEGORIES = ['Maintenance', 'Cleanliness', 'Noise', 'Payment', 'Guest conduct', 'Other'];
const PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' },
] as const;

/**
 * Log a complaint — about a property this owner actually owns.
 *
 * `createComplaintApi` has existed in `domain.api.ts` since the real
 * `complaints/index.tsx` (list + resolve) was built, with nothing calling it:
 * there was a place to READ complaints and no way to FILE one. This is that
 * form. The backend now requires and verifies `propertyId` against this
 * partner's own phone number — see `createComplaint` in
 * `partnerDomains.controller.js` — so the property picker below is not
 * decorative, it is the only way this can succeed.
 */
export default function NewComplaintScreen() {
  const router = useRouter();
  const { properties } = useMyProperties();

  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]['id']>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propertyOptions = properties.map((p) => p.name || 'Unnamed property');
  const selectedLabel = properties.find((p) => (p.id || p._id) === propertyId)?.name || null;

  const canSubmit = Boolean(propertyId) && title.trim().length > 0 && description.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createComplaintApi({
        propertyId,
        title: title.trim(),
        category,
        priority,
        description: description.trim(),
      });
      router.replace('/complaints');
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'Could not send that. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      padX={22}
      contentStyle={styles.fill}
      footer={<Button label="Log complaint" onPress={submit} disabled={!canSubmit} loading={submitting} />}
      stickyHeader={
        <View style={styles.backRow}>
          <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
        </View>
      }
    >
      <Text variant="pageTitleSm" style={styles.title}>
        New complaint
      </Text>

      <View style={styles.field}>
        <Select
          label="Which property?"
          options={propertyOptions}
          value={selectedLabel}
          onChange={(label) => {
            const match = properties.find((p) => (p.name || 'Unnamed property') === label);
            setPropertyId(match ? (match.id || match._id || null) : null);
          }}
          placeholder="Select a property"
        />
      </View>

      <Text variant="label" style={styles.label}>
        Category
      </Text>
      <ChipRow style={styles.field}>
        {CATEGORIES.map((cat) => (
          <Chip key={cat} label={cat} selected={category === cat} onPress={() => setCategory(cat)} />
        ))}
      </ChipRow>

      <Text variant="label" style={styles.label}>
        Priority
      </Text>
      <ChipRow style={styles.field}>
        {PRIORITIES.map((p) => (
          <Chip key={p.id} label={p.label} selected={priority === p.id} onPress={() => setPriority(p.id)} />
        ))}
      </ChipRow>

      <Input
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="A short summary"
        maxLength={200}
        containerStyle={styles.field}
      />

      <Input
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="What happened, and what you need"
        multiline
        minHeight={100}
        containerStyle={styles.field}
      />

      {error ? (
        <Text variant="caption" color="error" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 2 },
  title: { marginBottom: 18 },
  label: { marginBottom: 8 },
  field: { marginBottom: 16 },
  error: { marginTop: -6, marginBottom: 10 },
});
