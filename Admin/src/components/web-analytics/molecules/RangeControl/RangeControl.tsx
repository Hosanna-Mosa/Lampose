import React, { useState } from 'react';
import { Button } from '../../../common/atoms/Button';
import { Input } from '../../../common/atoms/Input';
import { Field } from '../../../common/molecules/Field';
import { cx } from '../../../common/utils';
import { type GaQuery } from '../../../../api/services/webAnalyticsService';
import { PRESETS, todayISO } from '../../utils';
import { Box } from '../../../common/atoms/Box';
import { PlainButton } from '../../../common/atoms/PlainButton';

/* ── Date range control ───────────────────────────────────────────────── */

export const RangeControl: React.FC<{ query: GaQuery; onChange: (q: GaQuery) => void }> = ({ query, onChange }) => {
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState(query.startDate || todayISO());
  const [customEnd, setCustomEnd] = useState(query.endDate || todayISO());

  return (
    <Box className="relative">
      <Box className="flex items-center gap-0.5 p-0.5 rounded-control bg-surface-inset">
        {PRESETS.map((p) => (
          <PlainButton
            key={p.id}
            onClick={() => {
              setCustomOpen(false);
              onChange({ range: p.id });
            }}
            aria-pressed={query.range === p.id}
            className={cx(
              'h-7 px-2.5 rounded-[6px] text-label transition-colors',
              query.range === p.id ? 'bg-surface text-ink shadow-[var(--shadow-sm)]' : 'text-ink-3 hover:text-ink'
            )}
          >
            {p.label}
          </PlainButton>
        ))}
        <PlainButton
          onClick={() => setCustomOpen((v) => !v)}
          aria-pressed={query.range === 'custom'}
          className={cx(
            'h-7 px-2.5 rounded-[6px] text-label transition-colors',
            query.range === 'custom' ? 'bg-surface text-ink shadow-[var(--shadow-sm)]' : 'text-ink-3 hover:text-ink'
          )}
        >
          Custom
        </PlainButton>
      </Box>

      {customOpen && (
        <>
          <Box className="fixed inset-0 z-40" onClick={() => setCustomOpen(false)} aria-hidden />
          <Box className="absolute right-0 top-9 z-50 w-72 p-3.5 bg-surface border border-line rounded-panel shadow-[var(--shadow-lg)] anim-fade-up space-y-3">
            <Box className="grid grid-cols-2 gap-2">
              <Field label="Start date">
                <Input
                  type="date"
                  value={customStart}
                  max={customEnd}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </Field>
              <Field label="End date">
                <Input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  max={todayISO()}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </Field>
            </Box>
            <Button
              variant="primary"
              size="sm"
              className="w-full justify-center"
              onClick={() => {
                onChange({ range: 'custom', startDate: customStart, endDate: customEnd });
                setCustomOpen(false);
              }}
            >
              Apply range
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
};

/* ── Static lookups ───────────────────────────────────────────────────── */
