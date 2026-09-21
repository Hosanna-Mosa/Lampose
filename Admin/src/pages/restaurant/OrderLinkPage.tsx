/* ══════════════════════════════════════════════════════════════════════════
   One order, from the link in the "you have a new order" WhatsApp.

   The owner taps a link and lands HERE: the order, and the buttons to deal with
   it. No sign-in — the link carries its own proof, good for this order only (see
   `orderLink.service.js` on the server) — because a sign-in that a phone's
   in-app browser forgets between taps is a sign-in asked for again on every
   order, in a kitchen, with the food waiting.

   ## Exactly the console's moves, because they are the console's code

   The dialogs, the words and the rules come from `useOrderActions.tsx`,
   `orderLooks.ts` and `orderShared.tsx`, the same files
   the Orders page uses, and the server runs the same handlers behind both.
   Accepting a WEBSITE order here asks for the cooking time AND who delivers —
   the owner's own person, or a Lampose driver asked for on WhatsApp — and the
   last move the owner has is "taken by the delivery boy"; the diner (or the
   Lampose admin) says it arrived. An app order asks only the cooking time: a
   real driver is found for it. There is one set of dialogs, so there cannot be
   a link that lets an order skip a question the console asks.

   ## Only this order

   No queue, no menu, no earnings, no payout account: those are the console, and
   the console asks for the password. The link to it is at the bottom.

   ## Built for a phone

   One column, big buttons, no table. It is opened from WhatsApp, on a phone,
   by somebody standing at a pass.

   ## Not a console session

   Rendered OUTSIDE the sign-in provider (see `App`): nothing here reads or writes
   a stored session, and a wrong link cannot sign anybody out of the console.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge } from '../../components/common/atoms/Badge';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Card } from '../../components/common/atoms/Card';
import { Heading } from '../../components/common/atoms/Heading';
import { Inline } from '../../components/common/atoms/Inline';
import { Link } from '../../components/common/atoms/Link';
import { Main } from '../../components/common/atoms/Main';
import { Text } from '../../components/common/atoms/Text';
import { Toast } from '../../components/common/organisms/Toast';
import type { ToastState } from '../../components/common/organisms/Toast';
import { orderLinkService } from '../../api/services/orderLinkService';
import type { RestaurantOrder } from '../../api/services/restaurantAdminService';
import { relativeTime } from '../../lib/format';
import { choosesDelivery, DELIVERY_OPEN, MOVE_LOOK, STATUS_LOOK } from './orderLooks';
import { DeliveryLine, OrderDetail } from './orderShared';
import { useOrderActions } from './useOrderActions';

interface OrderLinkPageProps {
  orderNumber: string;
  /** The link's proof — `?token=` in the address. */
  token: string;
}

/** How often an order still in play re-reads itself, while nothing is open. */
const REFRESH_MS = 20_000;

/** The states an order can still be worked from — after these there is nothing to press. */
const LIVE: RestaurantOrder['status'][] = ['placed', 'accepted', 'preparing', 'ready', 'picked_up'];

type Phase = 'loading' | 'ready' | 'invalid' | 'expired' | 'error';

