import { useRouter } from 'expo-router';

import {
  Box, Chip, EmptyState, ErrorState, IconButton, Screen, Skeleton, Switch, Tappable, Text,
} from '@/components/common';
import {
  CHANNEL_LABEL, ReminderButtons, rentStyles as styles,
} from '@/components/rent-common';
import { formatINR } from '@/lib/format';
import { useColors } from '@/hooks/useColors';
import { useRentReminders, useUpdateRentSettings } from '@/services/hooks/useRent';

const DAY_CHOICES = [1, 3, 5, 7];

const ago = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins || 1} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

/**
 * Reminders — two kinds, kept apart on purpose:
 *
 *   Rent alerts   a morning push to the OWNER about who owes, sent by Lampose.
 *   Follow-ups    a message to a RESIDENT, sent by the owner from their own
 *                 WhatsApp/SMS. Lampose never texts a tenant about rent.
 */
export function RemindersScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, error, isRefetching, refetch } = useRentReminders();
  const { run: saveSettings, isPending: saving } = useUpdateRentSettings();

  const settings = data?.settings;

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
          <Text variant="screenTitle">Reminders</Text>
        </>
      }
    >
      {isLoading ? (
        <Box style={styles.stack}>
          <Skeleton width="100%" height={130} radius={16} />
          <Skeleton width="100%" height={150} radius={16} />
        </Box>
      ) : isError && !data ? (
        <ErrorState title="We could not load reminders" body={error?.displayMessage} onRetry={refetch} />
      ) : (
        <>
          <Box style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
            <Box style={styles.head}>
              <Box style={styles.flex}>
                <Text variant="cardTitle">Morning rent alert</Text>
                <Text variant="caption" color="textTertiary">
                  A notification after 9am on days someone owes rent.
                </Text>
              </Box>
              <Switch
                value={settings?.ownerAlerts ?? true}
                disabled={saving}
                accessibilityLabel="Morning rent alert"
                onChange={(next) => { saveSettings({ ownerAlerts: next }).catch(() => {}); }}
              />
            </Box>
            {settings?.ownerAlerts ? (
              <>
                <Text variant="label" color="textSecondary" style={styles.message}>
                  Also tell me about rent due within
                </Text>
                <Box style={styles.chips}>
                  {DAY_CHOICES.map((d) => (
                    <Chip
                      key={d}
                      size="sm"
                      label={`${d} day${d === 1 ? '' : 's'}`}
                      selected={settings.daysBefore === d}
                      disabled={saving}
                      onPress={() => { saveSettings({ daysBefore: d }).catch(() => {}); }}
                    />
                  ))}
                </Box>
              </>
            ) : null}
          </Box>

          <Text variant="h3" style={styles.sectionTitle}>Follow-ups</Text>
          {!data?.followUps.length ? (
            <EmptyState
              icon="check-circle"
              title="Nobody to follow up"
              body="Residents who owe rent appear here, the least recently reminded first."
              style={styles.empty}
            />
          ) : (
            data.followUps.map((r) => (
              <Box key={r.id} style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
                <Tappable
                  onPress={() => router.push({ pathname: '/rent/resident/[id]', params: { id: r.id } } as never)}
                  accessibilityRole="button"
                  style={styles.rowTop}
                >
                  <Box style={styles.flex}>
                    <Text variant="cardTitle" numberOfLines={1}>{r.guestName}</Text>
                    <Text variant="caption" color="textTertiary">
                      {formatINR(r.summary.outstanding)} owed
                      {r.summary.maxDaysLate ? ` · ${r.summary.maxDaysLate} days late` : ' · due today'}
                    </Text>
                    <Text variant="caption" color={r.lastReminder ? 'textTertiary' : 'warningInk'}>
                      {r.lastReminder
                        ? `Reminded by ${CHANNEL_LABEL[r.lastReminder.channel]} ${ago(r.lastReminder.at)}`
                        : 'Not reminded yet'}
                    </Text>
                  </Box>
                </Tappable>
                <Box style={styles.actions}>
                  <ReminderButtons
                    residentId={r.id}
                    guestName={r.guestName}
                    guestPhone={r.guestPhone}
                    propertyName={r.propertyName}
                    amount={r.summary.outstanding}
                    status={r.summary.maxDaysLate ? 'overdue' : 'due'}
                    dueDate={r.summary.oldestOwing ?? undefined}
                  />
                </Box>
              </Box>
            ))
          )}

          {data?.recent.length ? (
            <>
              <Text variant="h3" style={styles.sectionTitle}>Sent recently</Text>
              <Box style={[styles.card, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
                {data.recent.map((r, i) => (
                  <Text key={`${r.bookingId}-${r.at}-${i}`} variant="caption" color="textSecondary">
                    {r.guestName || 'A resident'} · {CHANNEL_LABEL[r.channel]} · {ago(r.at)}
                  </Text>
                ))}
              </Box>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
