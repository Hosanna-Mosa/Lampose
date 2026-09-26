/* ══════════════════════════════════════════════════════════════════════════
   Visit Fees — the assisted-visit fee for each layout.

   A Bachelor or House / Co-live visit is priced by the layout the visitor
   picks; a Commercial visit by the category. This page is the one place those
   amounts are set. The rule that maps a listing's layout onto a tier lives on
   the server (`visitFees.service.js`), so the page edits prices, never tiers.

   ## What a change does, and does not do

   It prices every request created AFTER the save. A request already made
   keeps the amount frozen onto it, paid or not — the confirmation says so,
   because "why is this student still being asked ₹199?" is the question the
   old behaviour would otherwise raise.

   ## Who

   Anyone signed in can read it. Only a Super Admin sees the inputs, and the
   server refuses the save for anybody else regardless.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, History, IndianRupee, RefreshCw, RotateCcw, Save } from 'lucide-react';

import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Input } from '../components/common/atoms/Input';
import { Table, Td, Th, Tr } from '../components/common/atoms/Table';
import { TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Box } from '../components/common/atoms/Box';
import { Inline } from '../components/common/atoms/Inline';
import { Text } from '../components/common/atoms/Text';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import {
  VisitFeeError, visitFeeService, type VisitFees,
} from '../api/services/visitFeeService';
import type { AdminRole } from '../api/types';

const inr = (paise: number) => `₹${Math.round((Number(paise) || 0) / 100).toLocaleString('en-IN')}`;

const when = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

interface Props {
  role?: AdminRole;
}

export const VisitFeesPage: React.FC<Props> = ({ role }) => {
  const [fees, setFees] = useState<VisitFees | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  /* What is typed, in RUPEES, by tier key. Strings so a half-typed box is not
     coerced to 0 under the person's cursor. */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = role === 'Super Admin';

  const adopt = (data: VisitFees) => {
    setFees(data);
    setDraft(Object.fromEntries(data.tiers.map((t) => [t.key, String(Math.round(t.amountPaise / 100))])));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      adopt(await visitFeeService.get());
    } catch (err) {
      setError(err instanceof VisitFeeError ? err.message : 'Could not load the visit fees.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /* Whole rupees only — a visit fee has never had paise, and a decimal point
     is more likely a typo than a price. */
  const problems = useMemo(() => {
    const out: Record<string, string> = {};
    if (!fees) return out;
    for (const t of fees.tiers) {
      const raw = (draft[t.key] ?? '').trim();
      const rupees = Number(raw);
      if (!/^\d+$/.test(raw)) out[t.key] = 'Whole rupees only';
      else if (rupees * 100 < fees.limits.minPaise || rupees * 100 > fees.limits.maxPaise) {
        out[t.key] = `Between ${inr(fees.limits.minPaise)} and ${inr(fees.limits.maxPaise)}`;
      }
    }
    return out;
  }, [draft, fees]);

  const changes = useMemo(() => {
    const out: Record<string, number> = {};
    if (!fees) return out;
    for (const t of fees.tiers) {
      if (problems[t.key]) continue;
      const paise = Number(draft[t.key]) * 100;
      if (paise !== t.amountPaise) out[t.key] = paise;
    }
    return out;
  }, [draft, fees, problems]);

  const changed = Object.keys(changes).length;
  const invalid = Object.keys(problems).length;
  const labelOf = (key: string) => fees?.tiers.find((t) => t.key === key)?.label ?? key;

  const save = async () => {
    setBusy(true);
    try {
      adopt(await visitFeeService.update(changes));
      setToast({ tone: 'good', message: `${changed} fee${changed === 1 ? '' : 's'} updated. New requests are charged the new amount.` });
    } catch (err) {
      setToast({ tone: 'crit', message: err instanceof VisitFeeError ? err.message : 'The fees were not saved.' });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="Stay bookings"
        title="Visit Fees"
        description="What a customer pays for an assisted visit. Bachelor and House / Co-live are priced by the layout they pick; Commercial is one fee. PG / Hostel is free, and a Hotel pays for its stay."
        actions={(
          <Button icon={RefreshCw} onClick={() => void load()} disabled={loading || busy}>Refresh</Button>
        )}
      />

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <Box>
          <Box className="text-label uppercase tracking-wide text-ink-3">Last changed</Box>
          <Box className="text-body font-medium text-ink">{when(fees?.updatedAt ?? null)}</Box>
        </Box>
        <Box>
          <Box className="text-label uppercase tracking-wide text-ink-3">By</Box>
          <Box className="text-body font-medium text-ink">
            {fees?.updatedBy?.name || fees?.updatedBy?.email || (fees?.updatedAt ? '—' : 'Defaults, never edited')}
          </Box>
        </Box>
        <Box className="ml-auto max-w-md text-body text-ink-2">
          {canEdit
            ? 'A change applies to requests made after you save. Requests already made keep their amount.'
            : 'You can read these fees. Changing them is Super Admin only.'}
        </Box>
      </Card>

      <Card padded={false}>
        {loading && !fees ? (
          <TableSkeleton cols={4} />
        ) : error ? (
          <EmptyState icon={AlertTriangle} title="Could not load the fees" description={error} action={<Button onClick={() => void load()}>Try again</Button>} />
        ) : fees ? (
          <Table>
            <TableHead>
              <Tr>
                <Th>Layout</Th>
                <Th>Fee</Th>
                <Th>Default</Th>
                <Th className="text-right">{canEdit ? 'Reset' : ''}</Th>
              </Tr>
            </TableHead>
            <TableBody>
              {fees.tiers.map((t) => (
                <Tr key={t.key}>
                  <Td>
                    <Box className="font-medium text-ink">{t.label}</Box>
                    {t.note && <Box className="mt-0.5 text-[11px] text-ink-3">{t.note}</Box>}
                  </Td>
                  <Td>
                    {canEdit ? (
                      <Box>
                        <Box className="flex items-center gap-1.5">
                          <IndianRupee className="size-3.5 text-ink-3" aria-hidden="true" />
                          <Input
                            aria-label={`Fee for ${t.label}, in rupees`}
                            inputMode="numeric"
                            className="w-28 tabular-nums"
                            value={draft[t.key] ?? ''}
                            onChange={(e) => setDraft((d) => ({ ...d, [t.key]: e.target.value }))}
                            disabled={busy}
                          />
                        </Box>
                        {problems[t.key] && <Box className="mt-1 text-[11px] text-crit">{problems[t.key]}</Box>}
                      </Box>
                    ) : (
                      <Inline className="font-medium tabular-nums text-ink">{inr(t.amountPaise)}</Inline>
                    )}
                  </Td>
                  <Td>
                    <Inline className="tabular-nums text-ink-3">{inr(t.defaultPaise)}</Inline>
                  </Td>
                  <Td className="text-right">
                    {canEdit && Number(draft[t.key]) * 100 !== t.defaultPaise && (
                      <Button
                        size="sm"
                        icon={RotateCcw}
                        onClick={() => setDraft((d) => ({ ...d, [t.key]: String(t.defaultPaise / 100) }))}
                        disabled={busy}
                      >
                        Default
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Card>

      {canEdit && fees && (
        <Box className="flex flex-wrap items-center justify-end gap-3">
          <Text className="text-body text-ink-2">
            {invalid ? `${invalid} fee${invalid === 1 ? ' needs' : 's need'} fixing` : changed ? `${changed} unsaved change${changed === 1 ? '' : 's'}` : 'No changes'}
          </Text>
          <Button onClick={() => adopt(fees)} disabled={!changed || busy}>Discard</Button>
          <Button variant="primary" icon={Save} onClick={() => setConfirming(true)} disabled={!changed || invalid > 0 || busy}>
            Save fees
          </Button>
        </Box>
      )}

      <Card>
        <Box className="mb-3 flex items-center gap-2 text-body font-medium text-ink">
          <History className="size-4 text-ink-3" aria-hidden="true" /> Recent changes
        </Box>
        {!fees?.history?.length ? (
          <Text className="text-body text-ink-3">No changes yet — the defaults are in use.</Text>
        ) : (
          <Box className="space-y-2">
            {fees.history.map((h, i) => (
              <Box key={`${h.at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2 last:border-0">
                <Inline className="text-[12px] tabular-nums text-ink-3">{when(h.at)}</Inline>
                <Inline className="text-body text-ink">{h.by.name || h.by.email}</Inline>
                <Inline className="text-body text-ink-2">
                  {Object.keys(h.after).map((k) => `${labelOf(k)} ${inr(h.before[k])} → ${inr(h.after[k])}`).join(' · ')}
                </Inline>
              </Box>
            ))}
          </Box>
        )}
      </Card>

      <Modal
        open={confirming}
        onClose={() => (busy ? undefined : setConfirming(false))}
        title="Change the visit fees?"
        description="Requests made from now on are charged the new amounts. Requests already made — paid or waiting to be paid — keep theirs."
        footer={(
          <>
            <Button onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={() => void save()} loading={busy}>Save fees</Button>
          </>
        )}
      >
        <Box className="space-y-1.5 text-body text-ink-2">
          {Object.entries(changes).map(([key, paise]) => {
            const before = fees?.tiers.find((t) => t.key === key)?.amountPaise ?? 0;
            return (
              <Box key={key} className="flex items-center justify-between gap-4">
                <Inline className="text-ink">{labelOf(key)}</Inline>
                <Inline className="tabular-nums">
                  {inr(before)} → <Inline className="font-medium text-ink">{inr(paise)}</Inline>
                </Inline>
              </Box>
            );
          })}
        </Box>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};

export default VisitFeesPage;
