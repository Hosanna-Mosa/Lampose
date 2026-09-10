import React from 'react';

import { Card } from '../../../common/atoms/Card';
import { cx } from '../../../common/utils';
import { Box } from '../../../common/atoms/Box';
export const Stat: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; hint: string;
  tone: 'neutral' | 'good' | 'warn' | 'crit';
}> = ({ icon: Icon, label, value, hint, tone }) => (
  <Card>
    <Box className="flex items-start gap-3">
      <Box className={cx(
        'rounded-lg p-2',
        tone === 'good' ? 'bg-good/10 text-good'
          : tone === 'warn' ? 'bg-warn/10 text-warn'
            : tone === 'crit' ? 'bg-crit/10 text-crit'
              : 'bg-surface-2 text-ink-3',
      )}>
        <Icon className="h-4 w-4" />
      </Box>
      <Box>
        <Box className="text-xs text-ink-3">{label}</Box>
        <Box className="text-lg font-semibold text-ink-1">{value}</Box>
        <Box className="text-[11px] text-ink-3">{hint}</Box>
      </Box>
    </Box>
  </Card>
);

