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
import { ApiError } from '@/services/api/client';
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
  /* A failed load and a failed save are SAID. Both used to go to `logWarn`
     only: a failed load looked exactly like "no room types", and a failed
     save went back to the previous screen as if it had worked. */
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setLoadError(null);
    try {
      const data = await fetchShareTypesApi();
      if (Array.isArray(data) && data.length === 0) {
        setShareTypes([]);
        setShareTypesList([]);
      }
      if (Array.isArray(data) && data.length > 0) {
        const mapped = data.map((st: any) => ({
          id: st.shareTypeId || st.id || st._id,
          label: st.name || 'Room',
          /* The real price or "not set" — never a stand-in ₹8,000. And not
             "per bed" on a hotel room, which is let whole. */
          pricePerBed: st.monthlyPrice
            ? `₹${Number(st.monthlyPrice).toLocaleString('en-IN')}${String(st.category || '') === 'HOTEL' ? '' : ' per bed'}`
            : 'Price not set',
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
      setLoaded(true);
    } catch (err) {
      logWarn('Failed to fetch share types:', err);
      setLoadError(err instanceof ApiError ? err.displayMessage : 'We could not load your room types.');
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
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      /* EVERY row is written, not only the ones whose switch moved. Going
         offline marks each open row `pausedByMaster`, and going online below
         turns every row still carrying that mark back on. A row left off here
         was never written, kept its mark, and so came back on anyway — the
         owner's choice ignored. A per-row write clears the mark, so after this
         each row is exactly what the owner left it as. */
      const rows = shareTypesList;
      /* Every row, and every failure counted: `Promise.all` stopped at the
         first refusal and hid how many of the others had already saved. */
      const results = await Promise.allSettled(rows.map((t) => setShareTypeAvailability(t.id, draft[t.id])));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) {
        setSaveError(
          failed === rows.length
            ? 'Nothing was saved. Check your connection and try again.'
            : `${failed} of ${rows.length} room types did not save. Try again.`,
        );
        await loadShareTypes();
        return;
      }
      saveShareTypes(draft);

      /* Sync overall partner online availability:
         If at least one room type is enabled in draft, set partner acceptingBookings = true.
         If all room types are disabled, set partner acceptingBookings = false. */
      const anyAvailable = Object.values(draft).some(Boolean);
      await toggleShareTypesAvailabilityApi(anyAvailable);
      setAvailable(anyAvailable);
      router.back();
    } catch (err) {
      logWarn('Failed to save share types availability:', err);
      setSaveError(err instanceof ApiError ? err.displayMessage : 'That did not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      contentStyle={styles.stack}
            footer={
              <Button
                label={confirming ? 'Confirm & go online' : 'Save'}
                onPress={save}
                loading={saving}
                disabled={!canSubmit || saving}
              />
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

      {loadError ? (
        <EmptyState
          icon="alert-circle"
          title="We could not load your room types"
          body={loadError}
          actionLabel="Try again"
          onAction={() => { void loadShareTypes(); }}
        />
      ) : null}

      {loaded && !loadError && !shareTypesList.length ? (
        <EmptyState
          icon="bed"
          title="No room types yet"
          body="Add the sharing types and their bed counts in your property's details, and they will appear here."
        />
      ) : null}

      {saveError ? (
        <Text variant="bodySm" color="error">
          {saveError}
        </Text>
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
                  {t.pricePerBed}{t.propertyName ? ` · ${t.propertyName}` : ''}
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
