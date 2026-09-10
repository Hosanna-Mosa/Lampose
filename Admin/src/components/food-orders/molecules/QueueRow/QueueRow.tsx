import React from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Timer,
  Truck,
  Undo2,
} from 'lucide-react';

import { Badge } from '../../../common/atoms/Badge';
import { Button } from '../../../common/atoms/Button';
import { Td, Tr } from '../../../common/atoms/Table';
import { formatDateTime, relativeTime } from '../../../../lib/format';
import type {
  FoodOrderRow,
} from '../../../../api/types';
import { PAYMENT_META, PAYMENT_MODE_LABEL, STATUS_META, dash, elapsed, money } from '../../utils';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';
import { Text } from '../../../common/atoms/Text';

/** One row of the queue: enough to triage without opening it. */
export const QueueRow: React.FC<{ row: FoodOrderRow; onOpen: () => void }> = ({ row, onOpen }) => (
  <Tr>
    <Td>
      <Text className="font-mono tabular font-medium text-ink">{row.orderNumber}</Text>
      <Box className="flex flex-wrap items-center gap-1 mt-1">
        {row.flags.refundOwed && (
          <Badge tone="crit" icon={Undo2}>
            Refund owed
          </Badge>
        )}
        {row.flags.dispatchFailed && (
          <Badge tone="crit" icon={Truck}>
            No rider
          </Badge>
        )}
        {row.flags.stuck && (
          <Badge tone="warn" icon={Timer}>
            Stuck {elapsed(row.ageMinutes)}
          </Badge>
        )}
        {row.refund.state === 'settled' && (
          <Badge tone="good" icon={CheckCircle2}>
            Refunded
          </Badge>
        )}
      </Box>
    </Td>
    <Td>
      {/* The id when nothing was ever written down, never an invented name. */}
      {row.restaurantName ? (
        <>
          <Text className="text-ink">{row.restaurantName}</Text>
          <Text className="text-label text-ink-3 font-mono">{row.restaurantId}</Text>
        </>
      ) : (
        <Text className="text-ink font-mono">{row.restaurantId}</Text>
      )}
    </Td>
    <Td>
      <Text className="text-ink">{row.customerName || 'Unnamed'}</Text>
      <Text className="text-label text-ink-3 font-mono tabular">{dash(row.customerPhone)}</Text>
    </Td>
    <Td className="text-right">
      <Inline className="tabular text-ink">{money(row.grandTotal)}</Inline>
    </Td>
    <Td>
      <Badge tone={STATUS_META[row.status].tone} icon={STATUS_META[row.status].icon}>
        {STATUS_META[row.status].label}
      </Badge>
    </Td>
    <Td>
      <Badge tone={PAYMENT_META[row.paymentStatus].tone}>
        {PAYMENT_META[row.paymentStatus].label}
      </Badge>
      <Text className="text-label text-ink-3 mt-0.5">{PAYMENT_MODE_LABEL[row.paymentMode]}</Text>
    </Td>
    <Td>
      <Inline className="text-label text-ink-2" title={formatDateTime(row.placedAt)}>
        {relativeTime(row.placedAt)}
      </Inline>
    </Td>
    <Td className="text-right">
      <Button variant="ghost" icon={ChevronRight} onClick={onOpen}>
        Open
      </Button>
    </Td>
  </Tr>
);
