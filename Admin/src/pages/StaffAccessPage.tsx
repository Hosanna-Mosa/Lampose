/* ══════════════════════════════════════════════════════════════════════════
   Staff Access — every time somebody at Lampose used the staff password to
   get into a restaurant's account, and what they changed while in.

   One card per sign-in: the restaurant, the door (Food-Partner app or web
   console), the number typed, the IP and when. Opening it lists each change
   in order, with what was sent, and any attempt the server refused (bank
   details, the owner's password, deleting the account).

   Read-only, Super Admin and Admin. The backend enforces both; the nav hides
   the page from every other role.
   ══════════════════════════════════════════════════════════════════════════ */
import { useMemo, useState } from 'react';
import {
  Ban,
  ChevronDown,
  ChevronRight,
  Globe,
  KeyRound,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import { Badge } from '../components/common/atoms/Badge';
import { Box } from '../components/common/atoms/Box';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Code } from '../components/common/atoms/Code';
import { Inline } from '../components/common/atoms/Inline';
import { PlainButton } from '../components/common/atoms/PlainButton';
import { Strong } from '../components/common/atoms/Strong';
import { Text } from '../components/common/atoms/Text';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { FilterBar } from '../components/common/molecules/FilterBar';
import { FilterChips } from '../components/common/molecules/FilterChips';
import type { FilterChipOption } from '../components/common/molecules/FilterChips';
import { ResultCount } from '../components/common/molecules/ResultCount';
import { Select } from '../components/common/atoms/Select';
import { Option } from '../components/common/atoms/Option';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { cx, filterSelectClass } from '../components/common/utils';
import { staffAccessService } from '../api/services/staffAccessService';
import type { StaffAccessSession } from '../api/services/staffAccessService';
import { useDebounced, useFetch } from '../lib/useFetch';
import { formatDateTime } from '../lib/format';

interface StaffAccessPageProps {
  search: string;
}

type DoorFilter = 'all' | StaffAccessSession['surface'];
type ActivityFilter = 'all' | 'changed' | 'looked' | 'blocked';
type PeriodFilter = 'all' | '1' | '7' | '30';

const DOORS: { id: DoorFilter; label: string }[] = [
  { id: 'all', label: 'Either door' },
  { id: 'app', label: 'Food-Partner app' },
  { id: 'console', label: 'Web console' },
];

const ACTIVITIES: { id: ActivityFilter; label: string; tone?: FilterChipOption['tone'] }[] = [
  { id: 'all', label: 'Any activity' },
  { id: 'changed', label: 'Changed something', tone: 'brand' },
  { id: 'looked', label: 'Only looked' },
  { id: 'blocked', label: 'Had a blocked attempt', tone: 'crit' },
];

