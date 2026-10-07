import React, { useState } from 'react';
import { Banknote, PencilLine } from 'lucide-react';

import { driverAdminService } from '../../../api/services/driverAdminService';
import { riderLedgerService } from '../../../api/services/riderLedgerService';
import type { DriverCashDepositMethod, RiderLedgerEntry, RiderWallet } from '../../../api/types';
import { Badge } from '../../common/atoms/Badge';
import { Box } from '../../common/atoms/Box';
import { Button } from '../../common/atoms/Button';
import { Input } from '../../common/atoms/Input';
import { Option } from '../../common/atoms/Option';
import { PlainTable, PlainTd, PlainTr, TableBody } from '../../common/atoms/PlainTable';
import { Select } from '../../common/atoms/Select';
import { Text } from '../../common/atoms/Text';
import { DataRow } from '../../common/molecules/DataRow';
import { Field } from '../../common/molecules/Field';
import { Section } from '../../common/molecules/Section';
import type { ToastState } from '../../common/organisms/Toast';

/**
 * A rider's money once the rider ledger is open — what replaces the Cash
 * panel. Two balances, the history behind them, and the two things the
 * console may do about them:
 *
 *   Record a hand-over   cash the rider handed in at an office (`riders.cash`)
 *                        — comes off what they owe. Riders normally pay by UPI
 *                        in their app; this is for when they did not.
 *   Correct              a signed change to either balance with a reason, for
 *                        what no delivery or payment explains — a refund after
 *                        delivery, a double-recorded hand-over (Super Admin).
 *
 * Every figure is the server's; amounts sent are rupees, amounts shown paise.
 */

const METHOD_LABEL: Record<DriverCashDepositMethod, string> = {
  cash: 'Cash, counted',
  bank: 'Bank transfer',
  upi: 'UPI transfer',
};

const KIND_LABEL: Record<RiderLedgerEntry['kind'], string> = {
  opening: 'Opening balance',
  earning: 'Delivery earning',
  cash_order: 'Cash collected',
  auto_adjust: 'Wallet cleared dues',
  cash_deposit: 'Cash handed over',
  repayment: 'Paid by UPI',
  withdrawal: 'Withdrawal',
  withdrawal_reversed: 'Withdrawal returned',
  correction: 'Correction',
};

