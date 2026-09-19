import React from 'react';
import { Link } from 'react-router-dom';
import { Box, Inline } from '../../../common/atoms';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { useCart } from '../../../../food/CartProvider';
import { readyLabel, rupees } from '../../../../data/food';

/* ══ Docked cart ══════════════════════════════════════════════════════════
   The bar along the bottom of the feed and the menu: what is in the cart and
   the one way onward.

   It draws nothing when the cart is empty rather than sitting there saying
   "0 items" — a bar that is always present stops being read, and the empty
   cart has a page of its own that can actually help.

   `className` is how the kitchen page asks for `fd-dock--narrow`: that page
   already shows the cart in a panel beside the menu at desktop widths, and a
   second copy of it floating over the dish rows is both redundant and in the
   way of the ADD button underneath.
   ════════════════════════════════════════════════════════════════════════ */

export function DockedCart({ to = '/food/cart', label = 'View cart', className = '' }) {
  const { lines, bill, kitchen } = useCart();
  if (!lines.length || !kitchen) return null;

  return (
    <Box className={`fd-dock ${className}`.trim()}>
      <Inline className="fd-dock__badge"><Icon name="cart" className="fd-ico" /></Inline>

      <Box className="fd-dock__text">
        <Inline className="fd-dock__title">
          {bill.count} item{bill.count === 1 ? '' : 's'} from {kitchen.name}
        </Inline>
        <Inline className="fd-dock__sub">
          {rupees(bill.itemTotal)} · {kitchen.deliveryFee ? `${rupees(kitchen.deliveryFee)} delivery` : 'free delivery'} · ready about {readyLabel(kitchen.prepMinutes)}
        </Inline>
      </Box>

      <Link to={to} className="fd-btn fd-btn--light fd-dock__cta">
        {label}
        <Icon name="arrowR" className="fd-ico" />
      </Link>
    </Box>
  );
}