const PERIODS: { id: PeriodFilter; label: string }[] = [
  { id: 'all', label: 'Any time' },
  { id: '1', label: 'Last 24 hours' },
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const byDoor = (session: StaffAccessSession, door: DoorFilter) => door === 'all' || session.surface === door;

const byActivity = (session: StaffAccessSession, activity: ActivityFilter) => {
  if (activity === 'changed') return session.changeCount > 0;
  if (activity === 'looked') return session.changeCount === 0 && session.blockedCount === 0;
  if (activity === 'blocked') return session.blockedCount > 0;
  return true;
};

const byPeriod = (session: StaffAccessSession, period: PeriodFilter, now: number) =>
  period === 'all' || now - new Date(session.at).getTime() <= Number(period) * DAY_MS;

const timeOf = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** The redacted body, readable: one `key: value` per line. */
function Changes({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  return (
    <Code className="block mt-1.5 max-h-56 overflow-auto rounded-control bg-surface-inset border border-line p-2 text-label text-ink-2 whitespace-pre-wrap break-all">
      {text}
    </Code>
  );
}

function SessionCard({ session }: { session: StaffAccessSession }) {
  const [open, setOpen] = useState(false);
  const SurfaceIcon = session.surface === 'app' ? Smartphone : Globe;

  return (
    <Card padded={false} className="overflow-hidden">
      <PlainButton
        className="w-full text-left flex items-start gap-3 p-4 hover:bg-surface-inset transition-colors duration-120"
        onClick={() => setOpen((on) => !on)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="size-4 text-ink-3 mt-1 shrink-0" />
        ) : (
          <ChevronRight className="size-4 text-ink-3 mt-1 shrink-0" />
        )}
        <Box className="min-w-0 flex-1">
          <Box className="flex flex-wrap items-center gap-2">
            <Strong className="text-ink">{session.restaurantName || session.restaurantId}</Strong>
            <Inline className="text-label text-ink-3 tabular">{session.restaurantId}</Inline>
          </Box>
          <Text className="text-label text-ink-3 mt-0.5 flex flex-wrap items-center gap-x-2">
            <Inline className="inline-flex items-center gap-1">
              <SurfaceIcon className="size-3.5" />
              {session.surface === 'app' ? 'Food-Partner app' : 'Web console'}
            </Inline>
            <Inline>· signed in as {session.identifier || '—'}</Inline>
            <Inline className="tabular">· IP {session.ip || '—'}</Inline>
          </Text>
        </Box>
        <Box className="text-right shrink-0">
          <Text className="text-label text-ink-2 tabular">{formatDateTime(session.at)}</Text>
          <Box className="flex justify-end gap-1.5 mt-1">
            <Badge tone={session.changeCount ? 'brand' : 'neutral'} icon={Pencil}>
              {session.changeCount} change{session.changeCount === 1 ? '' : 's'}
            </Badge>
            {session.blockedCount > 0 && (
              <Badge tone="crit" icon={Ban}>
                {session.blockedCount} blocked
              </Badge>
            )}
          </Box>
        </Box>
      </PlainButton>

      {open && (
        <Box className="border-t border-line px-4 py-3 space-y-3">
          {session.events.length === 0 ? (
            <Text className="text-sm text-ink-3">Signed in and only looked — nothing was changed.</Text>
          ) : (
            session.events.map((event, index) => (
              <Box key={`${event.at}-${index}`} className="flex gap-3">
                <Text className="text-label text-ink-3 tabular w-20 shrink-0 pt-0.5">{timeOf(event.at)}</Text>
                <Box className="min-w-0 flex-1">
                  <Box className="flex flex-wrap items-center gap-2">
                    <Text className={cx('text-sm', event.kind === 'blocked' ? 'text-crit' : 'text-ink')}>
                      {event.action || `${event.method} ${event.path}`}
                    </Text>
                    {event.kind === 'blocked' ? (
                      <Badge tone="crit" icon={ShieldAlert}>Blocked</Badge>
                    ) : !event.ok ? (
                      <Badge tone="warn">Failed · {event.statusCode}</Badge>
                    ) : null}
                  </Box>
                  <Text className="text-label text-ink-3 break-all">
                    {event.method} {event.path}
                  </Text>
                  <Changes value={event.changes} />
                </Box>
              </Box>
            ))
          )}
          {session.userAgent && (
            <Text className="text-label text-ink-3 break-all pt-1 border-t border-line">
              Device: {session.userAgent}
            </Text>
          )}
        </Box>
      )}
    </Card>
  );
}

export function StaffAccessPage({ search }: StaffAccessPageProps) {
  /* The header's box is matched by the server (restaurant id, name, the
     number typed), debounced so each keystroke is not a request. */
  const q = useDebounced(search.trim(), 300);
  const log = useFetch(() => staffAccessService.list({ q: q || undefined, limit: 100 }), [q]);
  const sessions = useMemo(() => log.data?.sessions ?? [], [log.data]);

  const [door, setDoor] = useState<DoorFilter>('all');
  const [activity, setActivity] = useState<ActivityFilter>('all');
  const [period, setPeriod] = useState<PeriodFilter>('all');

  /*
   * The rest is filtered here: the server sends the newest hundred sign-ins
   * whole, so every count below is a count of what is loaded — each one under
   * the search and the OTHER filters, so a chip says what pressing it shows.
   */
  const view = useMemo(() => {
    const now = Date.now();
    const keep = (session: StaffAccessSession, skip: 'door' | 'activity' | 'period' | null) =>
      (skip === 'door' || byDoor(session, door))
      && (skip === 'activity' || byActivity(session, activity))
      && (skip === 'period' || byPeriod(session, period, now));

    const forDoor = sessions.filter((session) => keep(session, 'door'));
    const forActivity = sessions.filter((session) => keep(session, 'activity'));
    const forPeriod = sessions.filter((session) => keep(session, 'period'));

    return {
      shown: sessions.filter((session) => keep(session, null)),
      doors: DOORS.map((d) => ({ ...d, count: forDoor.filter((session) => byDoor(session, d.id)).length })),
      activities: ACTIVITIES.map((a) => ({
        ...a,
        count: forActivity.filter((session) => byActivity(session, a.id)).length,
      })),
      periods: PERIODS.map((p) => ({ ...p, count: forPeriod.filter((session) => byPeriod(session, p.id, now)).length })),
    };
  }, [sessions, door, activity, period]);

  const filtersOn = door !== 'all' || activity !== 'all' || period !== 'all';
  const clearFilters = () => {
    setDoor('all');
    setActivity('all');
    setPeriod('all');
  };

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="Security"
        title="Staff Access"
        description="Every sign-in to a restaurant's account with the Lampose staff password, and what was changed during it."
        actions={
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={log.reload} loading={log.refreshing}>
            Refresh
          </Button>
        }
      />

      {log.data && !log.data.enabled && (
        <Box className="flex items-start gap-2.5 p-3 rounded-panel bg-surface-inset border border-line">
          <KeyRound className="size-4 text-ink-3 shrink-0 mt-0.5" strokeWidth={2} />
          <Text className="text-sm text-ink-2">
            The staff password is not set on this server, so nobody can sign in with it. Earlier sign-ins
            are still listed below.
          </Text>
        </Box>
      )}

      {log.error && <ErrorState message={log.error} onRetry={log.reload} />}

      {sessions.length > 0 && (
        <FilterBar
          summary={
            <ResultCount
              shown={view.shown.length}
              total={sessions.length}
              noun="sign-ins"
              onClear={filtersOn ? clearFilters : undefined}
            />
          }
        >
          <FilterChips label="Door" options={view.doors} value={door} onChange={setDoor} />
          <FilterChips label="Activity" options={view.activities} value={activity} onChange={setActivity} />
          <Select
            aria-label="Signed in"
            className={filterSelectClass}
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
          >
            {view.periods.map((p) => (
              <Option key={p.id} value={p.id}>
                {p.label} ({p.count})
              </Option>
            ))}
          </Select>
        </FilterBar>
      )}

      {log.loading ? (
        <Text className="text-sm text-ink-3">Loading…</Text>
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={KeyRound}
            title={q ? 'No sign-ins match that search' : 'No staff sign-ins yet'}
            description={
              q
                ? 'Clear the box in the header.'
                : 'When someone signs in to a restaurant with the staff password, it appears here.'
            }
          />
        </Card>
      ) : view.shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={KeyRound}
            title="No sign-ins match these filters"
            description="Try another door, activity or period."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : (
        <Box className="space-y-2.5">
          {view.shown.map((session) => (
            <SessionCard key={session.sessionId} session={session} />
          ))}
        </Box>
      )}
    </Box>
  );
}
