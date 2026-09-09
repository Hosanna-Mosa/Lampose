/* ══════════════════════════════════════════════════════════════════════════
   Monitor — every booking and every rupee, one tab per category.

   ## Four tabs, three shapes

   The categories do not do the same thing with money, so they do not get the
   same table:

     PG / Hostel     No money passes through Lampose. The columns answer "have
     Co-living       the user and the owner agreed", so somebody knows when to
                     ring the owner — and a "Collected" control records that
                     they did.

     Bachelor        A ₹199 assisted-visit fee that is entirely OURS. There is
                     no owner share, so there is no percentage and no Withdraw.

     Hotel           The full stay, split with the hotel:
                     Total | % | Our share | Owner share | Payment | Payout

   One table with a filter would be two thirds empty columns whichever row you
   were looking at, and an empty "Owner share" against a PG booking would imply
   somebody is owed something.

   ## The page never computes money

   Every figure is rendered from what the server stored. This file multiplies
   nothing, and it takes `canWithdraw` and `canEditCommission` from the server
   rather than re-deriving them from the status — the state machine lives in
   `settlement.service.js`, and a second copy of it here is a second copy that
   can disagree about whether a payout is allowed.

   The only number this page ever SENDS is a percentage.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BadgeIndianRupee, Building2, CheckCircle2, Clock,
  Landmark, RefreshCw, ShieldAlert, Wallet,
} from 'lucide-react';

import {
  Badge, Button, Card, EmptyState, Input, Modal, PageHeader,
  SearchInput, Table, TableSkeleton, Td, Th, Toast, Tr, cx,
  type BadgeTone, type ToastState,
} from '../components/ui';
import {
  MonitorError, monitorService,
  type CategoryResult, type MonitorRow, type MonitorSummary, type Settlement,
} from '../api/services/monitorService';
import type { AdminRole } from '../api/types';

/* `ToastState` is the console's own — good | crit. Reused rather than
   redefined, so this page cannot drift from how every other one reports. */
type Notice = ToastState | null;

/** Rupees, the way every other figure in the console is written. */
const inr = (value: number | null | undefined): string =>
  value == null ? '—' : `₹${Number(value).toLocaleString('en-IN')}`;

const day = (value?: string | null): string =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const when = (value?: string | null): string =>
  value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

/**
 * How a settlement reads at a glance.
 *
 * `held` is deliberately NOT a warning tone. It is the correct, expected state
 * for every booking whose guest has not arrived yet — colouring it amber would
 * make the healthy majority of the queue look like a problem.
 *
 * "Releasing…" covers every RazorpayX status that is not finished — queued,
 * pending, processing — because they are one thing to whoever is watching:
 * money is on its way and there is nothing to do. The exact word is shown
 * underneath for the person who needs it.
 */
const SETTLEMENT_TONE: Record<Settlement['status'], { tone: BadgeTone; label: string }> = {
  held: { tone: 'neutral', label: 'Held until check-in' },
  releasable: { tone: 'warn', label: 'Ready to release' },
  withdrawing: { tone: 'brand', label: 'Releasing…' },
  paid_out: { tone: 'good', label: 'Paid out' },
  failed: { tone: 'crit', label: 'Payout failed' },
  reversed: { tone: 'neutral', label: 'Reversed' },
};

const PAYMENT_TONE: Record<string, BadgeTone> = {
  paid: 'good', pending: 'warn', failed: 'crit', expired: 'neutral', not_required: 'neutral',
};

