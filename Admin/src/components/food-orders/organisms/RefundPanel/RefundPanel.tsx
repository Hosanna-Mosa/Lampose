import React from 'react';
import {
  CheckCircle2,
  HandCoins,
  History,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Undo2,
} from 'lucide-react';

import { Button } from '../../../common/atoms/Button';
import { Input } from '../../../common/atoms/Input';
import { Textarea } from '../../../common/atoms/Textarea';
import { Field } from '../../../common/molecules/Field';
import { cx } from '../../../common/utils';
import { rupeesFromPaise } from '../../../../lib/format';
import type {
  FoodOrderDetail,
} from '../../../../api/types';
import { Section } from '../../../common/molecules/Section';
import { canRecordByHand, isClosed, when } from '../../utils';
import type { RefundAttempt } from '../../utils';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';
import { Text } from '../../../common/atoms/Text';

/**
 * The refund, and the record of a refund that happened elsewhere.
 *
 * Kept in one component so the two can never drift apart visually — they are
 * adjacent, they end in the same state, and the whole risk is somebody
 * pressing the wrong one. The red frame and the plain frame are the difference.
 */
export const RefundPanel: React.FC<{
  order: FoodOrderDetail;
  canRefund: boolean;
  /**
   * Everything known about this order's refund, or undefined when nothing has
   * been tried. Replaces the `busy` + `notice` pair this took before: those two
   * could not express the outcome that matters most — nothing came back, so the
   * money may or may not have moved — and the panel had no way to tell a
   * finished refund from an unanswered one.
   */
  attempt?: RefundAttempt;
  reason: string;
  onReason: (value: string) => void;
  confirming: boolean;
  onAsk: () => void;
  onCancelAsk: () => void;
  onSend: () => void;
  /** Load the order again, for an outcome nothing came back from. */
  onRecheck: () => void;
  /** Put the refund control back, having read the payment. Sends nothing. */
  onArmAgain: () => void;
  settleOpen: boolean;
  onSettleOpen: (value: boolean) => void;
  reference: string;
  onReference: (value: string) => void;
  settleNote: string;
  onSettleNote: (value: string) => void;
  onSettle: () => void;
}> = ({
  order,
  canRefund,
  attempt,
  reason,
  onReason,
  confirming,
  onAsk,
  onCancelAsk,
  onSend,
  onRecheck,
  onArmAgain,
  settleOpen,
  onSettleOpen,
  reference,
  onReference,
  settleNote,
  onSettleNote,
  onSettle,
}) => {
  const diner = order.customer.name || 'the diner';
  const settled = order.payment.refund.state === 'settled';

  /* All of it derived from the one record the page keeps per order, so the
     controls on screen and the state the page is latching on cannot disagree. */
  const busy = attempt?.sending ?? false;
  const notice = attempt?.notice ?? null;
  /* Nothing more will be SENT from here. Not the same question as whether it
     can still be written down by hand, which is why there are two tests. */
  const closed = isClosed(attempt);
  const mayRecord = canRecordByHand(attempt);
  /* Nothing came back. The money may have gone and may not have, so the only
     honest moves are to look again and — afterwards, deliberately — to put the
     control back. Never a plain retry. */
  const unknown = attempt?.outcome === 'unknown';

  /*
   * A banner ABOVE whatever controls are left, never instead of them.
   *
   * This used to return early and render the notice alone, which broke the one
   * rule the warning depends on: the `recorded: false` warning ends "record it
   * against the order by hand", and hiding the control that does exactly that
   * turns the warning into an accusation. The page opens that form and fills in
   * the gateway's reference at the same moment this text arrives.
   */
  const banner = notice ? (
    <Box
      className={cx(
        'rounded-control border p-3 mb-3',
        notice.tone === 'good' && 'border-good-border bg-good-soft',
        notice.tone === 'warn' && 'border-warn-border bg-warn-soft',
        notice.tone === 'crit' && 'border-crit-border bg-crit-soft'
      )}
    >
      <Text className="text-body text-ink break-words">{notice.text}</Text>
      {notice.tone === 'warn' && (
        <Text className="text-label text-ink-2 mt-1.5">
          Do not send this again. Write the reference against the order by hand — the money
          has already left.
        </Text>
      )}
    </Box>
  ) : null;

  if (settled) {
    /* The record itself is drawn above, in Payment. Repeating it here would
       give the same fact two homes; saying there is nothing to do is useful. */
    return (
      <Section title="Refund">
        {banner}
        <Text className="text-body text-ink-3">
          This one is settled. Nothing is owed and there is nothing to send.
        </Text>
      </Section>
    );
  }

  if (!canRefund) {
    return (
      <Section title="Refund">
        {banner}
        <Text className="text-body text-ink-3 flex items-start gap-2">
          <ShieldCheck className="size-4 shrink-0 mt-0.5" aria-hidden />
          {order.payment.refundable
            ? 'This order is owed a refund. Sending it needs the Admin or Super Admin role — '
              + 'reading it does not.'
            : order.payment.refundBlockedReason
              || 'There is nothing to send back on this order.'}
        </Text>
      </Section>
    );
  }

  if (!order.payment.refundable) {
    return (
      <Section title="Refund">
        {banner}
        {/* The server's own sentence, verbatim. It knows which of the four
            reasons applies and this page does not re-derive it. */}
        <Text className="text-body text-ink-3">
          {order.payment.refundBlockedReason || 'There is nothing to send back on this order.'}
        </Text>
      </Section>
    );
  }

  return (
    <Section title="Refund">
      {banner}

      {/* Gone for the rest of the visit once anything has come back — a second
          press is the one move that can send the money twice. */}
      {!closed && (
      <Box className="rounded-control border border-crit-border bg-crit-soft p-3">
        {confirming ? (
          <>
            <Text className="text-body font-medium text-ink">Send this payment back to {diner}?</Text>
            <Box className="text-body text-ink-2 mt-1.5 space-y-1">
              {order.payment.amountPaise > 0 ? (
                <Text>
                  Razorpay recorded taking{' '}
                  <Inline className="tabular font-medium text-ink">
                    {rupeesFromPaise(order.payment.amountPaise)}
                  </Inline>{' '}
                  for {order.orderNumber}
                  {order.payment.paidAt ? ` on ${when(order.payment.paidAt)}` : ''}.
                </Text>
              ) : (
                <Text>Nothing on this order says what the gateway took, only that it was paid.</Text>
              )}
              {/* No figure of ours goes here. The gateway refunds the whole
                  captured payment and reports the real number back. */}
              <Text>
                The whole of that payment goes back. Razorpay decides the exact amount and tells
                us afterwards — there is no way to send part of it, and no figure here is ours.
              </Text>
              <Text>It cannot be undone from this console.</Text>
              {!!reason.trim() && (
                /* What is about to be written, shown before it is written —
                   this sentence ends up on the order's history and in
                   Razorpay's notes, and the confirm step is the last chance to
                   read it back. */
                <Text className="text-ink-3">Recorded as: “{reason.trim()}”</Text>
              )}
            </Box>
            <Box className="flex flex-wrap justify-end gap-2 mt-3">
              <Button variant="secondary" onClick={onCancelAsk} disabled={busy}>
                Cancel
              </Button>
              <Button variant="danger" icon={Undo2} onClick={onSend} loading={busy} disabled={busy}>
                {busy ? 'Sending…' : `Send it back to ${diner}`}
              </Button>
            </Box>
          </>
        ) : (
          <>
            <Text className="text-body font-medium text-ink flex items-center gap-2">
              <TriangleAlert className="size-4 text-crit shrink-0" aria-hidden />
              This order is owed a refund
            </Text>
            <Text className="text-body text-ink-2 mt-1">
              Razorpay sends the whole captured payment back to {diner}. It is one press, it is
              final, and it is recorded against your name.
            </Text>
            <Box className="mt-3">
              <Field
                label="Why"
                hint="Optional, kept to 200 characters. It goes onto the order's history and into Razorpay's own notes — it is what somebody reads six weeks from now trying to work out what this was."
              >
                <Textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => onReason(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. the kitchen was closed and the diner cancelled"
                />
              </Field>
            </Box>
            <Box className="flex justify-end mt-3">
              <Button variant="danger" icon={HandCoins} onClick={onAsk} disabled={busy}>
                Refund {diner}
              </Button>
            </Box>
          </>
        )}
      </Box>
      )}

      {/*
        Nothing came back, so neither "it worked" nor "it failed" is true.
        A plain retry here is the single most expensive mistake on the page —
        it is how a diner gets refunded twice — so the only thing offered is to
        go and look, and the control to send comes back only after somebody has.
      */}
      {unknown && (
        <Box className="mt-3 rounded-control border border-warn-border bg-warn-soft p-3">
          <Text className="text-body font-medium text-ink">
            Nobody knows yet whether this one went
          </Text>
          <Text className="text-body text-ink-2 mt-1">
            Nothing came back from the gateway. The money may have left {diner}'s payment and it
            may not have. Load the order again and read the payment before deciding anything.
          </Text>
          <Box className="flex flex-wrap justify-end gap-2 mt-3">
            <Button variant="secondary" icon={RefreshCw} onClick={onRecheck} disabled={busy}>
              Look at it again
            </Button>
            {attempt?.rechecked && (
              <Button variant="danger" icon={Undo2} onClick={onArmAgain} disabled={busy}>
                Let me send it again
              </Button>
            )}
          </Box>
          {attempt?.rechecked && (
            <Text className="text-label text-ink-3 mt-2">
              Only if the payment above still shows nothing refunded. That puts the refund control
              back — it sends nothing by itself.
            </Text>
          )}
        </Box>
      )}

      {/* A different act with the same ending, so a different frame and a
          different verb. This one moves no money; it writes down that money
          already moved, which is why the reference is not optional. It outlives
          the control above: an unrecorded refund is exactly when it is needed. */}
      {mayRecord && (
      <Box className="mt-3 rounded-control border border-line bg-surface-subtle p-3">
        {settleOpen ? (
          <>
            <Text className="text-body font-medium text-ink">Already refunded somewhere else</Text>
            <Text className="text-body text-ink-2 mt-1">
              This sends nothing. It records that the money has already gone, takes the order out
              of the queue, and tells everybody afterwards that the debt is settled — so it has to
              be true.
            </Text>
            <Box className="mt-3 space-y-3">
              <Field
                label="Reference"
                required
                hint="The Razorpay refund id, or the bank reference. Up to 64 characters. It is the only thing that will ever let anybody match this order to the money."
              >
                <Input
                  value={reference}
                  onChange={(e) => onReference(e.target.value)}
                  maxLength={64}
                  placeholder="rfnd_… or a bank reference"
                />
              </Field>
              <Field label="Note" hint="Optional, up to 80 characters — where it was done.">
                <Input
                  value={settleNote}
                  onChange={(e) => onSettleNote(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. razorpay dashboard"
                />
              </Field>
            </Box>
            <Box className="flex flex-wrap justify-end gap-2 mt-3">
              <Button variant="secondary" onClick={() => onSettleOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                icon={CheckCircle2}
                onClick={onSettle}
                loading={busy}
                disabled={busy || !reference.trim()}
              >
                Record it as refunded
              </Button>
            </Box>
          </>
        ) : (
          <Box className="flex flex-wrap items-center justify-between gap-2">
            <Text className="text-body text-ink-2">
              Somebody already refunded this in the Razorpay dashboard or by transfer?
            </Text>
            <Button variant="secondary" icon={History} onClick={() => onSettleOpen(true)}>
              Record it
            </Button>
          </Box>
        )}
      </Box>
      )}
    </Section>
  );
};
