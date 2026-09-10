import React from 'react';

import { Badge } from '../../../common/atoms/Badge';
import { Table, Td, Th, Tr } from '../../../common/atoms/Table';
import {
  type MonitorRow, 
} from '../../../../api/services/monitorService';
import { PAYMENT_TONE, inr, when } from '../../utils';
import { Box } from '../../../common/atoms/Box';
import { TableBody, TableHead } from '../../../common/atoms/PlainTable';

export const BachelorTable: React.FC<{ rows: MonitorRow[] }> = ({ rows }) => (
  <Box className="overflow-x-auto">
    <Table>
      <TableHead>
        <Tr>
          <Th>Property</Th><Th>Guest</Th><Th>Request</Th>
          <Th>Visit fee</Th><Th className="text-right">Amount</Th><Th>Visit slot</Th>
        </Tr>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <Box className="font-medium text-ink-1">{row.propertyName}</Box>
              <Box className="text-xs text-ink-3">{row.place} · {row.ownerName}</Box>
            </Td>
            <Td>
              <Box className="text-ink-1">{row.guestName || '—'}</Box>
              <Box className="text-xs text-ink-3">{row.guestPhone}</Box>
            </Td>
            <Td>
              <Badge tone={row.ownerAccepted ? 'good' : row.requestStatus === 'pending_owner' ? 'warn' : 'neutral'}>
                {row.requestStatus}
              </Badge>
              <Box className="mt-1 text-[11px] text-ink-3">{when(row.requestedAt)}</Box>
            </Td>
            <Td>
              <Badge tone={PAYMENT_TONE[row.paymentStatus ?? 'not_required'] ?? 'neutral'}>
                {row.paymentStatus}
              </Badge>
              {row.paymentMode === 'dev' && (
                <Box className="mt-1 text-[11px] font-semibold text-warn">dev bypass</Box>
              )}
            </Td>
            {/* The whole fee is ours, so there is no split to show — and
                deliberately no percentage field on this tab. */}
            <Td className="text-right font-semibold text-ink-1">{inr(row.amount)}</Td>
            <Td>
              <Box className="text-xs text-ink-2">{row.visitStatus}</Box>
              {row.visitDate && <Box className="text-[11px] text-ink-3">{row.visitDate} {row.visitTime}</Box>}
            </Td>
          </Tr>
        ))}
      </TableBody>
    </Table>
  </Box>
);

/* ------------------------------------------------------------------ *
 * PG / Hostel and Co-living — no platform money, an offline commission
 * ------------------------------------------------------------------ */
