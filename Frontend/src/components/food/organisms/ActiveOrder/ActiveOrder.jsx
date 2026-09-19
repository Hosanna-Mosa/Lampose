import React from 'react';
import { Link } from 'react-router-dom';
import { Box, Inline } from '../../../common/atoms';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { useCart } from '../../../../food/CartProvider';

/* ══ Active order ═════════════════════════════════════════════════════════
   An order that is being cooked does not stop existing because the diner
   went back to the feed.

   Placing one used to be the last time you saw it unless you thought to open
   My orders: the cart emptied, the docked bar went with it, and the food was
   on its way with nothing on screen saying so. This is the thing that says
   so — on every food page, carrying the one fact that matters while you wait
   (when it arrives) and the one action (open the tracking page).

   `exclude` is the reference of the order the current page is already about,
   so the tracking screen does not announce the order you are looking at —
   while still announcing a SECOND one, which is exactly when you would
   otherwise lose it.
   ════════════════════════════════════════════════════════════════════════ */

export function ActiveOrder({ exclude = null }) {
  const { orders } = useCart();

  const live = orders.filter(order => order.live && order.reference !== exclude);
  if (!live.length) return null;

  /* The newest one leads; the rest are counted, because two bars stacked is
     two things shouting and neither being read. */
  const [order, ...rest] = live;

  const when = order.etaLabel
    ? `${order.fulfilment === 'pickup' ? 'ready by' : 'arriving by'} ${order.etaLabel}`
    : 'we will say when it is ready';

  return (
    <Box className="fd-active">
      <Inline className="fd-active__dot" aria-hidden="true" />

      <Box className="fd-active__text">
        <Inline className="fd-active__title">
          {order.statusLabel} · {order.kitchenName}
        </Inline>
        <Inline className="fd-active__meta">
          {order.reference} · {when}
          {order.rider ? ` · ${order.rider.name.split(' ')[0]} is ${order.distanceLabel} away` : ''}
        </Inline>
      </Box>

      {rest.length > 0 && (
        <Link to="/food/orders" className="fd-active__more">
          +{rest.length} more order{rest.length === 1 ? '' : 's'}
        </Link>
      )}

      <Link to={`/food/orders/${order.reference}`} className="fd-btn fd-btn--light fd-btn--sm">
        Track order
        <Icon name="arrowR" className="fd-ico" />
      </Link>
    </Box>
  );
}
