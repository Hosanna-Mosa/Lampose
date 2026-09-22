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
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import {
  AlertTriangle, MapPinned, Plus, RefreshCw, Radio,
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
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { filterBySearch } from '../components/common/utils';
import {
  salesTrackingService, type SalesRepPathPoint, type SalesRepPathRange, type SalesRepRow,
} from '../api/services/salesTrackingService';

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

/* Stable references — `useJsApiLoader` reloads the script if either of these
   is a new array/object identity on every render. */
const MAP_LIBRARIES: 'places'[] = [];
const MAP_CONTAINER_STYLE = { width: '100%', height: '420px', borderRadius: '12px' };

const ROSTER_POLL_MS = 20000;
const PATH_POLL_MS = 8000;

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
}

export const SalesTrackingPage: React.FC<Props> = ({ search = '' }) => {
  const [rows, setRows] = useState<SalesRepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SalesRepRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

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

  const visible = useMemo(
    () => filterBySearch(rows, search, (r, q) =>
      r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)),
    [rows, search],
  );

  const onlineCount = useMemo(() => rows.filter((r) => r.onDuty).length, [rows]);

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="Tracker app"
        title="Sales Tracking"
        description="Where the sales team is, while they're visiting clients. Click a rep to see their position and path over a chosen time window."
        actions={(
          <>
            <Button icon={RefreshCw} onClick={() => void loadRoster()} disabled={loading}>Refresh</Button>
            <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Add sales rep</Button>
          </>
        )}
      />

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Box>
          <Box className="text-label uppercase tracking-wide text-ink-3">Online now</Box>
          <Box className="text-h2 font-semibold tabular-nums">{onlineCount}</Box>
        </Box>
        <Box>
          <Box className="text-label uppercase tracking-wide text-ink-3">Sales reps</Box>
          <Box className="text-h2 font-semibold tabular-nums">{rows.length}</Box>
        </Box>
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
        ) : visible.length === 0 ? (
          <EmptyState
            icon={MapPinned}
            title="No sales reps yet"
            description="Add the first sales rep's account to get them started in the Tracker app."
            action={<Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Add sales rep</Button>}
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
                    {rep.onDuty ? (
                      <Badge tone="good" icon={Radio}>Online</Badge>
                    ) : (
                      <Badge tone="neutral">Offline</Badge>
                    )}
                  </Td>
                  <Td>
                    <Text className="text-ink-2">{ago(rep.locationUpdatedAt)}</Text>
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" icon={MapPinned} onClick={(e) => { e.stopPropagation(); setSelected(rep); }}>
                      View map
                    </Button>
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

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};

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

  const last = path[path.length - 1];
  const center = last ?? (rep.currentLocation ? { lat: rep.currentLocation[1], lng: rep.currentLocation[0] } : null);
  const rangeLabel = formatRange(since, until);

  return (
    <Modal
      open
      onClose={onClose}
      title={rep.name}
      description={rep.onDuty ? `Online · last seen ${ago(rep.locationUpdatedAt)}` : `Offline · last seen ${ago(rep.locationUpdatedAt)}`}
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
            {path.length > 1 && (
              <Polyline
                path={path.map((p) => ({ lat: p.lat, lng: p.lng }))}
                options={{ strokeColor: '#2563eb', strokeWeight: 3, strokeOpacity: 0.8 }}
              />
            )}
            {path[0] && path.length > 1 && (
              <Marker
                position={{ lat: path[0].lat, lng: path[0].lng }}
                label={{ text: 'Start', fontSize: '11px' }}
                opacity={0.75}
              />
            )}
            {last && (
              <Marker position={{ lat: last.lat, lng: last.lng }} label={{ text: rep.name.charAt(0).toUpperCase(), fontSize: '11px' }} />
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
