import React from 'react';
import {
  CheckCircle2, 
  Landmark, 
} from 'lucide-react';

import { Badge } from '../../../common/atoms/Badge';
import { Button } from '../../../common/atoms/Button';
import { Table, Td, Th, Tr } from '../../../common/atoms/Table';
import {
  type MonitorRow, 
} from '../../../../api/services/monitorService';
import { day, inr, when } from '../../utils';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';
import { TableBody, TableHead } from '../../../common/atoms/PlainTable';

export const FreeTable: React.FC<{
  rows: MonitorRow[];
  canEdit: boolean;
  onCollect: (row: MonitorRow) => void;
}> = ({ rows, canEdit, onCollect }) => (
  <Box className="overflow-x-auto">
    <Table>
      <TableHead>
        <Tr>
          <Th>Property</Th><Th>Guest</Th><Th>Owner answered</Th>
          <Th>Booking</Th><Th className="text-right">Listed rent</Th><Th>Our commission</Th><Th />
        </Tr>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td>
              <Box className="font-medium text-ink-1">{row.propertyName}</Box>
              <Box className="text-xs text-ink-3">{row.place}</Box>
              <Box className="text-xs text-ink-3">{row.ownerName} {row.ownerPhone}</Box>
            </Td>
            <Td>
              <Box className="text-ink-1">{row.guestName || '—'}</Box>
              <Box className="text-xs text-ink-3">{row.guestPhone}</Box>
            </Td>
            <Td>
              {/* The conversation, as separate facts — an administrator ringing
                  an owner needs to know which of the two moved. */}
              <Badge tone={row.ownerAccepted ? 'good' : row.ownerAnswered ? 'crit' : 'warn'}>
                {row.ownerAccepted ? 'Accepted' : row.ownerAnswered ? 'Declined' : 'Waiting'}
              </Badge>
              {row.declineReason && <Box className="mt-1 text-[11px] text-ink-3">{row.declineReason}</Box>}
              <Box className="mt-1 text-[11px] text-ink-3">{when(row.decidedAt ?? row.requestedAt)}</Box>
            </Td>
            <Td>
              <Box className="text-xs text-ink-2">{row.bookingStatus ?? '—'}</Box>
              <Box className="text-[11px] text-ink-3">from {day(row.checkInDate)}</Box>
            </Td>
            {/* The LISTING's rent, as the reference a commission is negotiated
                against — never presented as an agreed figure, because Lampose
                is not told what the two of them settled on. */}
            <Td className="text-right text-ink-2">{inr(row.listedRent)}</Td>
            <Td>
              {row.commissionCollected ? (
                <>
                  <Badge tone="good" icon={CheckCircle2}>{inr(row.commissionAmount)} collected</Badge>
                  <Box className="mt-1 text-[11px] text-ink-3">{when(row.commissionCollectedAt)}</Box>
                </>
              ) : row.ownerAccepted ? (
                <Badge tone="warn">Not collected</Badge>
              ) : (
                <Inline className="text-xs text-ink-3">—</Inline>
              )}
            </Td>
            <Td>
              {canEdit && row.ownerAccepted && row.bookingId && !row.commissionCollected && (
                <Button variant="ghost" icon={Landmark} onClick={() => onCollect(row)}>
                  Mark collected
                </Button>
              )}
            </Td>
          </Tr>
        ))}
      </TableBody>
    </Table>
  </Box>
);
