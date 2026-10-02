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
import { useState } from 'react';
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
import { PageHeader } from '../components/common/molecules/PageHeader';
import { cx } from '../components/common/utils';
import { staffAccessService } from '../api/services/staffAccessService';
import type { StaffAccessSession } from '../api/services/staffAccessService';
import { useFetch } from '../lib/useFetch';
import { formatDateTime } from '../lib/format';

interface StaffAccessPageProps {
  search: string;
}

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
  const log = useFetch(() => staffAccessService.list({ q: search.trim() || undefined, limit: 100 }), [search]);
  const sessions = log.data?.sessions ?? [];

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

      {log.loading ? (
        <Text className="text-sm text-ink-3">Loading…</Text>
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={KeyRound}
            title={search.trim() ? 'Nothing matches that' : 'No staff sign-ins yet'}
            description={
              search.trim()
                ? 'Clear the filter in the header.'
                : 'When someone signs in to a restaurant with the staff password, it appears here.'
            }
          />
        </Card>
      ) : (
        <Box className="space-y-2.5">
          {sessions.map((session) => (
            <SessionCard key={session.sessionId} session={session} />
          ))}
        </Box>
      )}
    </Box>
  );
}
