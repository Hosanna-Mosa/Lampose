import { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '@/components/common';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen, Text, Button, IconButton, Icon, Switch, Divider, Select, EmptyState,
} from '@/components/common';
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
import { backRowBase, boldLabel } from '@/components/common/utils/styles';

/*
 * The four categories, plus "all" — the same codes and the same words the
 * Bookings tab filters by, because an owner should not have to learn two
 * names for one kind of building.
 */
type CategoryFilter = 'all' | 'PG_HOSTEL' | 'BACHELOR' | 'HOTEL' | 'COLIVE';
const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All kinds' },
  { key: 'PG_HOSTEL', label: 'PG / Hostel' },
  { key: 'BACHELOR', label: 'Bachelor' },
  { key: 'HOTEL', label: 'Hotels' },
  { key: 'COLIVE', label: 'House / Co-live' },
];
const CATEGORY_VALUES = CATEGORIES.map((o) => o.key);
const categoryLabel = (key: CategoryFilter): string =>
  CATEGORIES.find((o) => o.key === key)?.label ?? 'All kinds';

export function ShareTypesScreen() {
  const c = useColors();
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();

  /* Empty until the server answers. Seeding with the fixture drew two
     invented room types on a property that may have neither, and left them on
     screen for good if the request failed. */
  const [shareTypesList, setShareTypesList] = useState<any[]>([]);
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  /*
   * Which kind of building, for finding one row among many.
   *
   * An owner running several properties accumulates a room type per layout
   * per building — this account has 151 — and the list is names and prices
   * with nothing to tell "1 BHK" at ₹7,000 from "1 BHK" at ₹12,000. Narrowing
   * by category is the cheapest way to get to the one being looked for.
   *
   * The filter NARROWS THE VIEW ONLY. `draft` is keyed by id and `save`
   * compares it against the full list, so a switch flipped under one filter
   * is still saved after the filter changes — hiding a row must never
   * silently drop an edit to it.
   */
  const [category, setCategory] = useState<CategoryFilter>('all');

  /* Only the kinds this owner actually has. Offering "Hotels" to somebody
     with none is a filter that can only ever empty the screen. */
  const kinds = useMemo(
    () => [...new Set(shareTypesList.map((t) => t.category).filter(Boolean))] as CategoryFilter[],
    [shareTypesList],
  );

  const shown = useMemo(
    () => (category === 'all'
      ? shareTypesList
      : shareTypesList.filter((t) => t.category === category)),
    [shareTypesList, category],
  );

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
          /* Which building this room type belongs to. Both empty on a row
             whose property has since been deleted — still the owner's to
             switch off, so it is listed rather than hidden. */
          category: String(st.category || ''),
          propertyName: String(st.propertyName || ''),
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
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>

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

      {/* Drawn only where there is more than one kind to choose between — an
          owner with a single PG does not need a control that can only ever
          say "PG / Hostel". `overlay` so opening it draws over the list
          instead of pushing every row down the screen. */}
      {kinds.length > 1 ? (
        <Select
          label="Kind"
          overlay
          options={CATEGORY_VALUES.filter((k) => k === 'all' || kinds.includes(k))}
          value={category}
          onChange={setCategory}
          format={categoryLabel}
        />
      ) : null}

      {confirming ? (
        <Box style={[styles.banner, { backgroundColor: c.accentTint }]}>
          <Icon name="info" size={16} color={c.accent} strokeWidth={2} style={styles.bannerIcon} />
          <Text variant="bodySm" color="accentInkDeep" style={styles.bannerText}>
            Confirm which sharing types are available, then go online. At least one has to be on.
          </Text>
        </Box>
      ) : null}

      {shareTypesList.length && !shown.length ? (
        <EmptyState
          icon="bed"
          title={`No ${categoryLabel(category).toLowerCase()} room types`}
          body="Nothing under this kind yet — switch to All kinds to see every one."
          actionLabel="Show all kinds"
          onAction={() => setCategory('all')}
        />
      ) : null}

      <Box style={[styles.list, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        {shown.map((t, i) => (
          <Box key={t.id}>
            {i > 0 ? <Divider /> : null}
            <Box style={styles.row}>
              <Box style={styles.rowBody}>
                <Text style={styles.rowLabel}>{t.label}</Text>
                <Text variant="caption" color="textSecondary">
                  {/* The building, where it is known. Two rows both called
                      "1 BHK" are only telling apart by which property they
                      are in — the price alone is a guess. */}
                  {t.pricePerBed} per bed{t.propertyName ? ` · ${t.propertyName}` : ''}
                </Text>
              </Box>
              <Switch
                value={draft[t.id]}
                onChange={(next) => setDraft((d) => ({ ...d, [t.id]: next }))}
                accessibilityLabel={`${t.label} visible to customers`}
              />
            </Box>
          </Box>
        ))}
      </Box>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  backRow: { ...backRowBase, marginBottom: -6 },
  title: { marginBottom: 4 },
  subtitle: { lineHeight: 20, marginBottom: 4 },

  banner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: radius.control, padding: 12 },
  bannerIcon: { marginTop: 1 },
  bannerText: { flex: 1, lineHeight: 19 },

  list: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowBody: { flex: 1, gap: 2 },
  rowLabel: { ...boldLabel },
});
