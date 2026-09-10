import React, { useEffect, useState } from 'react';

import { Button } from '../../../common/atoms/Button';
import { Input } from '../../../common/atoms/Input';
import { Modal } from '../../../common/organisms/Modal';
import {
  MonitorError, monitorService,
  type MonitorRow, 
} from '../../../../api/services/monitorService';
import { inr } from '../../utils';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';
import { Label } from '../../../common/atoms/Label';

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
export const CollectModal: React.FC<{
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
      <Box className="space-y-3">
        <Box className="rounded-lg bg-surface-2 p-3 text-sm">
          <Box className="font-medium text-ink-1">{row.propertyName}</Box>
          <Box className="text-ink-3">{row.ownerName} {row.ownerPhone}</Box>
          <Box className="mt-1 text-ink-3">Listed rent {inr(row.listedRent)} — a reference, not an agreed figure.</Box>
        </Box>

        <Label className="block text-sm">
          <Inline className="text-ink-2">Amount collected (₹)</Inline>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
        </Label>

        <Label className="block text-sm">
          <Inline className="text-ink-2">Percentage agreed (optional)</Inline>
          <Input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal" />
        </Label>

        <Label className="block text-sm">
          <Inline className="text-ink-2">Note (optional)</Inline>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paid by UPI, spoke to Ramesh" />
        </Label>

        <Box className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !amount} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Record it'}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
};
