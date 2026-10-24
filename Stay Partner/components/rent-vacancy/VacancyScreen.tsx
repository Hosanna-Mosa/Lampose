import { useRouter } from 'expo-router';

import {
  Badge, Box, Button, EmptyState, ErrorState, IconButton, Screen, Skeleton, Tappable, Text, TextButton,
} from '@/components/common';
import { rentStyles as styles } from '@/components/rent-common';
import { formatINR } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { useVacancy } from '@/services/hooks/useRent';
import type { VacancyResident } from '@/services/api/rent.api';

/**
 * Vacancy — beds by property and room type: how many are free, how many are
 * taken, and who is in them.
 *
 * The counts are the same `partner_share_types` numbers students are offered
 * against, so this screen and the listing never disagree. Correcting a count
 * is the existing Manage Rooms screen, linked rather than duplicated.
 */
export function VacancyScreen() {
  const c = useColors();
  const router = useRouter();
  const { vacancy, isLoading, isError, error, isRefetching, refetch } = useVacancy();

  const openResident = (r: VacancyResident) =>
    router.push({ pathname: '/rent/resident/[id]', params: { id: r.id } } as never);

  const names = (list: VacancyResident[]) => list.map((r) => (
    <Tappable key={r.id} onPress={() => openResident(r)} accessibilityRole="button">
      <Text variant="caption" color="textSecondary">
        • {r.guestName}{r.roomNumber ? ` · Room ${r.roomNumber}` : ''}
      </Text>
    </Tappable>
  ));

  return (
    <Screen
      contentStyle={styles.stack}
      refreshing={isRefetching}
      onRefresh={refetch}
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>
          <Box style={styles.head}>
            <Text variant="screenTitle">Vacancy</Text>
            <TextButton label="Manage rooms" onPress={() => router.push('/share-types')} />
          </Box>
        </>
      }
    >
      {isLoading ? (
        <Box style={styles.stack}>
          <Skeleton width="100%" height={80} radius={14} />
          <Skeleton width="100%" height={200} radius={16} />
        </Box>
      ) : isError && !vacancy ? (
        <ErrorState title="We could not load your beds" body={error?.displayMessage} onRetry={refetch} />
      ) : !vacancy || vacancy.properties.length === 0 ? (
        <EmptyState
          icon="bed"
          title="No beds set up yet"
          body="Add your room types and bed counts to see what is free and who is where."
          actionLabel="Manage rooms"
          onAction={() => router.push('/share-types')}
          style={styles.empty}
        />
      ) : (
        <>
          <Box style={styles.statRow}>
            <Box style={[styles.statTile, { borderColor: c.borderCard, backgroundColor: c.successTint }]}>
              <Text variant="label" color="successInk">Free beds</Text>
              <Text style={[styles.statValue, { color: c.successInk }]}>{vacancy.totals.freeBeds}</Text>
            </Box>
            <Box style={[styles.statTile, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
              <Text variant="label" color="textSecondary">Occupied</Text>
              <Text style={[styles.statValue, { color: c.textPrimary }]}>
                {vacancy.totals.occupiedBeds}
                <Text variant="caption" color="textTertiary"> of {vacancy.totals.totalBeds}</Text>
              </Text>
            </Box>
          </Box>

          {vacancy.properties.map((p) => (
            <Box key={p.propertyId} style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
              <Box style={styles.head}>
                <Text variant="cardTitle" style={styles.flex} numberOfLines={1}>{p.propertyName}</Text>
                <Badge label={`${p.freeBeds} free`} tone={p.freeBeds > 0 ? 'success' : 'neutral'} />
              </Box>

              {p.roomTypes.map((t) => {
                const share = t.totalBeds > 0 ? Math.min(1, t.occupiedBeds / t.totalBeds) : 0;
                /* Beds taken by people this app knows by name. The rest of
                   "occupied" is guests the owner counted by hand. */
                const unnamed = Math.max(0, t.occupiedBeds - t.residents.length);
                return (
                  <Box key={t.shareTypeId}>
                    <Box style={[styles.divider, { backgroundColor: c.borderSubtle }]} />
                    <Box style={styles.head}>
                      <Text variant="bodySm" style={styles.flex}>
                        {t.name}{t.monthlyPrice ? ` · ${formatINR(t.monthlyPrice)}/mo` : ''}
                      </Text>
                      <Text variant="cardTitle" color={t.freeBeds > 0 ? 'success' : 'textTertiary'}>
                        {t.freeBeds} of {t.totalBeds} free
                      </Text>
                    </Box>
                    <Box style={{ height: 6, borderRadius: 3, backgroundColor: c.surfaceSunken, marginVertical: 8 }}>
                      <Box
                        style={{
                          height: 6,
                          borderRadius: 3,
                          width: `${Math.round(share * 100)}%`,
                          backgroundColor: share >= 1 ? c.textTertiary : c.accent,
                        }}
                      />
                    </Box>
                    {!t.isAvailable ? (
                      <Text variant="caption" color="warningInk">Paused — not offered to students</Text>
                    ) : null}
                    {names(t.residents)}
                    {unnamed > 0 ? (
                      <Text variant="caption" color="textTertiary">
                        • {unnamed} other guest{unnamed === 1 ? '' : 's'} you counted by hand
                      </Text>
                    ) : null}
                  </Box>
                );
              })}

              {p.others.length ? (
                <Box>
                  <Box style={[styles.divider, { backgroundColor: c.borderSubtle }]} />
                  <Text variant="bodySm">Other residents</Text>
                  {names(p.others)}
                </Box>
              ) : null}
            </Box>
          ))}

          {vacancy.totals.freeBeds > 0 ? (
            <Button
              label="Fill a bed — add a resident"
              icon="plus"
              variant="secondary"
              onPress={() => router.push('/requests/add-customer')}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
