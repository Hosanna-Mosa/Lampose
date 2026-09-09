import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Icon, Switch, Divider } from '@/components/ui';
import { saveShareTypes, setAvailable, setShareTypes } from '@/lib/shareTypes';
import {
  fetchShareTypesApi,
  setShareTypeAvailability,
  toggleShareTypesAvailabilityApi,
} from '@/services/api/domain.api';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { logWarn } from '@/lib/log';

export default function ShareTypesScreen() {
  const c = useColors();
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();

  /* Empty until the server answers. Seeding with the fixture drew two
     invented room types on a property that may have neither, and left them on
     screen for good if the request failed. */
  const [shareTypesList, setShareTypesList] = useState<any[]>([]);
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  const loadShareTypes = async () => {
    try {
      const data = await fetchShareTypesApi();
      if (Array.isArray(data) && data.length === 0) setShareTypes([]);
      if (Array.isArray(data) && data.length > 0) {
        const mapped = data.map((st: any) => ({
          id: st.shareTypeId || st.id || st._id,
          label: st.name || 'Room',
          pricePerBed: `₹${(st.monthlyPrice || 8000).toLocaleString('en-IN')}`,
          available: Boolean(st.isAvailable),
        }));
        setShareTypesList(mapped);
        setDraft(Object.fromEntries(mapped.map((t) => [t.id, t.available])));
        /* Feed the shared cache the dashboard's banner and the online toggle
           both read, so they stop disagreeing with this screen. */
        setShareTypes(mapped);
      }
    } catch (err) {
      logWarn('Failed to fetch share types:', err);
    }
  };

  useEffect(() => {
    loadShareTypes();
  }, []);

  const dirty = shareTypesList.some((t) => draft[t.id] !== t.available);
  const draftVisibleCount = Object.values(draft).filter(Boolean).length;
  const confirming = reason === 'accepting';
  const canSubmit = confirming ? draftVisibleCount > 0 : dirty;

  /*
   * Each switched row was never reaching the server.
   *
   * This used to call the partner-wide `toggleShareTypesAvailabilityApi` with
   * one boolean collapsed from "is anything in the draft still on" — so
   * switching a single room off here, then saving with others left on, wrote
   * `isAvailable: true` across every room type this owner has (see the note
   * on `updateShareTypeAvailability` in the backend). A room turned off never
   * actually turned off, and a stale pause on an unrelated property could get
   * silently switched back on in the same tap. `setShareTypeAvailability` is
   * the per-row route that was missing; every row whose switch actually moved
   * is written individually now, which is also the only way a bachelor room
   * paused here stops being requestable in the app.
   */
  const save = async () => {
    try {
      const changed = shareTypesList.filter((t) => draft[t.id] !== t.available);
      await Promise.all(changed.map((t) => setShareTypeAvailability(t.id, draft[t.id])));
      saveShareTypes(draft);

      /* "Confirm & go online" only raises the partner-wide flag from here —
         it must not bulk-write every row back on, which would undo the
         per-row save just above. */
      if (confirming) {
        await toggleShareTypesAvailabilityApi(true);
        setAvailable(true);
      }
    } catch (err) {
      logWarn('Failed to save share types availability:', err);
    }
    router.back();
  };

  return (
    <Screen
      contentStyle={styles.stack}
            footer={
              <Button label={confirming ? 'Confirm & go online' : 'Save'} onPress={save} disabled={!canSubmit} />
            }
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>

          <Text variant="screenTitle" style={styles.title}>
            Share types
          </Text>
        </>
      }
    >
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
        {shareTypesList.map((t, i) => (
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
