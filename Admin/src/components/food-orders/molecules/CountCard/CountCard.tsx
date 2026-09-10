import React from 'react';
import { cx } from '../../../common/utils';
import { PlainButton } from '../../../common/atoms/PlainButton';
import { Text } from '../../../common/atoms/Text';

/** A number above the queue that is also the filter for the rows behind it. */
export const CountCard: React.FC<{
  label: string;
  value: number;
  hint: string;
  tone: 'crit' | 'warn' | 'neutral';
  active: boolean;
  onClick: () => void;
}> = ({ label, value, hint, tone, active, onClick }) => (
  <PlainButton
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cx(
      'text-left rounded-panel border p-3 transition-colors duration-120',
      active
        ? 'border-brand-border bg-brand-soft'
        : 'border-line bg-surface hover:border-line-strong'
    )}
  >
    <Text className="text-micro uppercase text-ink-3">{label}</Text>
    <Text
      className={cx(
        'text-2xl font-semibold tabular mt-1',
        value > 0 && tone === 'crit' && 'text-crit',
        value > 0 && tone === 'warn' && 'text-warn',
        (value === 0 || tone === 'neutral') && 'text-ink'
      )}
    >
      {value}
    </Text>
    <Text className="text-label text-ink-3 mt-0.5">{hint}</Text>
  </PlainButton>
);
