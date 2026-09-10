import React from 'react';
import { Badge } from '../../../common/atoms/Badge';
import type {
  DriverRow,
} from '../../../../api/types';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';

/** "3 of 5 verified", plus the one number an approver has to act on. */
export const DocumentTally: React.FC<{ row: DriverRow }> = ({ row }) => {
  const verified = row.documentCounts.verified ?? 0;
  const rejected = row.documentCounts.rejected ?? 0;
  const pending = row.documentCounts.pending ?? 0;

  return (
    <Box className="flex items-center gap-1.5">
      <Inline className="text-body tabular text-ink-2">
        {verified}/{row.documents.length}
      </Inline>
      {rejected > 0 && <Badge tone="crit">{rejected} rejected</Badge>}
      {rejected === 0 && pending > 0 && <Badge tone="warn">{pending} to review</Badge>}
      {rejected === 0 && pending === 0 && verified === 0 && <Badge tone="neutral">None sent</Badge>}
    </Box>
  );
};