export const OrderLinkPage: React.FC<OrderLinkPageProps> = ({ orderNumber, token }) => {
  const [order, setOrder] = useState<RestaurantOrder | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [problem, setProblem] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Read the order.
   *
   * A wrong link (403) and an old one (410) are told apart, because what to do
   * next differs: neither can be fixed here, but an expired one still names the
   * order and the way to it. Anything else is a fault on the way — a dropped
   * connection on a phone — and says try again, keeping what was already on
   * screen: a page that blanked itself on one failed refresh would be worse than
   * a slightly stale one.
   */
  const load = useCallback(async () => {
    setRefreshing(true);
    const res = await orderLinkService.order(orderNumber, token);
    setRefreshing(false);

    if (res.success && res.data) {
      setOrder(res.data);
      setPhase('ready');
      setLoadedAt(new Date());
      return;
    }
    if (res.code === 'LINK_EXPIRED') {
      setProblem(res.message || 'This link has expired.');
      setPhase('expired');
    } else if (res.status === 403) {
      setProblem(res.message || 'This link is not valid.');
      setPhase('invalid');
    } else {
      setProblem(res.message || 'Could not reach Lampose.');
      setPhase((current) => (current === 'ready' ? 'ready' : 'error'));
    }
  }, [orderNumber, token]);

  useEffect(() => {
    load();
  }, [load]);

  const actions = useOrderActions({
    setStatus: (o, status, extra) => orderLinkService.setOrderStatus(o.orderNumber, token, status, extra),
    setDelivery: (o, by) => orderLinkService.setDelivery(o.orderNumber, token, by),
    /* The server answers a move with the order as it now stands, so the page
       updates from that rather than asking again. */
    onChanged: (next) => {
      if (next) {
        setOrder(next);
        setLoadedAt(new Date());
      } else {
        load();
      }
    },
    onStale: load,
    notify: setToast,
  });
  const { busy, anyOpen, onMove, openChoose, resend, dialogs } = actions;

  /* Keeps an order that is still moving current — somebody else may accept it
     from the tablet — but never under an open dialog: an order changing beneath
     a confirmation is how the wrong thing gets confirmed. */
  const live = order ? LIVE.includes(order.status) : false;
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!live || anyOpen) return undefined;
    const id = setInterval(() => loadRef.current(), REFRESH_MS);
    return () => clearInterval(id);
  }, [live, anyOpen]);

  /* Sign-in is for the console. An owner whose link failed goes there with the
     order in the address, so the console opens on the RESTAURANT door and, once
     signed in, on this order. */
  const consoleWithOrder = `/?order=${encodeURIComponent(orderNumber)}`;

  const kitchen = order?.restaurant?.name;
  const look = order ? (STATUS_LOOK[order.status] ?? STATUS_LOOK.placed) : null;
  const moves = order ? (order.moves ?? []) : [];

  return (
    <Box className="min-h-screen bg-canvas">
      <Box role="banner" className="bg-surface border-b border-line">
        <Box className="mx-auto max-w-2xl px-4 h-14 flex items-center gap-2.5">
          <Inline className="grid place-items-center size-8 rounded-control bg-brand text-white shrink-0">
            <Inline className="text-body font-semibold leading-none">L</Inline>
          </Inline>
          <Box className="min-w-0">
            <Text className="text-body font-semibold text-ink leading-tight truncate">
              {kitchen || 'Lampose'}
            </Text>
            <Text className="text-micro uppercase text-ink-3 leading-tight">Order</Text>
          </Box>
        </Box>
      </Box>

      <Main className="mx-auto max-w-2xl px-4 py-5 space-y-4">
        {phase === 'loading' && (
          <Card className="p-5">
            <Text className="text-body text-ink-2" role="status">
              Opening order {orderNumber}…
            </Text>
          </Card>
        )}

        {(phase === 'invalid' || phase === 'expired') && (
          <Card className="p-5 space-y-3">
            <Heading level={1} className="text-title text-ink">
              {phase === 'expired' ? 'This link has expired' : 'This link is not valid'}
            </Heading>
            <Text className="text-body text-ink-2">{problem}</Text>
            <Text className="text-sm text-ink-3">
              Your order is still in the restaurant console — sign in there to see it.
            </Text>
            <Link href={consoleWithOrder} className="inline-block">
              <Button variant="primary">Sign in to the console</Button>
            </Link>
          </Card>
        )}

        {phase === 'error' && (
          <Card className="p-5 space-y-3">
            <Heading level={1} className="text-title text-ink">
              Could not open the order
            </Heading>
            <Text className="text-body text-ink-2">{problem}</Text>
            <Button variant="primary" icon={RefreshCw} loading={refreshing} onClick={load}>
              Try again
            </Button>
          </Card>
        )}

        {phase === 'ready' && order && look && (
          <>
            <Card className="p-4 space-y-3">
              <Box className="flex items-start justify-between gap-3">
                <Box className="min-w-0">
                  <Heading level={1} className="text-title text-ink">
                    Order {order.orderNumber}
                  </Heading>
                  <Text className="text-label text-ink-3 mt-0.5">
                    Placed {relativeTime(order.placedAt)}
                  </Text>
                </Box>
                <Badge tone={look.tone} icon={look.icon}>
                  {look.label}
                </Badge>
              </Box>

              {/* The moves the server allows from where the order is now. Big,
                  and wrapping — this is pressed with a thumb. */}
              {moves.length > 0 && (
                <Box className="flex flex-wrap gap-2 pt-1">
                  {moves.map((next) => {
                    const m = MOVE_LOOK[next];
                    return (
                      <Button
                        key={next}
                        variant={m.variant}
                        icon={m.icon}
                        loading={busy === order.orderNumber}
                        onClick={() => onMove(order, next)}
                        className="flex-1 min-w-[9rem] h-11"
                      >
                        {m.label}
                      </Button>
                    );
                  })}
                </Box>
              )}

              {/* Who brings it — and the way to choose, change, or resend the
                  request to the delivery desk. */}
              {choosesDelivery(order) && DELIVERY_OPEN.includes(order.status) && (
                <DeliveryLine
                  order={order}
                  busy={busy === order.orderNumber}
                  onChoose={() => openChoose(order)}
                  onResend={() => resend(order)}
                />
              )}
            </Card>

            <Card className="p-4">
              <OrderDetail order={order} />
            </Card>

            <Box className="flex items-center justify-between gap-3 flex-wrap">
              <Text className="text-label text-ink-3">
                {loadedAt ? `Updated ${relativeTime(loadedAt)}` : ''}
                {live ? ' · refreshes itself' : ''}
              </Text>
              <Button size="sm" variant="secondary" icon={RefreshCw} loading={refreshing} onClick={load}>
                Refresh
              </Button>
            </Box>

            {/* The rest of the console — the queue, the menu, earnings — asks for
                the password, which a link never does. */}
            <Text className="text-label text-ink-3 pt-2">
              Need the whole console — the menu, your earnings, other orders?{' '}
              <Link href="/#restaurant-orders" className="underline underline-offset-2">
                Open it with your password
              </Link>
              .
            </Text>
          </>
        )}
      </Main>

      {dialogs}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