export const MonitorPage: React.FC<{ search?: string; role?: AdminRole }> = ({ search = '', role }) => {
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [slug, setSlug] = useState<string>('hotel');
  const [result, setResult] = useState<CategoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>('');
  const [toast, setToast] = useState<Notice>(null);
  const [query, setQuery] = useState('');
  const [collectFor, setCollectFor] = useState<MonitorRow | null>(null);

  /*
   * Who may do what, mirrored from the backend's own gates.
   *
   * The server refuses regardless — `requireRoles` on the router is the real
   * guard. This is here so the console does not offer a button that can only
   * come back 403, which is a worse experience than not seeing it.
   */
  const canEditCommission = role === 'Super Admin' || role === 'Admin';
  const canWithdraw = role === 'Super Admin';

  const load = useCallback(async (which: string) => {
    setLoading(true);
    const [s, r] = await Promise.all([monitorService.summary(), monitorService.category(which)]);
    setSummary(s);
    setResult(r);
    setLoading(false);
  }, []);

  useEffect(() => { void load(slug); }, [slug, load]);

  const term = (search || query).trim().toLowerCase();
  const rows = useMemo(() => {
    const all = result?.data ?? [];
    if (!term) return all;
    return all.filter((r) => [r.propertyName, r.guestName, r.guestPhone, r.ownerName, r.place]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(term)));
  }, [result, term]);

  const isHotel = result?.category === 'HOTEL';
  const isBachelor = result?.category === 'BACHELOR';

  /* ── Actions ─────────────────────────────────────────────────────────── */

  const changeCommission = async (settlementId: string, percent: number) => {
    setBusyId(settlementId);
    try {
      await monitorService.setCommission(settlementId, percent);
      setToast({ tone: 'good', message: `Commission set to ${percent}%.` });
      await load(slug);
    } catch (error) {
      setToast({ tone: 'crit', message: error instanceof MonitorError ? error.message : 'Could not change that.' });
    } finally {
      setBusyId('');
    }
  };

  /*
   * Withdraw. No amount is sent — see `monitorService.withdraw`.
   *
   * The server's refusal is shown verbatim, because it is the useful half:
   * "The hotel owner has not completed payout onboarding" tells whoever
   * pressed this what to do next, where "Could not release" does not.
   */
  const withdraw = async (settlement: Settlement, propertyName: string) => {
    const confirmed = window.confirm(
      `Release ${inr(settlement.ownerShare)} to ${propertyName}?\n\n`
      + `Total paid by the guest: ${inr(settlement.totalAmount)}\n`
      + `Lampose keeps: ${inr(settlement.ourShare)} (${settlement.commissionPercent}%)\n\n`
      + 'This sends real money and cannot be undone from here.',
    );
    if (!confirmed) return;

    setBusyId(settlement.id);
    try {
      const updated = await monitorService.withdraw(settlement.id);
      setToast({ tone: 'good', message: `${inr(updated.ownerShare)} released to ${propertyName}.` });
      await load(slug);
    } catch (error) {
      setToast({ tone: 'crit', message: error instanceof MonitorError ? error.message : 'Could not release this payout.' });
      await load(slug);
    } finally {
      setBusyId('');
    }
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      <PageHeader
        title="Monitor"
        description="Every booking and every rupee, by category"
        actions={(
          <Button variant="ghost" icon={RefreshCw} onClick={() => void load(slug)} disabled={loading}>
            Refresh
          </Button>
        )}
      />

      {/* The money summary. Hotel-only figures, so it says so rather than
          appearing to describe all four categories. */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Wallet} label="Ready to release" value={inr(summary.settlements.readyToRelease)}
            hint={`${summary.settlements.releasable} hotel booking(s)`} tone={summary.settlements.releasable ? 'warn' : 'neutral'} />
          <Stat icon={Clock} label="Held until check-in" value={String(summary.settlements.held)}
            hint="Guests not arrived yet" tone="neutral" />
          <Stat icon={CheckCircle2} label="Paid out" value={String(summary.settlements.paidOut)}
            hint="Settled to hotels" tone="good" />
          <Stat icon={ShieldAlert} label="Failed" value={String(summary.settlements.failed)}
            hint="Need a retry" tone={summary.settlements.failed ? 'crit' : 'neutral'} />
        </div>
      )}

      {/* The four tabs. */}
      <div className="flex flex-wrap gap-2">
        {(summary?.tabs ?? []).map((tab) => (
          <button
            key={tab.slug}
            type="button"
            onClick={() => setSlug(tab.slug)}
            className={cx(
              'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition',
              slug === tab.slug
                ? 'border-accent bg-accent/10 text-accent font-semibold'
                : 'border-line bg-surface text-ink-2 hover:border-accent/40',
            )}
          >
            <Building2 className="h-4 w-4" />
            <span>{tab.label}</span>
            <span className="text-xs text-ink-3">{tab.properties}</span>
            {tab.needsAction ? (
              <span className="rounded-full bg-warn px-1.5 text-[11px] font-semibold text-white">
                {tab.needsAction}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <Card padded={false}>
        <div className="flex items-center justify-between gap-3 border-b border-line p-3">
          <div className="text-sm text-ink-2">
            {result?.label}
            <span className="ml-2 text-ink-3">
              {loading ? 'loading…' : `${rows.length} booking${rows.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Property, guest, owner…"
            className="w-64"
          />
        </div>

        {loading ? (
          <TableSkeleton cols={isHotel ? 8 : 6} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Nothing here yet"
            description={
              term
                ? 'No booking matches that search.'
                : `No ${result?.label ?? ''} bookings have been made yet.`
            }
          />
        ) : isHotel ? (
          <HotelTable
            rows={rows}
            busyId={busyId}
            canEditCommission={canEditCommission}
            canWithdraw={canWithdraw}
            onCommission={changeCommission}
            onWithdraw={withdraw}
          />
        ) : isBachelor ? (
          <BachelorTable rows={rows} />
        ) : (
          <FreeTable rows={rows} canEdit={canEditCommission} onCollect={setCollectFor} />
        )}
      </Card>

      <CollectModal
        row={collectFor}
        onClose={() => setCollectFor(null)}
        onSaved={async (message) => {
          setCollectFor(null);
          setToast({ tone: 'good', message });
          await load(slug);
        }}
        onError={(message) => setToast({ tone: 'crit', message })}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Hotel — the full split
 * ------------------------------------------------------------------ */

const HotelTable: React.FC<{
  rows: MonitorRow[];
  busyId: string;
  canEditCommission: boolean;
  canWithdraw: boolean;
  onCommission: (id: string, percent: number) => void;
  onWithdraw: (settlement: Settlement, propertyName: string) => void;
}> = ({ rows, busyId, canEditCommission, canWithdraw, onCommission, onWithdraw }) => (
  <div className="overflow-x-auto">
    <Table>
      <thead>
        <Tr>
          <Th>Booking</Th>
          <Th>Guest</Th>
          <Th>Stay</Th>
          <Th>Payment</Th>
          {/* The four money columns, side by side, as asked. */}
          <Th className="text-right">Total</Th>
          <Th className="text-right">Our %</Th>
          <Th className="text-right">Our share</Th>
          <Th className="text-right">Owner share</Th>
          <Th>Payout</Th>
          <Th />
        </Tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const s = row.settlement;
          return (
            <Tr key={row.id}>
              <Td>
                <div className="font-medium text-ink-1">{row.propertyName}</div>
                <div className="text-xs text-ink-3">{row.place}</div>
                <div className="text-xs text-ink-3">{row.ownerName}</div>
              </Td>
              <Td>
                <div className="text-ink-1">{row.guestName || '—'}</div>
                <div className="text-xs text-ink-3">{row.guestPhone}</div>
              </Td>
              <Td>
                <div className="text-xs text-ink-2">{day(row.checkInDate)} → {day(row.checkOutDate)}</div>
                {row.nights ? <div className="text-xs text-ink-3">{row.nights} {row.nightsUnit}</div> : null}
                <div className="text-xs text-ink-3">{row.bookingStatus ?? row.requestStatus}</div>
              </Td>
              <Td>
                <Badge tone={PAYMENT_TONE[row.paymentStatus ?? 'not_required'] ?? 'neutral'}>
                  {row.paymentStatus}
                </Badge>
                {row.paymentMode === 'dev' && (
                  <div className="mt-1 text-[11px] font-semibold text-warn">dev bypass — no money</div>
                )}
                <div className="mt-1 text-[11px] text-ink-3">{when(row.paidAt)}</div>
              </Td>

              {/* A paid booking with no settlement row is a FAULT, not a free
                  stay. It reads as one rather than as zeroes. */}
              {!s ? (
                <Td colSpan={5}>
                  <div className="flex items-center gap-2 text-sm text-ink-3">
                    <AlertTriangle className="h-4 w-4 text-warn" />
                    {row.paymentStatus === 'paid'
                      ? 'Paid, but no settlement was written — this needs looking at.'
                      : 'No settlement yet — the guest has not paid.'}
                  </div>
                </Td>
              ) : (
                <>
                  <Td className="text-right font-semibold text-ink-1">{inr(s.totalAmount)}</Td>
                  <Td className="text-right">
                    <PercentField
                      settlement={s}
                      disabled={!canEditCommission || !s.canEditCommission || busyId === s.id}
                      onCommit={(percent) => onCommission(s.id, percent)}
                    />
                  </Td>
                  <Td className="text-right text-accent">{inr(s.ourShare)}</Td>
                  <Td className="text-right font-semibold text-ink-1">{inr(s.ownerShare)}</Td>
                  <Td>
                    <Badge tone={SETTLEMENT_TONE[s.status].tone}>{SETTLEMENT_TONE[s.status].label}</Badge>
                    {s.failureReason && (
                      <div className="mt-1 max-w-[220px] text-[11px] text-crit">{s.failureReason}</div>
                    )}
                    {s.settledAt && <div className="mt-1 text-[11px] text-ink-3">{when(s.settledAt)}</div>}

                    {/*
                      RazorpayX's own word for the payout, beside ours.

                      They answer different questions and both matter: our
                      status is what Lampose has decided, `payoutStatus` is
                      what the bank rail is doing. A settlement sitting in
                      "Releasing…" for an hour is a queued payout waiting on
                      balance, and only this line can say so.
                    */}
                    {s.payoutStatus && s.status === 'withdrawing' && (
                      <div className="mt-1 text-[11px] text-ink-3">
                        RazorpayX: {s.payoutStatus}
                      </div>
                    )}
                    {s.payoutId && (
                      <div className="mt-1 font-mono text-[11px] text-ink-3">{s.payoutId}</div>
                    )}
                    {/* The bank's own reference, which is what a hotel is
                        asked for when they ring their branch. */}
                    {s.utr && (
                      <div className="mt-1 font-mono text-[11px] text-ink-3">UTR {s.utr}</div>
                    )}
                    {/* Historical Route rows keep their transfer id so an old
                        settlement can still be traced. */}
                    {s.provider === 'route' && s.transferId && (
                      <div className="mt-1 font-mono text-[11px] text-ink-3">
                        Route transfer {s.transferId}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {s.canWithdraw && canWithdraw ? (
                      <Button
                        variant="primary"
                        icon={BadgeIndianRupee}
                        disabled={busyId === s.id}
                        onClick={() => onWithdraw(s, row.propertyName)}
                      >
                        {busyId === s.id ? 'Releasing…' : 'Withdraw'}
                      </Button>
                    ) : s.canWithdraw && !canWithdraw ? (
                      <span className="text-xs text-ink-3">Super Admin only</span>
                    ) : null}
                  </Td>
                </>
              )}
            </Tr>
          );
        })}
      </tbody>
    </Table>
  </div>
);

/**
 * The percentage, typed inline.
 *
 * Committed on blur or Enter rather than on every keystroke — each commit is a
 * server round trip that re-splits the money and writes an audit entry, and
 * one per character would be both noisy and a lie about how many times
 * somebody changed their mind.
 */
const PercentField: React.FC<{
  settlement: Settlement;
  disabled: boolean;
  onCommit: (percent: number) => void;
}> = ({ settlement, disabled, onCommit }) => {
  const [value, setValue] = useState(String(settlement.commissionPercent));
  useEffect(() => { setValue(String(settlement.commissionPercent)); }, [settlement.commissionPercent]);

  const commit = () => {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0 || next > 100) {
      setValue(String(settlement.commissionPercent));
      return;
    }
    if (next !== settlement.commissionPercent) onCommit(next);
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-16 text-right"
        inputMode="decimal"
      />
      <span className="text-ink-3">%</span>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Bachelor — the ₹199 fee, no owner share
 * ------------------------------------------------------------------ */

const BachelorTable: React.FC<{ rows: MonitorRow[] }> = ({ rows }) => (
  <div className="overflow-x-auto">
    <Table>
      <thead>
        <Tr>
          <Th>Property</Th><Th>Guest</Th><Th>Request</Th>
          <Th>Visit fee</Th><Th className="text-right">Amount</Th><Th>Visit slot</Th>
        </Tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <div className="font-medium text-ink-1">{row.propertyName}</div>
              <div className="text-xs text-ink-3">{row.place} · {row.ownerName}</div>
            </Td>
            <Td>
              <div className="text-ink-1">{row.guestName || '—'}</div>
              <div className="text-xs text-ink-3">{row.guestPhone}</div>
            </Td>
            <Td>
              <Badge tone={row.ownerAccepted ? 'good' : row.requestStatus === 'pending_owner' ? 'warn' : 'neutral'}>
                {row.requestStatus}
              </Badge>
              <div className="mt-1 text-[11px] text-ink-3">{when(row.requestedAt)}</div>
            </Td>
            <Td>
              <Badge tone={PAYMENT_TONE[row.paymentStatus ?? 'not_required'] ?? 'neutral'}>
                {row.paymentStatus}
              </Badge>
              {row.paymentMode === 'dev' && (
                <div className="mt-1 text-[11px] font-semibold text-warn">dev bypass</div>
              )}
            </Td>
            {/* The whole fee is ours, so there is no split to show — and
                deliberately no percentage field on this tab. */}
            <Td className="text-right font-semibold text-ink-1">{inr(row.amount)}</Td>
            <Td>
              <div className="text-xs text-ink-2">{row.visitStatus}</div>
              {row.visitDate && <div className="text-[11px] text-ink-3">{row.visitDate} {row.visitTime}</div>}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  </div>
);

/* ------------------------------------------------------------------ *
 * PG / Hostel and Co-living — no platform money, an offline commission
 * ------------------------------------------------------------------ */

const FreeTable: React.FC<{
  rows: MonitorRow[];
  canEdit: boolean;
  onCollect: (row: MonitorRow) => void;
}> = ({ rows, canEdit, onCollect }) => (
  <div className="overflow-x-auto">
    <Table>
      <thead>
        <Tr>
          <Th>Property</Th><Th>Guest</Th><Th>Owner answered</Th>
          <Th>Booking</Th><Th className="text-right">Listed rent</Th><Th>Our commission</Th><Th />
        </Tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <div className="font-medium text-ink-1">{row.propertyName}</div>
              <div className="text-xs text-ink-3">{row.place}</div>
              <div className="text-xs text-ink-3">{row.ownerName} {row.ownerPhone}</div>
            </Td>
            <Td>
              <div className="text-ink-1">{row.guestName || '—'}</div>
              <div className="text-xs text-ink-3">{row.guestPhone}</div>
            </Td>
            <Td>
              {/* The conversation, as separate facts — an administrator ringing
                  an owner needs to know which of the two moved. */}
              <Badge tone={row.ownerAccepted ? 'good' : row.ownerAnswered ? 'crit' : 'warn'}>
                {row.ownerAccepted ? 'Accepted' : row.ownerAnswered ? 'Declined' : 'Waiting'}
              </Badge>
              {row.declineReason && <div className="mt-1 text-[11px] text-ink-3">{row.declineReason}</div>}
              <div className="mt-1 text-[11px] text-ink-3">{when(row.decidedAt ?? row.requestedAt)}</div>
            </Td>
            <Td>
              <div className="text-xs text-ink-2">{row.bookingStatus ?? '—'}</div>
              <div className="text-[11px] text-ink-3">from {day(row.checkInDate)}</div>
            </Td>
            {/* The LISTING's rent, as the reference a commission is negotiated
                against — never presented as an agreed figure, because Lampose
                is not told what the two of them settled on. */}
            <Td className="text-right text-ink-2">{inr(row.listedRent)}</Td>
            <Td>
              {row.commissionCollected ? (
                <>
                  <Badge tone="good" icon={CheckCircle2}>{inr(row.commissionAmount)} collected</Badge>
                  <div className="mt-1 text-[11px] text-ink-3">{when(row.commissionCollectedAt)}</div>
                </>
              ) : row.ownerAccepted ? (
                <Badge tone="warn">Not collected</Badge>
              ) : (
                <span className="text-xs text-ink-3">—</span>
              )}
            </Td>
            <Td>
              {canEdit && row.ownerAccepted && row.bookingId && !row.commissionCollected && (
                <Button variant="ghost" icon={Landmark} onClick={() => onCollect(row)}>
                  Mark collected
                </Button>
              )}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  </div>
);

/**
 * Recording an offline collection.
 *
 * The amount is TYPED, unlike everywhere else in this page — and that is
 * correct rather than a lapse. Nothing is paid from this figure; it records
 * cash a person already collected over the phone, and there is no server-side
 * number to check it against because Lampose is never told what rent the
 * student and the owner agreed. The listed rent is shown beside it as the
 * reference it is.
 */
const CollectModal: React.FC<{
  row: MonitorRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}> = ({ row, onClose, onSaved, onError }) => {
  const [amount, setAmount] = useState('');
  const [percent, setPercent] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setAmount(''); setPercent(''); setNote(''); }, [row?.id]);

  if (!row) return null;

  const save = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) return;
    setBusy(true);
    try {
      await monitorService.markCommissionCollected(row.bookingId as string, {
        amount: value,
        percent: percent ? Number(percent) : undefined,
        note,
      });
      onSaved(`Recorded ${inr(value)} collected from ${row.ownerName || row.propertyName}.`);
    } catch (error) {
      onError(error instanceof MonitorError ? error.message : 'Could not record that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Record commission collected">
      <div className="space-y-3">
        <div className="rounded-lg bg-surface-2 p-3 text-sm">
          <div className="font-medium text-ink-1">{row.propertyName}</div>
          <div className="text-ink-3">{row.ownerName} {row.ownerPhone}</div>
          <div className="mt-1 text-ink-3">Listed rent {inr(row.listedRent)} — a reference, not an agreed figure.</div>
        </div>

        <label className="block text-sm">
          <span className="text-ink-2">Amount collected (₹)</span>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
        </label>

        <label className="block text-sm">
          <span className="text-ink-2">Percentage agreed (optional)</span>
          <Input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal" />
        </label>

        <label className="block text-sm">
          <span className="text-ink-2">Note (optional)</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paid by UPI, spoke to Ramesh" />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !amount} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Record it'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const Stat: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; hint: string;
  tone: 'neutral' | 'good' | 'warn' | 'crit';
}> = ({ icon: Icon, label, value, hint, tone }) => (
  <Card>
    <div className="flex items-start gap-3">
      <div className={cx(
        'rounded-lg p-2',
        tone === 'good' ? 'bg-good/10 text-good'
          : tone === 'warn' ? 'bg-warn/10 text-warn'
            : tone === 'crit' ? 'bg-crit/10 text-crit'
              : 'bg-surface-2 text-ink-3',
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-ink-3">{label}</div>
        <div className="text-lg font-semibold text-ink-1">{value}</div>
        <div className="text-[11px] text-ink-3">{hint}</div>
      </div>
    </div>
  </Card>
);

export default MonitorPage;
