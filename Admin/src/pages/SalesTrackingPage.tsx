/* ══════════════════════════════════════════════════════════════════════════
   Sales Tracking — creating a rep's account, the roster from the Tracker
   app, and one rep's path in a chosen time window.

   Reads and writes `/v1/admin/sales-reps` through `salesTrackingService`.
   Everything here is account and viewing surface; nothing on this page can
   touch a rep's own duty switch — see that service's own header for why.

   ## No self-registration in the Tracker app

   There is no "Create account" screen there any more. `AddSalesRepModal`
   below is now the ONLY way a sales rep account gets made: an administrator
   types the name, email and password in here, and hands the rep that exact
   pair to sign in with.

   ## Two polls, not one

   The roster refreshes on its own timer so "who is online right now" stays
   current while this page is just sitting open. The path refreshes on a
   SEPARATE, faster timer, and only while the map modal is open — polling a
   path nobody is looking at would be the exact waste `driver` avoids by
   gating its own location watcher on duty status rather than the app being
   open at all.

   ## "Online" means on duty AND heard from recently

   `onDuty` is the rep's own switch and nothing on the server turns it off,
   so a phone that is force-stopped, dead or out of signal stays `onDuty`
   forever on the one position it last sent. The Tracker app reports every
   ~15 seconds while online (in the background too), so a rep on duty whose
   last fix is older than `SIGNAL_LOST_MS` is shown as "Signal lost" rather
   than "Online" — a stale position presented as live is the trap
   `locationUpdatedAt` exists to avoid.

   ## The time window

   `SalesRepMapModal` can ask for more than "now": a rolling last-N-hours
   preset, a specific past date, or an exact from/to range — all of it read
   from `sales_location_pings`, which never expires a fix. The rolling
   presets (1h/2h/6h) are recomputed on every poll tick rather than frozen at
   the moment they were picked, so "last hour" always means the last hour.
   Picking a past date or a custom range is an absolute window instead —
   there is nothing to roll forward once the moment in question has passed.

   ## The map degrades to a sentence, not a blank box

   `VITE_GOOGLE_MAPS_API_KEY` is a real but easily-empty env var — see
   `Admin/.env.example`. A blank grey rectangle where a map should be reads as
   broken; a sentence saying why is the same honesty every other "not
   configured" state in this codebase uses instead of silently failing.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
/* The `F` (function component) overlays, not `Marker`/`Polyline`: the class
   versions leak their overlay on unmount under React StrictMode, which left
   old lines drawn underneath the current one. */
import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from '@react-google-maps/api';
import {
  AlertTriangle, KeyRound, MapPinned, Plus, Power, RefreshCw, Radio, WifiOff,
} from 'lucide-react';

import { Badge } from '../components/common/atoms/Badge';
import { Box } from '../components/common/atoms/Box';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Form } from '../components/common/atoms/Form';
import { Inline } from '../components/common/atoms/Inline';
import { Input } from '../components/common/atoms/Input';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { FilterBar } from '../components/common/molecules/FilterBar';
import { FilterChips } from '../components/common/molecules/FilterChips';
import { ResultCount } from '../components/common/molecules/ResultCount';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { Option } from '../components/common/atoms/Option';
import { Select } from '../components/common/atoms/Select';
import { filterBySearch, filterSelectClass } from '../components/common/utils';
import {
  salesTrackingService, type SalesRepPathPoint, type SalesRepPathRange, type SalesRepRow,
} from '../api/services/salesTrackingService';
import { useRoadSnappedPath } from '../lib/roadPath';
import type { AdminRole } from '../api/types';

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

/* Stable references — `useJsApiLoader` reloads the script if either of these
   is a new array/object identity on every render. */
const MAP_LIBRARIES: 'places'[] = [];
const MAP_CONTAINER_STYLE = { width: '100%', height: '420px', borderRadius: '12px' };

/* Both set `icons` and `strokeOpacity`, so switching one line between them
   fully replaces the other style rather than leaving dashes on a solid line. */
const SNAPPED_PATH_OPTIONS = {
  strokeColor: '#2563eb',
  strokeWeight: 4,
  strokeOpacity: 0.85,
  icons: [],
};

const DASHED_PATH_OPTIONS = {
  strokeColor: '#2563eb',
  strokeOpacity: 0,
  icons: [{
    icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, strokeColor: '#2563eb', scale: 3 },
    offset: '0',
    repeat: '12px',
  }],
};

const ROSTER_POLL_MS = 20000;
const PATH_POLL_MS = 8000;

