import React, { useState } from 'react';
import { Banknote } from 'lucide-react';

import { driverAdminService } from '../../../api/services/driverAdminService';
import type { DriverCashDepositMethod, DriverCashLedger } from '../../../api/types';
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
 * The cash a rider is holding from cash-on-delivery orders, and the form an
 * operator uses when the rider hands it over.
 *
 * Every figure comes from the server, which derives it from the orders and
 * the hand-overs each time it is asked. The form sends rupees as counted; the
 * server refuses anything above what the rider holds.
 */

const METHOD_LABEL: Record<DriverCashDepositMethod, string> = {
  cash: 'Cash, counted',
  bank: 'Bank transfer',
  upi: 'UPI transfer',
};

const rupees = (paise: number): string =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const when = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const CashPanel: React.FC<{
  driverId: string;
  cash: DriverCashLedger;
  /** Hides the form for roles the server would refuse. */
  canRecord: boolean;
  onRecorded: () => void;
  onToast: (toast: ToastState) => void;
}> = ({ driverId, cash, canRecord, onRecorded, onToast }) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<DriverCashDepositMethod>('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const record = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      onToast({ tone: 'crit', message: 'Enter the amount received in rupees.' });
      return;
    }
    if (Math.round(value * 100) > cash.inHandPaise) {
      onToast({ tone: 'crit', message: `This rider is holding ${rupees(cash.inHandPaise)}. A hand-over cannot be more.` });
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
    onRecorded();
  };

  return (
    <Section title="Cash in hand">
      <DataRow
        label="Holding now"
        value={
          <Text className={cash.inHandPaise > 0 ? 'font-semibold text-warn tabular' : 'tabular text-ink-2'}>
            {rupees(cash.inHandPaise)}
          </Text>
        }
      />
      <DataRow
        label="Collected in cash"
        value={`${rupees(cash.collectedPaise)} · ${cash.cashOrders} order${cash.cashOrders === 1 ? '' : 's'}`}
      />
      <DataRow label="Handed over" value={rupees(cash.depositedPaise)} />

      {cash.deposits.length > 0 && (
        <Box className="mt-3">
          <Text className="text-micro uppercase text-ink-3 mb-1">Recent hand-overs</Text>
          <PlainTable className="w-full text-body">
            <TableBody>
              {cash.deposits.map((d) => (
                <PlainTr key={d.id} className="border-b border-line last:border-0">
                  <PlainTd className="py-1.5 pr-3 text-ink-3 whitespace-nowrap">{when(d.at)}</PlainTd>
                  <PlainTd className="py-1.5 pr-3 text-ink-2">
                    {METHOD_LABEL[d.method]}
                    {d.reference ? ` · ${d.reference}` : ''}
                  </PlainTd>
                  <PlainTd className="py-1.5 pr-3 text-ink-3">{d.recordedBy}</PlainTd>
                  <PlainTd className="py-1.5 text-right tabular text-ink">{rupees(d.amountPaise)}</PlainTd>
                </PlainTr>
              ))}
            </TableBody>
          </PlainTable>
        </Box>
      )}

      {canRecord && cash.inHandPaise > 0 && (
        <Box className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <Field label="Amount received (₹)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={(cash.inHandPaise / 100).toString()}
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
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Receipt or UTR number"
            />
          </Field>
          <Box className="sm:col-span-3">
            <Button icon={Banknote} onClick={record} disabled={busy || !amount}>
              {busy ? 'Saving…' : 'Record hand-over'}
            </Button>
          </Box>
        </Box>
      )}
    </Section>
  );
};
