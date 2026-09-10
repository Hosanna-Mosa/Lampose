import React from 'react';
import {
  ShieldAlert,
} from 'lucide-react';

import { Badge } from '../../../common/atoms/Badge';
import { cx } from '../../../common/utils';
import {
  type SupportRow,
} from '../../../../api/services/supportService';
import { AUDIENCE_ICON, AUDIENCE_LABEL, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE, clockTime, since } from '../../utils';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';
import { PlainButton } from '../../../common/atoms/PlainButton';
import { Text } from '../../../common/atoms/Text';

interface RowProps {
  row: SupportRow;
  active: boolean;
  onOpen: () => void;
}

export const QueueRow: React.FC<RowProps> = ({ row, active, onOpen }) => {
  const Icon = AUDIENCE_ICON[row.requester.kind];
  const isReport = row.kind === 'report';

  return (
    <PlainButton
      type="button"
      onClick={onOpen}
      className={cx(
        'w-full text-left px-4 py-3 border-b border-line transition-colors',
        active
          ? 'bg-surface-inset'
          : 'hover:bg-surface-subtle',
      )}
    >
      <Box className="flex items-start gap-3">
        {/*
          The unread dot marks something the REQUESTER said that nobody here
          has read — not any activity. A dot that lit up for our own replies
          would be a dot that is always on, which is a dot nobody looks at.
        */}
        <Inline
          className={cx(
            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
            row.unread ? 'bg-brand' : 'bg-transparent',
          )}
          aria-hidden
        />

        <Box className="min-w-0 flex-1">
          <Box className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />
            <Inline className="truncate text-body font-medium text-ink">
              {row.requester.name}
            </Inline>
            {isReport && (
              /* A safety report is not a ticket with a label. It is a
                 different queue with a different promise to the person who
                 filed it, and it must be impossible to mistake in a list. */
              <Badge tone="crit" icon={ShieldAlert}>Report</Badge>
            )}
            {row.priority !== 'normal' && row.priority !== 'low' && (
              <Badge tone={PRIORITY_TONE[row.priority]}>{row.priority}</Badge>
            )}
          </Box>

          <Text className="mt-0.5 truncate text-body text-ink-2">
            {row.subject}
          </Text>

          <Box className="mt-1 flex items-center gap-2 text-micro text-ink-3">
            <Inline className="font-mono">{row.reference}</Inline>
            <Inline aria-hidden>·</Inline>
            <Inline>{AUDIENCE_LABEL[row.requester.kind]}</Inline>
            <Inline aria-hidden>·</Inline>
            <Inline title={clockTime(row.lastActivityAt)}>{since(row.lastActivityAt)}</Inline>
            {row.assignedToName && (
              <>
                <Inline aria-hidden>·</Inline>
                <Inline className="truncate">{row.assignedToName}</Inline>
              </>
            )}
          </Box>
        </Box>

        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
      </Box>
    </PlainButton>
  );
};

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */
