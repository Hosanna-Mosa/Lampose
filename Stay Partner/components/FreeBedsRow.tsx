import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Tappable, Text } from '@/components/common';
import { ApiError, setFreeBeds, type PropertyInventoryItem } from '@/services';
import { formatDateTime } from '@/lib/format';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * "Free now" for one room type, next to its total — and the owner's way to
 * correct it.
 *
 * The total (capacity) is a fact about the building and is edited with the
 * rest of the listing. What is FREE moves by itself whenever a request is
 * accepted, a booking is cancelled or a guest checks out, and it is the number
 * students see as "N left". Showing only the total made a booking look like it
 * changed nothing.
 *
 * Editing changes free beds only, and saves straight away. The − / + stepper
 * runs from 0 to the TOTAL. Going above total − Lampose bookings is allowed on
 * purpose: a PG tenant can leave (a dispute, an emergency) while their booking
 * still says "in house", and the owner knows the bed is empty. The row warns
 * before that save and names it afterwards ("1 Lampose booking marked vacant")
 * so it is never done by accident or forgotten. The booking is not changed.
 */
export function FreeBedsRow({
  propertyId,
  item,
  onSaved,
  compact = false,
}: {
  propertyId: string;
  item: PropertyInventoryItem;
  onSaved?: (next: PropertyInventoryItem) => void;
  /** Inside the edit form's room card: no border of its own. */
  compact?: boolean;
}) {
  const c = useColors();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number>(item.availableBeds ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* A reload underneath (focus, pull-to-refresh) brings a new number; the
     stepper starts from it unless the owner is mid-edit. */
  useEffect(() => {
    if (!editing) setValue(item.availableBeds ?? 0);
  }, [item.availableBeds, editing]);

  const frame = compact
    ? styles.compact
    : [styles.row, { borderColor: c.borderCard, backgroundColor: c.bg }];

  if (!item.recorded) {
    return (
      <View style={frame}>
        <Text variant="bodySm" style={{ color: c.textPrimary, fontFamily: fonts.semibold }}>
          {item.label}
        </Text>
        <Text variant="caption" color="textTertiary" style={styles.hint}>
          No total bed count yet, so free beds can't be tracked. Add the total beds for {item.label} in
          Edit details.
        </Text>
      </View>
    );
  }

  const total = item.totalBeds ?? 0;
  const free = item.availableBeds ?? 0;
  /* Free without overriding a Lampose booking. The stepper may go past it,
     up to the total. */
  const safeMax = item.maxFree ?? total;
  const overriding = value > safeMax;
  const overrideCount = Math.max(0, value - safeMax);
  const full = free <= 0;

  const parts: string[] = [];
  if (item.bookedInApp) {
    parts.push(`${item.bookedInApp} Lampose booking${item.bookedInApp === 1 ? '' : 's'}`);
  }
  if (item.offlineOccupied) {
    parts.push(`${item.offlineOccupied} taken outside the app`);
  }
  if (item.markedVacant) {
    parts.push(`${item.markedVacant} Lampose booking${item.markedVacant === 1 ? '' : 's'} marked vacant by you`);
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await setFreeBeds(propertyId, item.shareTypeId, value);
      onSaved?.({ ...item, ...next, label: item.label, capacity: item.capacity, recorded: true });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={frame}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text variant="bodySm" style={{ color: c.textPrimary, fontFamily: fonts.semibold }}>
            {item.label}
          </Text>
          <Text variant="caption" color="textTertiary">
            Total beds {total}
            {item.isAvailable === false ? ' · Paused' : ''}
          </Text>
        </View>

        <View
          style={[
            styles.freePill,
            { backgroundColor: full ? c.warningTint : c.successTint },
          ]}
        >
          <Text
            variant="bodySm"
            style={{ color: full ? c.warningOnTint : c.successOnTint, fontFamily: fonts.bold }}
          >
            {full ? 'Full' : `${free} free now`}
          </Text>
        </View>
      </View>

      {parts.length ? (
        <Text variant="caption" color="textSecondary">
          {parts.join(' · ')}
        </Text>
      ) : null}

      {item.freeBedsEditedAt ? (
        <Text variant="caption" color="textTertiary">
          Last set by hand {formatDateTime(new Date(item.freeBedsEditedAt))}
        </Text>
      ) : null}

      {editing ? (
        <View style={styles.editor}>
          <View style={styles.stepper}>
            <Tappable
              onPress={() => setValue((v) => Math.max(0, v - 1))}
              disabled={saving || value <= 0}
              accessibilityRole="button"
              accessibilityLabel="One fewer free bed"
              style={[styles.stepBtn, { borderColor: c.border, opacity: value <= 0 ? 0.4 : 1 }]}
            >
              <Text style={[styles.stepGlyph, { color: c.textPrimary }]}>−</Text>
            </Tappable>
            <Text style={[styles.stepValue, { color: c.textPrimary }]} accessibilityLiveRegion="polite">
              {value}
            </Text>
            <Tappable
              onPress={() => setValue((v) => Math.min(total, v + 1))}
              disabled={saving || value >= total}
              accessibilityRole="button"
              accessibilityLabel="One more free bed"
              style={[styles.stepBtn, { borderColor: c.border, opacity: value >= total ? 0.4 : 1 }]}
            >
              <Text style={[styles.stepGlyph, { color: c.textPrimary }]}>+</Text>
            </Tappable>
          </View>
          <Text variant="caption" color="textTertiary" style={styles.hint}>
            From 0 to {total}. The total ({total}) is not changed.
          </Text>
          {overriding ? (
            <View style={[styles.warn, { backgroundColor: c.warningTint }]}>
              <Text variant="caption" style={{ color: c.warningOnTint, fontFamily: fonts.semibold }}>
                {overrideCount === 1 ? '1 bed is' : `${overrideCount} beds are`} still held by a Lampose
                booking.
              </Text>
              <Text variant="caption" style={{ color: c.warningOnTint }}>
                Only free {overrideCount === 1 ? 'it' : 'them'} if that tenant has really moved out.
                Students will be able to book {overrideCount === 1 ? 'this bed' : 'these beds'} again. The
                booking itself stays as it is.
              </Text>
            </View>
          ) : null}
          {error ? (
            <Text variant="caption" style={{ color: c.error }}>
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="secondary"
              size="sm"
              fullWidth={false}
              disabled={saving}
              onPress={() => {
                setEditing(false);
                setError(null);
                setValue(free);
              }}
            />
            <Button
              label={saving ? 'Saving…' : overriding ? 'Free anyway' : 'Save free beds'}
              size="sm"
              fullWidth={false}
              loading={saving}
              disabled={value === free}
              onPress={save}
            />
          </View>
        </View>
      ) : (
        <Tappable
          onPress={() => setEditing(true)}
          accessibilityRole="button"
          accessibilityLabel={`Edit free beds for ${item.label}`}
          style={styles.editLink}
        >
          <Text variant="link" style={{ color: c.accent }}>
            Edit free beds
          </Text>
        </Tappable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, gap: 6 },
  compact: { gap: 6, marginTop: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headText: { flex: 1, gap: 2 },
  freePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  hint: { lineHeight: 16 },
  editor: { gap: 8, marginTop: 4 },
  warn: { borderRadius: 10, padding: 10, gap: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 22, lineHeight: 26, fontFamily: fonts.semibold },
  stepValue: { minWidth: 36, textAlign: 'center', fontSize: 22, fontFamily: fonts.bold },
  actions: { flexDirection: 'row', gap: 10 },
  editLink: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
});
