import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Aside, Box, Heading, Inline, PlainButton, Region, Text,
} from '../components/common/atoms';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { PhotoTile } from '../components/food/atoms/PhotoTile';
import { OrderCard } from '../components/food/molecules/OrderCard';
import { useCart } from '../food/CartProvider';
import { useReveals } from '../hooks/useSite';
import { SPEND, USUALS, dishById, kitchenById, rupees } from '../data/food';

/* ══ My orders ════════════════════════════════════════════════════════════
   Everything this diner has ordered, live one first.

   ## Three tabs, and "cancelled" is its own

   Active, past, cancelled. A refused order and a cancelled one are filed
   apart because they are different events: one is the kitchen saying no,
   with a reason and a refund; the other is the diner changing their mind.
   Folding them together tells somebody they called off a dinner the
   restaurant turned down.

   ## Reorder rebuilds at today's prices

   The receipt keeps what was charged then — that is the record. The cart it
   builds is priced from the menu as it stands now, because a cart quoting
   last month's price is quoting a number the kitchen never agreed to. A
   dish that has since left the menu is dropped and said so.
   ════════════════════════════════════════════════════════════════════════ */

const TABS = [
  { id: 'active', label: 'Active' },
  { id: 'past', label: 'Past' },
  { id: 'cancelled', label: 'Cancelled' },
];

export function FoodOrders() {
  const { orders, reorder } = useCart();
  const navigate = useNavigate();
  const [tab, setTab] = useState('active');
  const [dropped, setDropped] = useState(null);

  useReveals([tab, orders.length]);

  const buckets = useMemo(() => ({
    active: orders.filter(o => o.live),
    past: orders.filter(o => !o.live && o.status !== 'cancelled'),
    cancelled: orders.filter(o => o.status === 'cancelled'),
  }), [orders]);

  const live = buckets.active;
  const shown = tab === 'active' ? buckets.past : buckets[tab];

  /* History reads by month, so the months are taken from the rows rather
     than from a calendar — an empty month should not print a heading. */
  const months = useMemo(() => {
    const seen = [];
    shown.forEach(order => { if (!seen.includes(order.monthLabel)) seen.push(order.monthLabel); });
    return seen;
  }, [shown]);

  const again = order => {
    const result = reorder(order);
    if (!result.ok) { setDropped(order.reference); return; }
    setDropped(null);
    navigate('/food/cart');
  };

  return (
    <Region id="food">
      <Box className="sec-inner">

        <Box className="fd-pageHead">
          <Heading level={1} className="fd-h1">My food orders</Heading>
          <Box className="fd-seg" role="tablist" aria-label="Which orders">
            {TABS.map(entry => (
              <PlainButton
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={`fd-seg__btn${tab === entry.id ? ' is-on' : ''}`}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
                {entry.id === 'active' && live.length > 0 ? ` · ${live.length}` : ''}
              </PlainButton>
            ))}
          </Box>
        </Box>

        <Box className="fd-two">
          <Box className="fd-two__main">

            {/* ── the live one ──────────────────────────────────────────── */}
            {tab === 'active' && live.map(order => (
              <Link to={`/food/orders/${order.reference}`} className="fd-liveCard reveal" key={order.reference}>
                <Inline className="fd-liveCard__badge"><Icon name="delivery" className="fd-ico" /></Inline>
                <Box className="fd-liveCard__text">
                  <Inline className="fd-liveCard__state">
                    <Inline className="fd-hero__dot" aria-hidden="true" />
                    {order.statusLabel}
                  </Inline>
                  <Inline className="fd-liveCard__name">
                    {order.kitchenName} · {order.lines.length} item{order.lines.length === 1 ? '' : 's'}
                  </Inline>
                  <Inline className="fd-liveCard__meta">
                    {order.reference}
                    {order.rider ? ` · ${order.rider.name.split(' ')[0]} is ${order.distanceLabel} away` : ' · looking for a rider'}
                    {order.etaLabel ? ` · arriving by ${order.etaLabel}` : ''}
                  </Inline>
                </Box>
                <Inline className="fd-btn fd-btn--light">
                  Track order
                  <Icon name="arrowR" className="fd-ico" />
                </Inline>
              </Link>
            ))}

            {tab === 'active' && live.length === 0 && (
              <Box className="fd-empty reveal">
                <Inline className="fd-empty__mark"><Icon name="clock" className="fd-ico" /></Inline>
                <Heading level={2} className="fd-empty__title">Nothing cooking right now</Heading>
                <Text className="fd-empty__body">Your past orders are below, and reorder rebuilds any of them.</Text>
                <Link to="/food" className="fd-btn fd-btn--dark">Browse kitchens</Link>
              </Box>
            )}

            {/* ── history ───────────────────────────────────────────────── */}
            {shown.length === 0 && tab !== 'active' && (
              <Box className="fd-empty reveal">
                <Heading level={2} className="fd-empty__title">
                  {tab === 'cancelled' ? 'No cancelled orders' : 'No past orders yet'}
                </Heading>
                <Text className="fd-empty__body">
                  {tab === 'cancelled'
                    ? 'Nothing here is the good outcome.'
                    : 'Once an order is delivered or collected it is filed here with its receipt.'}
                </Text>
              </Box>
            )}

            {months.map(month => (
              <Box className="fd-month" key={month}>
                <Heading level={2} className="fd-month__title">{month}</Heading>
                {shown.filter(order => order.monthLabel === month).map(order => (
                  <Box key={order.reference}>
                    <OrderCard order={order} onReorder={() => again(order)} />
                    {dropped === order.reference && (
                      <Text className="fd-note fd-note--warn" role="alert">
                        Nothing from that order is on {order.kitchenName}’s menu any more.
                      </Text>
                    )}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>

          {/* ── shortcuts ───────────────────────────────────────────────── */}
          <Aside className="fd-two__side" aria-label="Shortcuts">
            <Box className="fd-panel">
              <Heading level={2} className="fd-panel__title">Order it again</Heading>
              {USUALS.map(usual => {
                const dish = dishById(usual.dishId);
                const kitchen = kitchenById(dish.kitchenId);
                return (
                  <Link to={`/food/dish/${dish.id}`} className="fd-usual" key={dish.id}>
                    <PhotoTile tone={dish.tone} className="fd-usual__thumb" />
                    <Box className="fd-usual__text">
                      <Inline className="fd-usual__name">{dish.name}</Inline>
                      <Inline className="fd-usual__meta">{kitchen.name} · ordered {usual.times} times</Inline>
                    </Box>
                    <Inline className="fd-usual__add">ADD</Inline>
                  </Link>
                );
              })}
            </Box>

            <Box className="fd-panel">
              <Heading level={2} className="fd-panel__title">Need help with an order?</Heading>
              <Text className="fd-note">
                Open a ticket against any order in this list. You get a six-character reference and replies land here.
              </Text>
              <Link to="/contact" className="fd-btn fd-btn--outline fd-btn--full">Contact support</Link>
            </Box>

            <Box className="fd-panel">
              <Heading level={2} className="fd-panel__title">Spent {SPEND.monthLabel}</Heading>
              <Text className="fd-spend">{rupees(SPEND.total)}</Text>
              <Text className="fd-note">
                Across {SPEND.orders} orders · {rupees(SPEND.average)} average
              </Text>
            </Box>
          </Aside>
        </Box>
      </Box>
    </Region>
  );
}
