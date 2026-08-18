import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Checkbox, IconButton, Input, Button, Text } from '@/components/ui';
import { useColors } from '@/hooks/useColors';

/**
 * Which physical documents an owner has seen for a guest — replaces
 * collecting an Aadhar number and a photograph of it. The owner types
 * whatever the guest actually showed them (Aadhar card, PAN, Voter ID,
 * whatever fits the guest in front of them) and ticks it once they have
 * genuinely seen and kept a note of it. Nothing here uploads anything;
 * this is a checklist against what happened in the room, not a document
 * store.
 *
 * A fresh entry starts UNCHECKED on purpose — typing a name records what the
 * document is called, not that it has been produced. The tick is a separate,
 * deliberate confirmation.
 */
export type DocumentEntry = { name: string; collected: boolean };

export function DocumentsChecklist({
  documents,
  onChange,
}: {
  documents: DocumentEntry[];
  onChange: (next: DocumentEntry[]) => void;
}) {
  const c = useColors();
  const [draftName, setDraftName] = useState('');

  const addDocument = () => {
    const name = draftName.trim();
    if (!name) return;
    onChange([...documents, { name, collected: false }]);
    setDraftName('');
  };

  const toggle = (index: number) => {
    onChange(documents.map((d, i) => (i === index ? { ...d, collected: !d.collected } : d)));
  };

  const remove = (index: number) => {
    onChange(documents.filter((_, i) => i !== index));
  };

  return (
    <View>
      {documents.map((doc, i) => (
        <View key={`${doc.name}-${i}`} style={styles.row}>
          <View style={styles.checkboxWrap}>
            <Checkbox label={doc.name} checked={doc.collected} onChange={() => toggle(i)} />
          </View>
          <IconButton
            name="close"
            size={16}
            label={`Remove ${doc.name}`}
            onPress={() => remove(i)}
          />
        </View>
      ))}

      <View style={styles.addRow}>
        <Input
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Document name, e.g. Aadhar Card"
          onSubmitEditing={addDocument}
          returnKeyType="done"
          containerStyle={styles.addInput}
        />
        <Button label="Add" onPress={addDocument} variant="secondary" size="sm" disabled={!draftName.trim()} />
      </View>

      {documents.length === 0 ? (
        <Text variant="badge" color="textTertiary" style={styles.hint}>
          Add a document, then tick it once you've actually seen it.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  checkboxWrap: { flex: 1 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  addInput: { flex: 1, marginBottom: 0 },
  hint: { marginTop: 8, lineHeight: 16 },
});
