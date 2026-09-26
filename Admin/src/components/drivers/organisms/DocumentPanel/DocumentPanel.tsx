import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  XCircle,
} from 'lucide-react';
import { Image } from '../../../common/atoms/Image';
import { PlainButton } from '../../../common/atoms/PlainButton';
import { DocumentViewer, type ViewerSide } from '../DocumentViewer';
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
import { Text } from '../../../common/atoms/Text';

/**
 * The reasons an approver reaches for most, one tap each. A tap fills the
 * reason box and the approver can still edit it — the rider is shown this
 * sentence word for word, on WhatsApp, as a push and in the app.
 */
const QUICK_REASONS = [
  'Photo is blurry',
  'Text is not readable',
  'Edges are cut off',
  'Glare or reflection on the card',
  'Wrong document uploaded',
  'Document has expired',
  'Name does not match your profile',
  'Back side is missing',
];

/**
 * One document: the scans, the number, the verdict, and the two buttons.
 *
 * The scans show as thumbnails so an approver can see at a glance that
 * something was sent — but a licence has to be READ (a number, an expiry, a
 * photograph compared against a face), and a thumbnail is exactly the size at
 * which an approver stops checking and starts approving. So a thumbnail is
 * only a way in: clicking it opens `DocumentViewer`, full screen, with zoom
 * and rotate.
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
  const [viewing, setViewing] = useState<number | null>(null);

  const sides: ViewerSide[] = [
    ...(doc.frontUrl ? [{ label: 'Front', url: doc.frontUrl }] : []),
    ...(doc.backUrl ? [{ label: 'Back', url: doc.backUrl }] : []),
  ];

  /* A second reason is added to the first rather than replacing it — "Photo is
     blurry. Back side is missing." is one message, not two. */
  const addReason = (reason: string) => {
    const current = note.trim();
    if (current.toLowerCase().includes(reason.toLowerCase())) return;
    onNote(current ? `${current.replace(/[.\s]*$/, '')}. ${reason}` : reason);
  };

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
        <Box className="flex flex-wrap gap-3 mt-2.5">
          {sides.map((side, i) => (
            <PlainButton
              key={side.label}
              onClick={() => setViewing(i)}
              className="group relative w-40 h-28 overflow-hidden rounded-control border border-line bg-surface hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
              aria-label={`View the ${side.label.toLowerCase()} of the ${doc.label.toLowerCase()} full size`}
            >
              <Image
                src={side.url}
                alt={`${doc.label}, ${side.label.toLowerCase()}`}
                loading="lazy"
                className="size-full object-cover"
              />
              <Inline className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 px-2 py-1 bg-black/55 text-label text-white">
                {side.label}
                <Eye className="size-3.5 opacity-80 group-hover:opacity-100" />
              </Inline>
            </PlainButton>
          ))}
          {!doc.backUrl && (
            <Inline className="inline-flex items-center h-28 px-2.5 text-label text-ink-3">
              No reverse side sent
            </Inline>
          )}
        </Box>
      )}

      {viewing !== null && sides.length > 0 && (
        <DocumentViewer
          title={doc.label}
          number={doc.number}
          sides={sides}
          initial={viewing}
          onClose={() => setViewing(null)}
        />
      )}

      {canDecide && sent && (
        <Box className="mt-3 space-y-2">
          {/* One tap fills the reason; a second adds to it. Still editable. */}
          <Box className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((reason) => (
              <PlainButton
                key={reason}
                onClick={() => addReason(reason)}
                className="h-7 px-2.5 rounded-full border border-line bg-surface text-label text-ink-2 hover:bg-surface-inset hover:text-ink"
              >
                {reason}
              </PlainButton>
            ))}
          </Box>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Why it is being sent back — required to reject. The rider reads this on WhatsApp and in the app."
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
