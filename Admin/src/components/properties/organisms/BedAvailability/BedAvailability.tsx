import React, { useCallback, useEffect, useState } from 'react';
import { Minus, Pencil, Plus } from 'lucide-react';
import { Badge } from '../../../common/atoms/Badge';
import { Box } from '../../../common/atoms/Box';
import { Button } from '../../../common/atoms/Button';
import { Heading } from '../../../common/atoms/Heading';
import { Inline } from '../../../common/atoms/Inline';
import { PlainButton } from '../../../common/atoms/PlainButton';
import { Region } from '../../../common/atoms/Region';
import { Skeleton } from '../../../common/atoms/Skeleton';
import { Text } from '../../../common/atoms/Text';
import { cx } from '../../../common/utils';
import { formatDateTime } from '../../../../lib/format';
import {
  propertyService,
  type PropertyInventoryItem,
} from '../../../../api/services/propertyService';

/**
 * Beds per room type: the TOTAL next to what is FREE right now.
 *
 * The total is capacity — `categoryDetails.sharingBeds`, edited with the rest
 * of the property. What is free lives on `partner_share_types` and moves by
 * itself: down when an owner accepts a request, up on a cancel or check-out.
 * It is the number students see as "N left". The drawer only ever showed the
 * first, so a bed being booked looked like nothing had changed.
 *
 * "Edit free" changes free beds only, never the total, and saves straight
 * away. The stepper runs 0 … total. Going above total − Lampose bookings is an
 * OVERRIDE, allowed on purpose: a PG tenant can leave while their booking still
 * reads "in house", and nothing else frees that bed. It is warned about before
 * saving and shown afterwards as "marked vacant"; the booking is not touched.
 *
 * Self-loading, so the drawer and the edit dialog can both drop it in with
 * just an id. A pending (unverified) listing has no beds to count yet.
 */
