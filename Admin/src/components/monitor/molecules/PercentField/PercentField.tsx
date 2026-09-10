import React, { useEffect, useState } from 'react';

import { Input } from '../../../common/atoms/Input';
import {
  type Settlement,
} from '../../../../api/services/monitorService';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';
/**
 * The percentage, typed inline.
 *
 * Committed on blur or Enter rather than on every keystroke — each commit is a
 * server round trip that re-splits the money and writes an audit entry, and
 * one per character would be both noisy and a lie about how many times
 * somebody changed their mind.
 */
export const PercentField: React.FC<{
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
    <Box className="flex items-center justify-end gap-1">
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-16 text-right"
        inputMode="decimal"
      />
      <Inline className="text-ink-3">%</Inline>
    </Box>
  );
};

/* ------------------------------------------------------------------ *
 * Bachelor — the ₹199 fee, no owner share
 * ------------------------------------------------------------------ */
