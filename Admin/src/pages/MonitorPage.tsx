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
  Building2, CheckCircle2, Clock,
  RefreshCw, ShieldAlert, Wallet,
} from 'lucide-react';

import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { SearchInput } from '../components/common/molecules/SearchInput';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import { cx } from '../components/common/utils';
import {
  MonitorError, monitorService,
  type CategoryResult, type MonitorRow, type MonitorSummary, type Settlement,
} from '../api/services/monitorService';
import type { AdminRole } from '../api/types';

import { HotelTable } from '../components/monitor/organisms/HotelTable';
import { BachelorTable } from '../components/monitor/organisms/BachelorTable';
import { FreeTable } from '../components/monitor/organisms/FreeTable';
import { CollectModal } from '../components/monitor/organisms/CollectModal';
import { Stat } from '../components/monitor/molecules/Stat';
import { inr } from '../components/monitor/utils';
import { Box } from '../components/common/atoms/Box';
import { Inline } from '../components/common/atoms/Inline';
import { PlainButton } from '../components/common/atoms/PlainButton';
/* `ToastState` is the console's own — good | crit. Reused rather than
   redefined, so this page cannot drift from how every other one reports. */
type Notice = ToastState | null;






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
    <Box className="space-y-4">
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
        <Box className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Wallet} label="Ready to release" value={inr(summary.settlements.readyToRelease)}
            hint={`${summary.settlements.releasable} hotel booking(s)`} tone={summary.settlements.releasable ? 'warn' : 'neutral'} />
          <Stat icon={Clock} label="Held until check-in" value={String(summary.settlements.held)}
            hint="Guests not arrived yet" tone="neutral" />
          <Stat icon={CheckCircle2} label="Paid out" value={String(summary.settlements.paidOut)}
            hint="Settled to hotels" tone="good" />
          <Stat icon={ShieldAlert} label="Failed" value={String(summary.settlements.failed)}
            hint="Need a retry" tone={summary.settlements.failed ? 'crit' : 'neutral'} />
        </Box>
      )}

      {/* The four tabs. */}
      <Box className="flex flex-wrap gap-2">
        {(summary?.tabs ?? []).map((tab) => (
          <PlainButton
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
            <Inline>{tab.label}</Inline>
            <Inline className="text-xs text-ink-3">{tab.properties}</Inline>
            {tab.needsAction ? (
              <Inline className="rounded-full bg-warn px-1.5 text-[11px] font-semibold text-white">
                {tab.needsAction}
              </Inline>
            ) : null}
          </PlainButton>
        ))}
      </Box>

      <Card padded={false}>
        <Box className="flex items-center justify-between gap-3 border-b border-line p-3">
          <Box className="text-sm text-ink-2">
            {result?.label}
            <Inline className="ml-2 text-ink-3">
              {loading ? 'loading…' : `${rows.length} booking${rows.length === 1 ? '' : 's'}`}
            </Inline>
          </Box>
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Property, guest, owner…"
            className="w-64"
          />
        </Box>

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
    </Box>
  );
};

/* ------------------------------------------------------------------ *
 * Hotel — the full split
 * ------------------------------------------------------------------ */







export default MonitorPage;