const rupees = (paise: number): string =>
  `${paise < 0 ? '−' : ''}₹${(Math.abs(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const signed = (paise: number): string => (paise > 0 ? `+${rupees(paise)}` : rupees(paise));

const when = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const RiderMoneyPanel: React.FC<{
  driverId: string;
  wallet: RiderWallet;
  /** `riders.cash` — may record a hand-over. */
  canRecord: boolean;
  /** `riders.ledger` — Super Admin — may correct. */
  canCorrect: boolean;
  onChanged: () => void;
  onToast: (toast: ToastState) => void;
}> = ({ driverId, wallet, canRecord, canCorrect, onChanged, onToast }) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<DriverCashDepositMethod>('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const [correcting, setCorrecting] = useState(false);
  const [walletChange, setWalletChange] = useState('');
  const [owedChange, setOwedChange] = useState('');
  const [reason, setReason] = useState('');

  const owes = wallet.outstandingPaise;

  const recordHandOver = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      onToast({ tone: 'crit', message: 'Enter the amount received in rupees.' });
      return;
    }
    if (Math.round(value * 100) > owes) {
      onToast({ tone: 'crit', message: `This rider owes ${rupees(owes)}. A hand-over cannot be more.` });
      return;
    }
    setBusy(true);
    const res = await driverAdminService.recordCashDeposit(driverId, {
      amount: value,
      method,
      reference: reference.trim() || undefined,
    });
    setBusy(false);
    if (!res.success) {
      onToast({ tone: 'crit', message: res.message || 'That did not save.' });
      return;
    }
    onToast({ tone: 'good', message: `${rupees(Math.round(value * 100))} recorded as handed over.` });
    setAmount('');
    setReference('');
    onChanged();
  };

  const correct = async () => {
    const w = walletChange.trim() === '' ? 0 : Number(walletChange);
    const o = owedChange.trim() === '' ? 0 : Number(owedChange);
    if (!Number.isFinite(w) || !Number.isFinite(o) || (!w && !o)) {
      onToast({ tone: 'crit', message: 'Enter a change to the wallet, the outstanding, or both — e.g. 50 or -50.' });
      return;
    }
    if (!reason.trim()) {
      onToast({ tone: 'crit', message: 'Say why — it stays on the rider’s history.' });
      return;
    }
    setBusy(true);
    const res = await riderLedgerService.correct(driverId, {
      ...(w ? { wallet: w } : {}),
      ...(o ? { outstanding: o } : {}),
      reason: reason.trim(),
    });
    setBusy(false);
    if (!res.success) {
      onToast({ tone: 'crit', message: res.message || 'That did not save.' });
      return;
    }
    onToast({ tone: 'good', message: 'Correction recorded.' });
    setWalletChange('');
    setOwedChange('');
    setReason('');
    setCorrecting(false);
    onChanged();
  };

  return (
    <Section title="Rider money">
      <DataRow
        label="Wallet (Lampose owes them)"
        value={<Text className="font-semibold tabular text-ink">{rupees(wallet.walletPaise)}</Text>}
      />
      <DataRow
        label="Outstanding (they owe Lampose)"
        value={
          <Box className="inline-flex items-center gap-2">
            <Text className={owes > 0 ? 'font-semibold text-warn tabular' : 'tabular text-ink-2'}>{rupees(owes)}</Text>
            {wallet.codBlocked && <Badge tone="crit">Cash orders paused</Badge>}
          </Box>
        }
      />
      <DataRow label="Cash limit" value={rupees(wallet.codLimitPaise)} />

      {wallet.entries.length > 0 && (
        <Box className="mt-3">
          <Text className="text-micro uppercase text-ink-3 mb-1">History</Text>
          <Box className="max-h-80 overflow-y-auto">
            <PlainTable className="w-full text-body">
              <TableBody>
                {wallet.entries.map((e) => (
                  <PlainTr key={e.id} className="border-b border-line last:border-0 align-top">
                    <PlainTd className="py-1.5 pr-3 text-ink-3 whitespace-nowrap">{when(e.at)}</PlainTd>
                    <PlainTd className="py-1.5 pr-3 text-ink-2">
                      {KIND_LABEL[e.kind] ?? e.kind}
                      {e.orderNumber ? ` · ${e.orderNumber}` : ''}
                      {e.kind === 'cash_order' && (
                        <Text className="text-label text-ink-3">
                          {rupees(e.collectedPaise)} cash, {rupees(e.earningPaise)} kept
                        </Text>
                      )}
                      {e.note && e.kind !== 'cash_order' && <Text className="text-label text-ink-3">{e.note}</Text>}
                      {e.by && e.by !== 'system' && e.by !== 'rider' && (
                        <Text className="text-label text-ink-3">by {e.by}</Text>
                      )}
                    </PlainTd>
                    <PlainTd className="py-1.5 pr-3 text-right tabular whitespace-nowrap">
                      {e.walletPaise !== 0 && <Text className="text-good">{signed(e.walletPaise)} wallet</Text>}
                      {e.outstandingPaise !== 0 && (
                        <Text className={e.outstandingPaise > 0 ? 'text-warn' : 'text-good'}>
                          {signed(e.outstandingPaise)} owed
                        </Text>
                      )}
                    </PlainTd>
                    <PlainTd className="py-1.5 text-right tabular text-ink-3 whitespace-nowrap">
                      {rupees(e.walletAfterPaise)} / {rupees(e.outstandingAfterPaise)}
                    </PlainTd>
                  </PlainTr>
                ))}
              </TableBody>
            </PlainTable>
          </Box>
          <Text className="text-label text-ink-3 mt-1">Last column: wallet / outstanding after each row.</Text>
        </Box>
      )}

      {canRecord && owes > 0 && (
        <Box className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <Field label="Cash received (₹)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={(owes / 100).toString()}
            />
          </Field>
          <Field label="How">
            <Select value={method} onChange={(e) => setMethod(e.target.value as DriverCashDepositMethod)}>
              {(Object.keys(METHOD_LABEL) as DriverCashDepositMethod[]).map((m) => (
                <Option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </Option>
              ))}
            </Select>
          </Field>
          <Field label="Reference (optional)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt or UTR number" />
          </Field>
          <Box className="sm:col-span-3">
            <Button icon={Banknote} onClick={recordHandOver} disabled={busy || !amount}>
              {busy ? 'Saving…' : 'Record hand-over'}
            </Button>
          </Box>
        </Box>
      )}

      {canCorrect && (
        <Box className="mt-4">
          {!correcting ? (
            <Button variant="ghost" icon={PencilLine} onClick={() => setCorrecting(true)}>
              Correct a balance
            </Button>
          ) : (
            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-panel border border-line bg-surface-subtle">
              <Field label="Wallet change (₹)" hint="+50 adds to what Lampose owes them; −50 takes it away.">
                <Input type="number" step="0.01" value={walletChange} onChange={(e) => setWalletChange(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Outstanding change (₹)" hint="+50 means they owe ₹50 more; −50 means ₹50 less.">
                <Input type="number" step="0.01" value={owedChange} onChange={(e) => setOwedChange(e.target.value)} placeholder="0" />
              </Field>
              <Box className="sm:col-span-2">
                <Field label="Reason" required hint="Kept on the rider’s history and the audit log.">
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Order LO123456 refunded after delivery" />
                </Field>
              </Box>
              <Box className="sm:col-span-2 flex gap-2">
                <Button onClick={correct} disabled={busy}>
                  {busy ? 'Saving…' : 'Record correction'}
                </Button>
                <Button variant="secondary" onClick={() => setCorrecting(false)}>
                  Cancel
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Section>
  );
};