/* Generous against Android batching fixes during doze, tight enough that a
   dead phone stops reading as live within minutes. */
const SIGNAL_LOST_MS = 5 * 60 * 1000;

type Presence = 'online' | 'lost' | 'offline';

const presenceOf = (rep: SalesRepRow): Presence => {
  if (!rep.onDuty) return 'offline';
  const at = rep.locationUpdatedAt ? new Date(rep.locationUpdatedAt).getTime() : NaN;
  return Number.isFinite(at) && Date.now() - at <= SIGNAL_LOST_MS ? 'online' : 'lost';
};

const PresenceBadge: React.FC<{ rep: SalesRepRow }> = ({ rep }) => {
  const presence = presenceOf(rep);
  if (presence === 'online') return <Badge tone="good" icon={Radio}>Online</Badge>;
  if (presence === 'lost') return <Badge tone="warn" icon={WifiOff}>Signal lost</Badge>;
  return <Badge tone="neutral">Offline</Badge>;
};

const PRESENCE_LABEL: Record<Presence, string> = {
  online: 'Online', lost: 'Signal lost', offline: 'Offline',
};

type PresenceFilter = 'all' | Presence;
type AccountFilter = 'all' | 'active' | 'inactive';

const ago = (iso: string | null): string => {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const RANGE_LABEL_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
};

const formatRange = (since: string | null, until: string | null): string | null => {
  if (!since || !until) return null;
  const from = new Date(since);
  const to = new Date(until);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return `${from.toLocaleString(undefined, RANGE_LABEL_FORMAT)} – ${to.toLocaleString(undefined, RANGE_LABEL_FORMAT)}`;
};

interface Props {
  search?: string;
  /** Drives which account controls are drawn — `sales.manage` is Super Admin
      and Admin on the server, which refuses anybody else regardless. */
  role?: AdminRole;
}

/** The roles `sales.manage` covers in `Backend/src/modules/iam/iam.roles.js`. */
const canManageSalesReps = (role?: AdminRole): boolean => role === 'Super Admin' || role === 'Admin';

