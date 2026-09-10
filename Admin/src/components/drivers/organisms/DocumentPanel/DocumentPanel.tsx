import React from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  XCircle,
} from 'lucide-react';
import { Badge } from '../../../common/atoms/Badge';
import { Button } from '../../../common/atoms/Button';
import { Textarea } from '../../../common/atoms/Textarea';
import { cx } from '../../../common/utils';
import type {
  DriverDocument,
} from '../../../../api/types';
import { DOC_LABEL, DOC_TONE, day } from '../../utils';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';
import { Link } from '../../../common/atoms/Link';
import { Text } from '../../../common/atoms/Text';

/**
 * One document: the scans, the number, the verdict, and the two buttons.
 *
 * The scans open in a new tab rather than rendering inline. A licence has to be
 * READ — a number, an expiry, a photograph compared against a face — and a
 * 200px thumbnail in a dialog is exactly the size at which an approver stops
 * checking and starts approving.
 */
export const DocumentPanel: React.FC<{
  doc: DriverDocument;
  canDecide: boolean;
  busy: boolean;
  note: string;
  onNote: (value: string) => void;
  onDecide: (verdict: 'verified' | 'rejected') => void;
}> = ({ doc, canDecide, busy, note, onNote, onDecide }) => {
  const sent = doc.status !== 'missing';

  return (
    <Box
      className={cx(
        'rounded-control border p-3',
        doc.status === 'rejected' ? 'border-crit-border bg-crit-soft' : 'border-line bg-surface-subtle'
      )}
    >
      <Box className="flex flex-wrap items-start justify-between gap-2">
        <Box className="min-w-0">
          <Text className="text-body font-medium text-ink">
            {doc.label}
            {!doc.required && <Inline className="text-label text-ink-3 font-normal"> · optional</Inline>}
          </Text>
          <Text className="text-label text-ink-3 font-mono tabular">
            {doc.number || 'no number given'}
            {doc.submittedAt ? ` · sent ${day(doc.submittedAt)}` : ''}
            {doc.reviewedAt ? ` · reviewed ${day(doc.reviewedAt)}` : ''}
          </Text>
        </Box>
        <Badge tone={DOC_TONE[doc.status]}>{DOC_LABEL[doc.status]}</Badge>
      </Box>

      {!!doc.reason && (
        <Text className="text-label text-crit mt-2">Told the rider: “{doc.reason}”</Text>
      )}

      {sent && (
        <Box className="flex flex-wrap gap-2 mt-2.5">
          {(['frontUrl', 'backUrl'] as const).map((side) =>
            doc[side] ? (
              <Link
                key={side}
                href={doc[side]}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-control border border-line bg-surface text-body text-ink-2 hover:bg-surface-inset"
              >
                <Eye className="size-3.5" />
                {side === 'frontUrl' ? 'Front' : 'Back'}
                <ExternalLink className="size-3 text-ink-3" />
              </Link>
            ) : null
          )}
          {!doc.backUrl && (
            <Inline className="inline-flex items-center h-8 px-2.5 text-label text-ink-3">
              No reverse side sent
            </Inline>
          )}
        </Box>
      )}

      {canDecide && sent && (
        <Box className="mt-3 space-y-2">
          <Textarea
            rows={1}
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Why it is being sent back — required to reject"
          />
          <Box className="flex flex-wrap justify-end gap-2">
            <Button
              variant="danger"
              icon={XCircle}
              onClick={() => onDecide('rejected')}
              disabled={busy || doc.status === 'rejected'}
            >
              Send back
            </Button>
            <Button
              icon={CheckCircle2}
              onClick={() => onDecide('verified')}
              disabled={busy || doc.status === 'verified'}
            >
              Verify
            </Button>
          </Box>
        </Box>
      )}

      {!sent && (
        <Text className="text-label text-ink-3 mt-2">
          The rider has not sent this yet. Nothing to review.
        </Text>
      )}
    </Box>
  );
};