export const BedAvailability: React.FC<{
  propertyId: string;
  isVerified: boolean;
  /** Where the capacity is changed — a sentence for the empty-count hint. */
  capacityHint?: string;
  onToast?: (toast: { tone: 'good' | 'crit'; message: string }) => void;
}> = ({ propertyId, isVerified, capacityHint = 'Add it with Edit (sharingBeds).', onToast }) => {
  const [items, setItems] = useState<PropertyInventoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(0);
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await propertyService.getInventory(propertyId);
    if (res.success) setItems(res.data);
    else {
      setItems([]);
      setError(res.message || 'Could not load bed counts.');
    }
  }, [propertyId]);

  useEffect(() => {
    setItems(null);
    setEditing(null);
    if (isVerified) void load();
  }, [isVerified, load]);

  const startEdit = (item: PropertyInventoryItem) => {
    setEditing(item.shareTypeId);
    setDraft(item.availableBeds ?? 0);
    setRowError(null);
  };

  const save = async (item: PropertyInventoryItem) => {
    setSaving(true);
    setRowError(null);
    const res = await propertyService.setFreeBeds(propertyId, item.shareTypeId, draft);
    setSaving(false);
    if (res.success && res.data) {
      const next = res.data;
      setItems((prev) => prev && prev.map((i) => (
        i.shareTypeId === item.shareTypeId
          ? { ...i, ...next, label: i.label, capacity: i.capacity, recorded: true }
          : i
      )));
      setEditing(null);
      onToast?.({ tone: 'good', message: `${item.label}: ${draft} free now.` });
    } else {
      setRowError(res.message || 'Could not save free beds.');
    }
  };

  return (
    <Region>
      <Box className="flex items-center justify-between mb-1">
        <Heading level={3} className="text-micro uppercase text-ink-3">Beds · free now</Heading>
        {isVerified && items !== null && (
          <PlainButton type="button" onClick={() => void load()} className="text-micro text-accent">
            Refresh
          </PlainButton>
        )}
      </Box>

      {!isVerified ? (
        <Text className="text-sm text-ink-3">
          Bed counts start once this listing is verified.
        </Text>
      ) : items === null ? (
        <Box className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Box>
      ) : error ? (
        <Text className="text-sm text-crit">{error}</Text>
      ) : items.length === 0 ? (
        <Text className="text-sm text-ink-3">
          This listing has no sharing or room types recorded.
        </Text>
      ) : (
        <Box className="divide-y divide-line">
          {items.map((item) => {
            if (!item.recorded) {
              return (
                <Box key={item.shareTypeId} className="py-2">
                  <Box className="flex items-baseline justify-between gap-3">
                    <Inline className="text-sm text-ink">{item.label}</Inline>
                    <Badge tone="warn">No total set</Badge>
                  </Box>
                  <Text className="text-micro text-ink-3 mt-0.5">
                    No total bed count, so free beds can't be tracked. {capacityHint}
                  </Text>
                </Box>
              );
            }

            const total = item.totalBeds ?? 0;
            const free = item.availableBeds ?? 0;
            const safeMax = item.maxFree ?? total;
            const isEditing = editing === item.shareTypeId;
            const overrideCount = isEditing ? Math.max(0, draft - safeMax) : 0;

            return (
              <Box key={item.shareTypeId} className="py-2 space-y-1">
                <Box className="flex items-center justify-between gap-3">
                  <Box className="min-w-0">
                    <Inline className="text-sm text-ink">{item.label}</Inline>
                    {item.isAvailable === false && (
                      <Badge tone="neutral" className="ml-2">Paused</Badge>
                    )}
                  </Box>
                  <Box className="flex items-center gap-2 shrink-0">
                    <Badge tone={free > 0 ? 'good' : 'warn'}>
                      {free > 0 ? `${free} free` : 'Full'}
                    </Badge>
                    <Inline className="text-sm text-ink-3 tabular">of {total}</Inline>
                  </Box>
                </Box>

                <Box className="flex flex-wrap gap-x-3 gap-y-0.5 text-micro text-ink-3">
                  <Inline>Lampose bookings: <Inline className="tabular text-ink-2">{item.bookedInApp}</Inline></Inline>
                  <Inline>Taken outside app: <Inline className="tabular text-ink-2">{item.offlineOccupied}</Inline></Inline>
                  {(item.markedVacant ?? 0) > 0 && (
                    <Inline className="text-warn">
                      Marked vacant (override): <Inline className="tabular">{item.markedVacant}</Inline>
                    </Inline>
                  )}
                  {item.freeBedsEditedAt && (
                    <Inline>
                      Set by hand {formatDateTime(item.freeBedsEditedAt)}
                      {item.freeBedsEditedBy ? ` · ${item.freeBedsEditedBy}` : ''}
                    </Inline>
                  )}
                </Box>

                {isEditing ? (
                  <Box className="mt-1 rounded-md border border-line p-2 space-y-2">
                    <Box className="flex items-center gap-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        icon={Minus}
                        aria-label="One fewer free bed"
                        disabled={saving || draft <= 0}
                        onClick={() => setDraft((d) => Math.max(0, d - 1))}
                      />
                      <Inline className="text-section text-ink tabular min-w-8 text-center" aria-live="polite">
                        {draft}
                      </Inline>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        icon={Plus}
                        aria-label="One more free bed"
                        disabled={saving || draft >= total}
                        onClick={() => setDraft((d) => Math.min(total, d + 1))}
                      />
                      <Inline className="text-micro text-ink-3">
                        0 – {total}. Total stays {total}.
                      </Inline>
                    </Box>
                    {overrideCount > 0 && (
                      <Text className="text-micro text-warn">
                        {overrideCount === 1 ? '1 bed is' : `${overrideCount} beds are`} still held by a
                        Lampose booking. Only free {overrideCount === 1 ? 'it' : 'them'} if that tenant has
                        moved out — students can book it again. The booking itself is not changed.
                      </Text>
                    )}
                    {rowError && <Text className="text-micro text-crit">{rowError}</Text>}
                    <Box className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        loading={saving}
                        disabled={draft === free}
                        onClick={() => void save(item)}
                      >
                        {overrideCount > 0 ? 'Free anyway' : 'Save free beds'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </Box>
                  </Box>
                ) : (
                  <PlainButton
                    type="button"
                    onClick={() => startEdit(item)}
                    className={cx('inline-flex items-center gap-1 text-micro text-accent')}
                  >
                    <Pencil className="size-3" strokeWidth={2} />
                    Edit free beds
                  </PlainButton>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Region>
  );
};