export const SalesTrackingPage: React.FC<Props> = ({ search = '', role }) => {
  const canManage = canManageSalesReps(role);
  const [statusTarget, setStatusTarget] = useState<SalesRepRow | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<SalesRepRow | null>(null);
  const [rows, setRows] = useState<SalesRepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SalesRepRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [presence, setPresence] = useState<PresenceFilter>('all');
  const [account, setAccount] = useState<AccountFilter>('all');

  const loadRoster = useCallback(async () => {
    const res = await salesTrackingService.getSalesReps();
    if (res.success) {
      setRows(res.data);
      setError(null);
    } else {
      setError(res.message || 'Could not load the sales roster.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRoster();
    const timer = window.setInterval(() => void loadRoster(), ROSTER_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadRoster]);

  const searched = useMemo(
    () => filterBySearch(rows, search, (r, q) =>
      r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)),
    [rows, search],
  );

  /* Each control counts the searched list narrowed by the OTHER control, so
     "Online 3" means three reps would show if that chip were picked. The
     roster is capped at 200 server-side and loaded whole, so these are exact. */
  const visible = useMemo(
    () => searched.filter((r) =>
      (presence === 'all' || presenceOf(r) === presence) && (account === 'all' || r.status === account)),
    [searched, presence, account],
  );

  const presenceCounts = useMemo(() => {
    const out: Record<PresenceFilter, number> = { all: 0, online: 0, lost: 0, offline: 0 };
    for (const r of searched) {
      if (account !== 'all' && r.status !== account) continue;
      out.all += 1;
      out[presenceOf(r)] += 1;
    }
    return out;
  }, [searched, account]);

  const accountCounts = useMemo(() => {
    const out: Record<AccountFilter, number> = { all: 0, active: 0, inactive: 0 };
    for (const r of searched) {
      if (presence !== 'all' && presenceOf(r) !== presence) continue;
      out.all += 1;
      out[r.status === 'inactive' ? 'inactive' : 'active'] += 1;
    }
    return out;
  }, [searched, presence]);

  const filtersActive = presence !== 'all' || account !== 'all';
  const filtered = filtersActive || !!search.trim();
  const clearFilters = () => {
    setPresence('all');
    setAccount('all');
  };
  /* Unknown until the first roster load — left off rather than shown as 0. */
  const countOf = (n: number) => (loading ? null : n);

  const onlineCount = useMemo(() => rows.filter((r) => presenceOf(r) === 'online').length, [rows]);
  const lostCount = useMemo(() => rows.filter((r) => presenceOf(r) === 'lost').length, [rows]);

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="Tracker app"
        title="Sales Tracking"
        description="Where the sales team is, while they're visiting clients. Click a rep to see their position and path over a chosen time window."
        actions={(
          <>
            <Button icon={RefreshCw} onClick={() => void loadRoster()} disabled={loading}>Refresh</Button>
            {canManage && (
              <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Add sales rep</Button>
            )}
          </>
        )}
      />

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Box>
          <Box className="text-label uppercase tracking-wide text-ink-3">Online now</Box>
          <Box className="text-h2 font-semibold tabular-nums">{onlineCount}</Box>
        </Box>
        {lostCount > 0 && (
          <Box title="On duty in the app, but no location for over 5 minutes — the phone may be off, out of signal, or the app force-stopped.">
            <Box className="text-label uppercase tracking-wide text-ink-3">Signal lost</Box>
            <Box className="text-h2 font-semibold tabular-nums">{lostCount}</Box>
          </Box>
        )}
        <Box>
          <Box className="text-label uppercase tracking-wide text-ink-3">Sales reps</Box>
          <Box className="text-h2 font-semibold tabular-nums">{rows.length}</Box>
        </Box>
      </Card>

      <Card padded={false} className="p-3">
        <FilterBar
          summary={loading ? undefined : (
            <ResultCount
              shown={visible.length}
              total={rows.length}
              noun="sales reps"
              filtered={filtered}
              onClear={filtersActive ? clearFilters : undefined}
            />
          )}
        >
          <FilterChips
            label="Presence"
            value={presence}
            onChange={setPresence}
            options={[
              { id: 'all', label: 'All', count: countOf(presenceCounts.all) },
              { id: 'online', label: PRESENCE_LABEL.online, count: countOf(presenceCounts.online), tone: 'good' },
              { id: 'lost', label: PRESENCE_LABEL.lost, count: countOf(presenceCounts.lost), tone: 'warn' },
              { id: 'offline', label: PRESENCE_LABEL.offline, count: countOf(presenceCounts.offline) },
            ]}
          />
          <Select
            aria-label="Account"
            value={account}
            onChange={(e) => setAccount(e.target.value as AccountFilter)}
            className={filterSelectClass}
          >
            {(['all', 'active', 'inactive'] as const).map((id) => (
              <Option key={id} value={id}>
                {id === 'all' ? 'All accounts' : id === 'active' ? 'Active' : 'Inactive'}
                {loading ? '' : ` (${accountCounts[id].toLocaleString('en-IN')})`}
              </Option>
            ))}
          </Select>
        </FilterBar>
      </Card>

      <Card padded={false}>
        {loading ? (
          <TableSkeleton cols={4} />
        ) : error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Could not load the roster"
            description={error}
            action={<Button onClick={() => void loadRoster()}>Try again</Button>}
          />
        ) : visible.length === 0 && rows.length > 0 ? (
          <EmptyState
            icon={MapPinned}
            title="No sales reps match these filters"
            description="Try a different search, presence or account filter."
            action={filtersActive ? <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={MapPinned}
            title="No sales reps yet"
            description={canManage
              ? "Add the first sales rep's account to get them started in the Tracker app."
              : 'A Super Admin or Admin adds sales rep accounts.'}
            action={canManage ? <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Add sales rep</Button> : undefined}
          />
        ) : (
          <Table>
            <TableHead>
              <Tr>
                <Th>Rep</Th>
                <Th>Status</Th>
                <Th>Last seen</Th>
                <Th className="text-right">Position</Th>
              </Tr>
            </TableHead>
            <TableBody>
              {visible.map((rep) => (
                <Tr
                  key={rep.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(rep)}
                >
                  <Td>
                    <Box className="font-medium text-ink">{rep.name}</Box>
                    <Box className="mt-0.5 text-[11px] text-ink-3">{rep.email}</Box>
                  </Td>
                  <Td>
                    <Box className="flex flex-wrap items-center gap-1.5">
                      <PresenceBadge rep={rep} />
                      {rep.status === 'inactive' && <Badge tone="crit">Inactive</Badge>}
                    </Box>
                  </Td>
                  <Td>
                    <Text className="text-ink-2">{ago(rep.locationUpdatedAt)}</Text>
                  </Td>
                  <Td className="text-right">
                    <Box className="inline-flex flex-wrap justify-end gap-2">
                      <Button size="sm" icon={MapPinned} onClick={(e) => { e.stopPropagation(); setSelected(rep); }}>
                        View map
                      </Button>
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" icon={KeyRound} onClick={(e) => { e.stopPropagation(); setPasswordTarget(rep); }}>
                            Reset password
                          </Button>
                          <Button
                            size="sm"
                            variant={rep.status === 'inactive' ? 'secondary' : 'danger'}
                            icon={Power}
                            onClick={(e) => { e.stopPropagation(); setStatusTarget(rep); }}
                          >
                            {rep.status === 'inactive' ? 'Reactivate' : 'Deactivate'}
                          </Button>
                        </>
                      )}
                    </Box>
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {selected && (
        <SalesRepMapModal salesRep={selected} onClose={() => setSelected(null)} />
      )}

      {addOpen && (
        <AddSalesRepModal
          onClose={() => setAddOpen(false)}
          onCreated={(rep) => {
            setAddOpen(false);
            setToast({ tone: 'good', message: `${rep.name}'s account is ready. Share their email and password with them to sign in.` });
            void loadRoster();
          }}
        />
      )}

      {canManage && statusTarget && (
        <SalesRepStatusModal
          salesRep={statusTarget}
          onClose={() => setStatusTarget(null)}
          onDone={(rep) => {
            setStatusTarget(null);
            setToast({
              tone: 'good',
              message: rep.status === 'inactive'
                ? `${rep.name} is deactivated and signed out of the Tracker app.`
                : `${rep.name} is active again and can sign in.`,
            });
            void loadRoster();
          }}
        />
      )}

      {canManage && passwordTarget && (
        <ResetSalesRepPasswordModal
          salesRep={passwordTarget}
          onClose={() => setPasswordTarget(null)}
          onReset={(rep) => {
            setToast({ tone: 'good', message: `${rep.name}'s password was reset and their phone signed out.` });
            void loadRoster();
          }}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};

/* ── Deactivate / reactivate a rep ───────────────────────────────────────── */

function SalesRepStatusModal({
  salesRep, onClose, onDone,
}: { salesRep: SalesRepRow; onClose: () => void; onDone: (rep: SalesRepRow) => void }) {
  const deactivating = salesRep.status !== 'inactive';
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSaving(true);
    setFormError(null);
    const next = deactivating ? 'inactive' : 'active';
    const res = await salesTrackingService.setSalesRepStatus(salesRep.id, next);
    setSaving(false);
    if (res.success) {
      onDone(res.data ?? { ...salesRep, status: next });
    } else {
      /* A 403 (a role below Admin) lands here too, with the server's message. */
      setFormError(res.message || 'Could not change that account.');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={deactivating ? `Deactivate ${salesRep.name}?` : `Reactivate ${salesRep.name}?`}
      description={deactivating
        ? 'Their phone will be signed out of the Tracker app right away and stop sharing location. They cannot sign in again until the account is reactivated.'
        : 'They will be able to sign in to the Tracker app again with their existing email and password.'}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={deactivating ? 'danger' : 'primary'} loading={saving} onClick={() => void handleConfirm()}>
            {deactivating ? 'Deactivate' : 'Reactivate'}
          </Button>
        </>
      )}
    >
      {formError && (
        <Text className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
          {formError}
        </Text>
      )}
    </Modal>
  );
}

/* ── Reset a rep's password ──────────────────────────────────────────────── */

function ResetSalesRepPasswordModal({
  salesRep, onClose, onReset,
}: { salesRep: SalesRepRow; onClose: () => void; onReset: (rep: SalesRepRow) => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /* Shown once, after the server accepts it, so the admin can hand it over —
     the same "type it, hand it over" rule creating an account follows. */
  const [issued, setIssued] = useState<string | null>(null);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const res = await salesTrackingService.resetSalesRepPassword(salesRep.id, password);
    setSaving(false);
    if (res.success) {
      setIssued(password);
      setPassword('');
      onReset(res.data ?? salesRep);
    } else {
      /* A 403 (a role below Admin) lands here too, with the server's message. */
      setFormError(res.message || 'Could not reset that password.');
    }
  };

  if (issued) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Password reset"
        description="Hand the rep these details now — the password is not shown again once this closes. Any phone they were signed in on has been signed out."
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}
      >
        <Box className="space-y-2 rounded-control border border-line px-3 py-2">
          <Box>
            <Box className="text-label uppercase tracking-wide text-ink-3">Email</Box>
            <Box className="font-medium text-ink select-all">{salesRep.email}</Box>
          </Box>
          <Box>
            <Box className="text-label uppercase tracking-wide text-ink-3">New password</Box>
            <Box className="font-mono font-medium text-ink select-all">{issued}</Box>
          </Box>
        </Box>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset ${salesRep.name}'s password`}
      description="Type the new password and hand it to the rep. Saving signs out every phone they are currently signed in on."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" form="reset-sales-rep-password" type="submit" loading={saving}>
            Reset password
          </Button>
        </>
      )}
    >
      <Form id="reset-sales-rep-password" onSubmit={handleReset} className="space-y-4">
        {formError && (
          <Text className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
            {formError}
          </Text>
        )}

        <Field label="New password" required hint="At least 6 characters. Give this to the rep.">
          <Input
            required
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            autoComplete="new-password"
            autoFocus
          />
        </Field>
      </Form>
    </Modal>
  );
}

/* ── Add a sales rep ─────────────────────────────────────────────────────── */

function AddSalesRepModal({ onClose, onCreated }: { onClose: () => void; onCreated: (rep: SalesRepRow) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const res = await salesTrackingService.createSalesRep(name.trim(), email.trim().toLowerCase(), password);

    setSaving(false);
    if (res.success && res.data) {
      onCreated(res.data);
    } else {
      setFormError(res.message || 'Could not create that account.');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add sales rep"
      description="Creates their account in the Tracker app. There is no sign-up screen any more — this is the only way one gets made, so hand the rep this exact email and password to sign in with."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" form="create-sales-rep" type="submit" loading={saving}>
            Create account
          </Button>
        </>
      )}
    >
      <Form id="create-sales-rep" onSubmit={handleCreate} className="space-y-4">
        {formError && (
          <Text className="text-sm text-crit bg-crit-soft border border-crit-border rounded-control px-3 py-2">
            {formError}
          </Text>
        )}

        <Field label="Full name" required>
          <Input required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>

        <Field label="Email address" required>
          <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>

        <Field label="Password" required hint="At least 6 characters. Give this, and the email above, to the rep.">
          <Input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            autoComplete="new-password"
          />
        </Field>
      </Form>
    </Modal>
  );
}

