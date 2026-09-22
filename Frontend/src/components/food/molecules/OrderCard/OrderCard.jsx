import React from 'react';
import { Link } from 'react-router-dom';
import { Article, Box, Heading, Inline, PlainButton, Text } from '../../../common/atoms';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { PhotoTile } from '../../atoms/PhotoTile';
import { rupees } from '../../../../data/food';
import { useFoodCatalogue } from '../../../../food/FoodCatalogue';

/* ══ Order card ═══════════════════════════════════════════════════════════
   One past order in the history.

   `rejected` and `cancelled` are two different events and the diner is owed
   the difference: a cancellation is something they did, a rejection is the
   KITCHEN turning the order down, with a reason of its own that this card
   prints. Folding the first into the second tells a student they called off
   a dinner the restaurant refused.
   ════════════════════════════════════════════════════════════════════════ */

const CHIP = {
  delivered: 'fd-chip--good',
  pickedUp: 'fd-chip--neutral',
  rejected: 'fd-chip--bad',
  cancelled: 'fd-chip--neutral',
};

export function OrderCard({ order, onReorder }) {
  /* From the catalogue, not a fixture. Null while the feed is loading or when
     the kitchen has since left — the card already copes with a missing one,
     because `order.kitchenName` is stored on the order itself. */
  const { kitchenById } = useFoodCatalogue();
  const kitchen = kitchenById(order.kitchenId);
  const summary = order.lines.map(l => `${l.name} ×${l.qty}`).join(', ');

  const trail = [
    order.placedLabel,
    order.reference,
    order.fulfilment === 'pickup'
      ? `collected at the counter with code ${order.pickupCode}`
      : order.addressTitle && `delivered to ${order.addressTitle}`,
    order.paymentLabel,
  ].filter(Boolean).join(' · ');

  return (
    <Article className="fd-order reveal">
      <PhotoTile tone={kitchen?.tone || 'stone'} src={kitchen?.logoUrl || kitchen?.coverUrl} alt={order.kitchenName} width={160} className="fd-order__thumb" />

      <Box className="fd-order__text">
        <Box className="fd-order__head">
          <Heading level={3} className="fd-order__name">{order.kitchenName}</Heading>
          <Inline className={`fd-chip ${CHIP[order.status] || 'fd-chip--neutral'}`}>
            {order.statusLabel}
          </Inline>
        </Box>

        <Text className="fd-order__lines">{summary}</Text>
        <Text className="fd-order__trail">{trail}</Text>

        {order.rejectionReason && (
          <Box className="fd-callout fd-callout--bad">
            <Icon name="info" className="fd-ico" />
            <Text>
              The kitchen turned this down: “{order.rejectionReason}”
              {order.refund && ` Your ${rupees(order.refund.amount)} went back to ${order.refund.destination} on ${order.refund.creditedLabel}.`}
            </Text>
          </Box>
        )}

        {order.cancelNote && !order.rejectionReason && (
          <Text className="fd-order__trail">{order.cancelNote}</Text>
        )}
      </Box>

      <Box className="fd-order__side">
        <Inline className={`fd-order__amount${order.paid ? '' : ' is-nil'}`}>{rupees(order.paid)}</Inline>

        {order.refund && <Inline className="fd-chip fd-chip--good">REFUNDED</Inline>}

        <Box className="fd-order__actions">
          {/* "Receipt" was the label, and it is the one word this button never
              meant: it opens the order — its status, its lines, what was paid —
              and there is no receipt to hand anybody. Named for where it
              goes. */}
          {order.status !== 'cancelled' && (
            <Link to={`/food/orders/${order.reference}`} className="fd-btn fd-btn--ghost fd-btn--sm">
              View order
            </Link>
          )}
          <PlainButton type="button" className="fd-btn fd-btn--dark fd-btn--sm" onClick={onReorder}>
            {order.status === 'cancelled' ? 'Order again' : 'Reorder'}
          </PlainButton>
        </Box>

        {order.status === 'delivered' && (
          <Inline className="fd-order__hint">Reorder rebuilds at today’s prices</Inline>
        )}
      </Box>
    </Article>
  );
}
