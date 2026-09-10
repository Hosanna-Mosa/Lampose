import React from 'react';
import {
  AlertTriangle, BadgeIndianRupee, 
} from 'lucide-react';

import { Badge } from '../../../common/atoms/Badge';
import { Button } from '../../../common/atoms/Button';
import { Table, Td, Th, Tr } from '../../../common/atoms/Table';
import {
  type MonitorRow, type Settlement,
} from '../../../../api/services/monitorService';
import { PAYMENT_TONE, SETTLEMENT_TONE, day, inr, when } from '../../utils';
import { PercentField } from '../../molecules/PercentField';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';
import { TableBody, TableHead } from '../../../common/atoms/PlainTable';

export const HotelTable: React.FC<{
  rows: MonitorRow[];
  busyId: string;
  canEditCommission: boolean;
  canWithdraw: boolean;
  onCommission: (id: string, percent: number) => void;
  onWithdraw: (settlement: Settlement, propertyName: string) => void;
}> = ({ rows, busyId, canEditCommission, canWithdraw, onCommission, onWithdraw }) => (
  <Box className="overflow-x-auto">
    <Table>
      <TableHead>
        <Tr>
          <Th>Booking</Th>
          <Th>Guest</Th>
          <Th>Stay</Th>
          <Th>Payment</Th>
          {/* The four money columns, side by side, as asked. */}
          <Th className="text-right">Total</Th>
          <Th className="text-right">Our %</Th>
          <Th className="text-right">Our share</Th>
          <Th className="text-right">Owner share</Th>
          <Th>Payout</Th>
          <Th />
        </Tr>
      </TableHead>
      <TableBody>
        {rows.map((row) => {
          const s = row.settlement;
          return (
            <Tr key={row.id}>
              <Td>
                <Box className="font-medium text-ink-1">{row.propertyName}</Box>
                <Box className="text-xs text-ink-3">{row.place}</Box>
                <Box className="text-xs text-ink-3">{row.ownerName}</Box>
              </Td>
              <Td>
                <Box className="text-ink-1">{row.guestName || '—'}</Box>
                <Box className="text-xs text-ink-3">{row.guestPhone}</Box>
              </Td>
              <Td>
                <Box className="text-xs text-ink-2">{day(row.checkInDate)} → {day(row.checkOutDate)}</Box>
                {row.nights ? <Box className="text-xs text-ink-3">{row.nights} {row.nightsUnit}</Box> : null}
                <Box className="text-xs text-ink-3">{row.bookingStatus ?? row.requestStatus}</Box>
              </Td>
              <Td>
                <Badge tone={PAYMENT_TONE[row.paymentStatus ?? 'not_required'] ?? 'neutral'}>
                  {row.paymentStatus}
                </Badge>
                {row.paymentMode === 'dev' && (
                  <Box className="mt-1 text-[11px] font-semibold text-warn">dev bypass — no money</Box>
                )}
                <Box className="mt-1 text-[11px] text-ink-3">{when(row.paidAt)}</Box>
              </Td>

              {/* A paid booking with no settlement row is a FAULT, not a free
                  stay. It reads as one rather than as zeroes. */}
              {!s ? (
                <Td colSpan={5}>
                  <Box className="flex items-center gap-2 text-sm text-ink-3">
                    <AlertTriangle className="h-4 w-4 text-warn" />
                    {row.paymentStatus === 'paid'
                      ? 'Paid, but no settlement was written — this needs looking at.'
                      : 'No settlement yet — the guest has not paid.'}
                  </Box>
                </Td>
              ) : (
                <>
                  <Td className="text-right font-semibold text-ink-1">{inr(s.totalAmount)}</Td>
                  <Td className="text-right">
                    <PercentField
                      settlement={s}
                      disabled={!canEditCommission || !s.canEditCommission || busyId === s.id}
                      onCommit={(percent) => onCommission(s.id, percent)}
                    />
                  </Td>
                  <Td className="text-right text-accent">{inr(s.ourShare)}</Td>
                  <Td className="text-right font-semibold text-ink-1">{inr(s.ownerShare)}</Td>
                  <Td>
                    <Badge tone={SETTLEMENT_TONE[s.status].tone}>{SETTLEMENT_TONE[s.status].label}</Badge>
                    {s.failureReason && (
                      <Box className="mt-1 max-w-[220px] text-[11px] text-crit">{s.failureReason}</Box>
                    )}
                    {s.settledAt && <Box className="mt-1 text-[11px] text-ink-3">{when(s.settledAt)}</Box>}

                    {/*
                      RazorpayX's own word for the payout, beside ours.

                      They answer different questions and both matter: our
                      status is what Lampose has decided, `payoutStatus` is
                      what the bank rail is doing. A settlement sitting in
                      "Releasing…" for an hour is a queued payout waiting on
                      balance, and only this line can say so.
                    */}
                    {s.payoutStatus && s.status === 'withdrawing' && (
                      <Box className="mt-1 text-[11px] text-ink-3">
                        RazorpayX: {s.payoutStatus}
                      </Box>
                    )}
                    {s.payoutId && (
                      <Box className="mt-1 font-mono text-[11px] text-ink-3">{s.payoutId}</Box>
                    )}
                    {/* The bank's own reference, which is what a hotel is
                        asked for when they ring their branch. */}
                    {s.utr && (
                      <Box className="mt-1 font-mono text-[11px] text-ink-3">UTR {s.utr}</Box>
                    )}
                    {/* Historical Route rows keep their transfer id so an old
                        settlement can still be traced. */}
                    {s.provider === 'route' && s.transferId && (
                      <Box className="mt-1 font-mono text-[11px] text-ink-3">
                        Route transfer {s.transferId}
                      </Box>
                    )}
                  </Td>
                  <Td>
                    {s.canWithdraw && canWithdraw ? (
                      <Button
                        variant="primary"
                        icon={BadgeIndianRupee}
                        disabled={busyId === s.id}
                        onClick={() => onWithdraw(s, row.propertyName)}
                      >
                        {busyId === s.id ? 'Releasing…' : 'Withdraw'}
                      </Button>
                    ) : s.canWithdraw && !canWithdraw ? (
                      <Inline className="text-xs text-ink-3">Super Admin only</Inline>
                    ) : null}
                  </Td>
                </>
              )}
            </Tr>
          );
        })}
      </TableBody>
    </Table>
  </Box>
);