/* ── The map modal ───────────────────────────────────────────────────────── */

type RangeMode = 'live' | '1h' | '2h' | '6h' | 'today' | 'date' | 'custom';

const HOUR_PRESETS: { mode: RangeMode; label: string; hours: number }[] = [
  { mode: '1h', label: '1h', hours: 1 },
  { mode: '2h', label: '2h', hours: 2 },
  { mode: '6h', label: '6h', hours: 6 },
];

function computeRange(
  mode: RangeMode,
  pickedDate: string,
  customFrom: string,
  customTo: string,
): SalesRepPathRange | undefined {
  const now = new Date();
  const preset = HOUR_PRESETS.find((p) => p.mode === mode);
  if (preset) {
    return { from: new Date(now.getTime() - preset.hours * 60 * 60 * 1000).toISOString() };
  }
  if (mode === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString() };
  }
  if (mode === 'date') {
    if (!pickedDate) return undefined;
    const start = new Date(`${pickedDate}T00:00:00`);
    const end = new Date(`${pickedDate}T23:59:59.999`);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (mode === 'custom') {
    if (!customFrom || !customTo) return undefined;
    return { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() };
  }
  /* 'live' — no range at all, the backend's own default (the rep's current
     duty session, or today if they are offline). */
  return undefined;
}

