import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Icon, Switch, Divider } from '@/components/ui';
import { SHARE_TYPES, saveShareTypes, setAvailable } from '@/lib/shareTypes';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Per-sharing-type visibility, staged then saved — not live per-toggle.
 *
 * A toggle driven by a remount (mutate the shared list, subscribe, force a
 * fresh render via `key`) is the wrong shape for something the same screen
 * is actively pressing: the flip has to show the instant the finger lifts,
 * every time, which only plain local state guarantees. So the switches here
 * read and write a local draft; Save is what actually reaches
 * `lib/shareTypes.ts` — and what the Dashboard banner reads.
 */
export default function ShareTypesScreen() {
  const c = useColors();
  const router = useRouter();
  // Set on every attempt to turn the Dashboard's availability toggle on —
  // going online always confirms what's actually offered here first, rather
  // than only stopping by when nothing was selected yet.
  const { reason } = useLocalSearchParams<{ reason?: string }>();

  const [draft, setDraft] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SHARE_TYPES.map((t) => [t.id, t.available])),
  );

  const dirty = SHARE_TYPES.some((t) => draft[t.id] !== t.available);
  const draftVisibleCount = Object.values(draft).filter(Boolean).length;
  // Arrived here specifically to confirm before going online — every "turn
  // on" attempt on the Dashboard routes through this screen now, not only
  // when nothing was selected. Confirming with an already-fine selection has
  // to work even though nothing changed, so this doesn't gate on `dirty`.
  const confirming = reason === 'accepting';
  const canSubmit = confirming ? draftVisibleCount > 0 : dirty;

  const save = () => {
    saveShareTypes(draft);
    if (confirming && draftVisibleCount > 0) {
      setAvailable(true);
    }
    router.back();
  };

  return (
    <Screen
      contentStyle={styles.stack}
      footer={
        <Button label={confirming ? 'Confirm & go online' : 'Save'} onPress={save} disabled={!canSubmit} />
      }
    >
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <Text variant="screenTitle" style={styles.title}>
        Share types
      </Text>
      <Text variant="bodySm" color="textSecondary" style={styles.subtitle}>
        Turn a sharing type on to make it visible and bookable to customers. Turning one off hides
        it without deleting it.
      </Text>

      {confirming ? (
        <View style={[styles.banner, { backgroundColor: c.accentTint }]}>
          <Icon name="info" size={16} color={c.accent} strokeWidth={2} style={styles.bannerIcon} />
          <Text variant="bodySm" color="accentInkDeep" style={styles.bannerText}>
            Confirm which sharing types are available, then go online. At least one has to be on.
          </Text>
        </View>
      ) : null}

      <View style={[styles.list, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        {SHARE_TYPES.map((t, i) => (
          <View key={t.id}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.rowLabel}>{t.label}</Text>
                <Text variant="caption" color="textSecondary">
                  {t.pricePerBed} per bed
                </Text>
              </View>
              <Switch
                value={draft[t.id]}
                onChange={(next) => setDraft((d) => ({ ...d, [t.id]: next }))}
                accessibilityLabel={`${t.label} visible to customers`}
              />
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -6 },
  title: { marginBottom: 4 },
  subtitle: { lineHeight: 20, marginBottom: 4 },

  banner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: radius.control, padding: 12 },
  bannerIcon: { marginTop: 1 },
  bannerText: { flex: 1, lineHeight: 19 },

  list: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowBody: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18 },
});
