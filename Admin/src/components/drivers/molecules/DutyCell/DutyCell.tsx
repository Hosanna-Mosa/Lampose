import React from 'react';
import { Badge } from '../../../common/atoms/Badge';
import type {
  DriverRow,
} from '../../../../api/types';
import { ago } from '../../utils';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';

/** Duty, and whether the dispatcher can actually see them. */
export const DutyCell: React.FC<{ row: DriverRow }> = ({ row }) => {
  if (!row.isOnline) return <Inline className="text-label text-ink-3">Offline</Inline>;
  return (
    <Box className="flex flex-col gap-0.5">
      <Badge tone={row.locationFresh ? 'good' : 'warn'}>
        {row.locationFresh ? 'On duty' : 'Position stale'}
      </Badge>
      <Inline className="text-label text-ink-3">{ago(row.locationUpdatedAt)}</Inline>
    </Box>
  );
};