function SalesRepMapModal({ salesRep, onClose }: { salesRep: SalesRepRow; onClose: () => void }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'lampose-admin-google-maps',
    googleMapsApiKey: MAPS_API_KEY,
    libraries: MAP_LIBRARIES,
  });

  const [path, setPath] = useState<SalesRepPathPoint[]>([]);
  const [rep, setRep] = useState<SalesRepRow>(salesRep);
  const [pathError, setPathError] = useState<string | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(null);

  const [rangeMode, setRangeMode] = useState<RangeMode>('live');
  const [pickedDate, setPickedDate] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const pickPreset = (mode: RangeMode) => {
    setRangeMode(mode);
    setPickedDate('');
    setCustomFrom('');
    setCustomTo('');
  };

  const loadPath = useCallback(async () => {
    const range = computeRange(rangeMode, pickedDate, customFrom, customTo);
    const res = await salesTrackingService.getSalesRepPath(salesRep.id, range);
    if (res.success) {
      setPath(res.data.path);
      if (res.data.salesRep) setRep(res.data.salesRep);
      setSince(res.data.since);
      setUntil(res.data.until);
      setPathError(null);
    } else {
      setPathError(res.message || "Could not load this rep's path.");
    }
  }, [salesRep.id, rangeMode, pickedDate, customFrom, customTo]);

  useEffect(() => {
    void loadPath();
    /* Only while the modal is open — see the file header on why the path
       poll is not tied to the roster's own timer. Re-fires on every range
       change too, so switching presets or picking a date shows results
       immediately rather than waiting for the next tick. */
    const timer = window.setInterval(() => void loadPath(), PATH_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadPath]);

  /* Raw fixes joined point-to-point zig-zag through buildings — see
     `lib/roadPath.ts`. A solid line is a road-snapped route; a dashed one is
     the cleaned fixes, shown only when snapping is unavailable. */
  const { path: drawnPath, snapped } = useRoadSnappedPath(path, MAPS_API_KEY);

  const last = path[path.length - 1];
  const center = last ?? (rep.currentLocation ? { lat: rep.currentLocation[1], lng: rep.currentLocation[0] } : null);
  const rangeLabel = formatRange(since, until);

  return (
    <Modal
      open
      onClose={onClose}
      title={rep.name}
      description={`${PRESENCE_LABEL[presenceOf(rep)]} · last seen ${ago(rep.locationUpdatedAt)}`}
      size="lg"
    >
      <Box className="space-y-3">
        <Box className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={rangeMode === 'live' ? 'primary' : 'secondary'} onClick={() => pickPreset('live')}>
            Live
          </Button>
          {HOUR_PRESETS.map((p) => (
            <Button
              key={p.mode}
              size="sm"
              variant={rangeMode === p.mode ? 'primary' : 'secondary'}
              onClick={() => pickPreset(p.mode)}
            >
              {p.label}
            </Button>
          ))}
          <Button size="sm" variant={rangeMode === 'today' ? 'primary' : 'secondary'} onClick={() => pickPreset('today')}>
            Today
          </Button>
        </Box>

        <Box className="flex flex-wrap items-end gap-3">
          <Field label="On this date" className="w-[160px]">
            <Input
              type="date"
              value={pickedDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => { setPickedDate(e.target.value); setRangeMode('date'); setCustomFrom(''); setCustomTo(''); }}
            />
          </Field>
          <Field label="From" className="w-[200px]">
            <Input
              type="datetime-local"
              value={customFrom}
              onChange={(e) => { setCustomFrom(e.target.value); setRangeMode('custom'); setPickedDate(''); }}
            />
          </Field>
          <Field label="To" className="w-[200px]">
            <Input
              type="datetime-local"
              value={customTo}
              onChange={(e) => { setCustomTo(e.target.value); setRangeMode('custom'); setPickedDate(''); }}
            />
          </Field>
        </Box>

        {rangeLabel && (
          <Text className="text-label text-ink-3">Showing {rangeLabel}</Text>
        )}

        {!MAPS_API_KEY ? (
          <EmptyState
            icon={MapPinned}
            title="Map is not configured"
            description="Set VITE_GOOGLE_MAPS_API_KEY in the Admin app's .env to show a live map here — until then, positions are still recorded on the server."
          />
        ) : loadError ? (
          <EmptyState icon={AlertTriangle} title="The map failed to load" description={loadError.message} />
        ) : !isLoaded || !center ? (
          <Box className="flex h-[420px] items-center justify-center text-body text-ink-3">
            {!center ? 'No position recorded for this rep in this window.' : 'Loading map…'}
          </Box>
        ) : (
          <GoogleMap mapContainerStyle={MAP_CONTAINER_STYLE} center={center} zoom={15}>
            {drawnPath.length > 1 && (
              <PolylineF
                path={drawnPath}
                options={snapped ? SNAPPED_PATH_OPTIONS : DASHED_PATH_OPTIONS}
              />
            )}
            {path[0] && path.length > 1 && (
              <MarkerF
                position={{ lat: path[0].lat, lng: path[0].lng }}
                label={{ text: 'Start', fontSize: '11px' }}
                opacity={0.75}
              />
            )}
            {last && (
              <MarkerF position={{ lat: last.lat, lng: last.lng }} label={{ text: rep.name.charAt(0).toUpperCase(), fontSize: '11px' }} />
            )}
          </GoogleMap>
        )}

        {!!pathError && (
          <Inline className="text-body text-crit">{pathError}</Inline>
        )}
      </Box>
    </Modal>
  );
}
