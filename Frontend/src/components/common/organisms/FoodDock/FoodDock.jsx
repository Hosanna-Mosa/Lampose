import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../../../../food/CartProvider';
import { rupees } from '../../../../data/food';
import { Icon } from '../../atoms/Icon/Icon';
import { Inline } from '../../atoms';

/* ══ Food dock ════════════════════════════════════════════════════════════
   On a phone, Order Food lived only inside the hamburger sheet — two taps
   and a guess away, on a site where food is half of what we sell. The dock
   puts it under the thumb instead, on every page that is not already food.

   It is an extended FAB: a labelled pill while somebody is at the top or
   scrolling back up (looking for something), a round icon while they scroll
   down (reading), so it never sits on the content being read. It steps out
   of the way of the footer, whose links it would otherwise cover.

   A cart with food in it turns the dock into the way back to that cart —
   off the food routes the bar shows Explore Stays, so this is the only
   thing on screen that remembers it. A live order is the bar's job, so the
   dock bows out rather than say it twice.

   Desktop never sees it: the bar's own Order Food link is visible there.
   ════════════════════════════════════════════════════════════════════════ */

const HIDDEN_ON = ['/food', '/food-partner'];

export function FoodDock() {
  const { pathname } = useLocation();
  const { bill, orders } = useCart();
  const [compact, setCompact] = useState(false);
  const [overFooter, setOverFooter] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      // A few pixels of jitter is not a change of direction.
      if (Math.abs(dy) < 8) return;
      setCompact(dy > 0 && y > 120);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Each route mounts the footer afresh, so look for it again on every one.
  useEffect(() => {
    setCompact(false);
    setOverFooter(false);
    const footer = document.querySelector('footer');
    if (!footer || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setOverFooter(entry.isIntersecting));
    io.observe(footer);
    return () => io.disconnect();
  }, [pathname]);

  const offRoute = HIDDEN_ON.some(r => pathname === r || pathname.startsWith(`${r}/`) || pathname.startsWith(`${r}-`));
  const live = orders.some(order => order.live);
  if (offRoute || live) return null;

  const hasCart = bill.count > 0;
  const label = hasCart
    ? `${bill.count} item${bill.count === 1 ? '' : 's'} · ${rupees(bill.toPay)}`
    : 'Order Food';

  return (
    <Link
      to={hasCart ? '/food/cart' : '/food'}
      className={[
        'food-dock',
        compact && 'food-dock--compact',
        overFooter && 'food-dock--away',
        hasCart && 'food-dock--cart',
      ].filter(Boolean).join(' ')}
      aria-label={hasCart ? `View cart, ${label}` : 'Order food'}
    >
      <Inline className="food-dock__ico-wrap" aria-hidden="true">
        <Icon name={hasCart ? 'cart' : 'food'} className="food-dock__ico" />
        {hasCart && <Inline className="food-dock__badge">{bill.count}</Inline>}
      </Inline>
      <Inline className="food-dock__text">
        {!hasCart && <Inline className="food-dock__kicker">Hungry?</Inline>}
        <Inline className="food-dock__label">{label}</Inline>
      </Inline>
      <Inline className="food-dock__arrow" aria-hidden="true">→</Inline>
    </Link>
  );
}
