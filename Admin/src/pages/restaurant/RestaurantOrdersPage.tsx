/* ══════════════════════════════════════════════════════════════════════════
   Orders — the restaurant owner's queue.

   The working screen of this console. Everything an owner does to an order
   happens here: take it, refuse it, say it is cooking, say it is ready.

   ## The buttons are the server's table, not a guess

   `PARTNER_TRANSITIONS` in the service is the client's copy of
   `ALLOWED_PARTNER_TRANSITIONS` on the model, and a row only ever offers the
   moves that table allows from the state it is in. `picked_up` and
   `delivered` belong to the rider and `cancelled` belongs to the diner, so
   they are never offered here — a kitchen that could set them would be
   reporting a hand-over that never happened.

   When the two disagree the server wins and says so: INVALID_TRANSITION comes
   back with the current state in the sentence, and this page reloads rather
   than arguing. That case is real and not rare — the same order is worked
   from the phone in the kitchen and the laptop in the office.

   ## Why this page refreshes itself

   The rest of this console deliberately does not poll. This page does, and
   the difference is what the number means: a badge counting records is a
   fact that can be a click stale without costing anything, and an order
   nobody has accepted is food not being cooked. A queue that only updated
   when somebody thought to press a button would be a queue that misses
   orders during the exact hour it matters.

   So: a 20-second refresh, a visible "updated" line so nobody has to trust
   it silently, and a manual refresh beside it. It refreshes the whole page's
   data in one call — the rows and the tab counts come back together from one
   request, so a tab can never disagree with the list it labels.

   ## Accepting quotes a time, and says who delivers

   `promisedMinutes` is not a label for the diner: it is what the diner is
   told, and what the delivery desk is told when it is asked for a driver.

   The same dialog asks WHO brings the order, for a delivery order — the
   restaurant's own person, or a Lampose driver:

     self     nobody is contacted. The diner is told a driver is assigned.
     driver   the delivery desk is sent a WhatsApp — pickup, drop, cash to
              collect. The diner is told a driver is assigned once that
              message has actually gone out; if it did not, this screen says
              so, with a "Send again" button, and the diner is not told.

   Either way NO rider is searched for in the app — the restaurant or the desk
   is bringing it. A pickup order has nobody to arrange and is not asked.

   The choice can also be made (or changed, or the message resent) afterwards,
   from the row: an order accepted before this existed is not stuck.

   ## Finishing an order the restaurant arranged

   There is no rider account to press "picked up" and "delivered" on these, so
   the restaurant does. The server sends the moves it allows in `moves` and this
   page draws exactly those. "Delivered" asks for the diner's own 4-digit code —
   the one the driver collects at the door and the restaurant is never sent —
   which is what stops "delivered" being something that can simply be said.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, CheckCircle2, CookingPot, Inbox, PackageCheck, RefreshCw, Truck, Utensils } from 'lucide-react';
import { Badge } from '../../components/common/atoms/Badge';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Card } from '../../components/common/atoms/Card';
import { Inline } from '../../components/common/atoms/Inline';
import { PlainButton } from '../../components/common/atoms/PlainButton';
import { Strong } from '../../components/common/atoms/Strong';
import { Table, Td, Th, Tr } from '../../components/common/atoms/Table';
import { PlainTd, PlainTr, TableBody, TableHead } from '../../components/common/atoms/PlainTable';
import { Text } from '../../components/common/atoms/Text';
import { EmptyState } from '../../components/common/molecules/EmptyState';
import { ErrorState } from '../../components/common/molecules/ErrorState';
import { PageHeader } from '../../components/common/molecules/PageHeader';
import { TableSkeleton } from '../../components/common/molecules/TableSkeleton';
import { Modal } from '../../components/common/organisms/Modal';
import { Toast } from '../../components/common/organisms/Toast';
import type { ToastState } from '../../components/common/organisms/Toast';
import { cx } from '../../components/common/utils';
import { restaurantAdminService, PARTNER_TRANSITIONS } from '../../api/services/restaurantAdminService';
import type {
  FoodOrderStatus,
  OrderStatusCounts,
  RestaurantOrder,
} from '../../api/services/restaurantAdminService';
import { useFetch } from '../../lib/useFetch';
import { relativeTime, rupees } from '../../lib/format';
/* The words, the delivery picker, the order detail and the dialogs are shared with the page behind the
   link in the "new order" WhatsApp — see orderShared.tsx for why there is one of each. */
import {
  DELIVERY_OPEN,
  choosesDelivery,
  itemCount,
  MOVE_LOOK,
  PAYMENT_LOOK,
  STATUS_LOOK,
  summarise,
} from './orderLooks';
import { DeliveryLine, OrderDetail } from './orderShared';
import { useOrderActions } from './useOrderActions';

interface RestaurantOrdersPageProps {
  search: string;
  /** Refreshes the nav badge after a move, so the two never disagree. */
  reloadCounts?: () => void;
  /**
   * An order to open on arrival, from a `#restaurant-orders/LO151171` link —
   * what the "you have a new order" WhatsApp points at.
   */
  focusOrder?: string;
  /** Called once it has been opened, so it is not reopened on every render. */
  onFocusHandled?: () => void;
}

/** How often the queue re-reads itself. See the file header on why it does. */
const REFRESH_MS = 20_000;

/* ── Tabs ─────────────────────────────────────────────────────────────────
   Groups rather than single states, because "in the kitchen" is two states
   and an owner does not think of them separately. The `status` string is sent
   to the server comma-joined; it accepts both shapes. */
interface Tab {
  id: string;
  label: string;
  /** The states this tab shows. Empty means everything. */
  states: FoodOrderStatus[];
  icon: React.ElementType;
}

const TABS: Tab[] = [
  { id: 'new', label: 'New', states: ['placed'], icon: Inbox },
  { id: 'kitchen', label: 'In the kitchen', states: ['accepted', 'preparing'], icon: CookingPot },
  { id: 'ready', label: 'Ready', states: ['ready'], icon: PackageCheck },
  { id: 'out', label: 'On the way', states: ['picked_up'], icon: Truck },
  { id: 'done', label: 'Delivered', states: ['delivered'], icon: CheckCircle2 },
  { id: 'closed', label: 'Not fulfilled', states: ['rejected', 'cancelled'], icon: Ban },
  { id: 'all', label: 'Everything', states: [], icon: Utensils },
];

const tabCount = (tab: Tab, counts: OrderStatusCounts): number =>
  tab.states.length
    ? tab.states.reduce((n, state) => n + (counts[state] || 0), 0)
    : Object.values(counts).reduce((n: number, v) => n + (v || 0), 0);

export const RestaurantOrdersPage: React.FC<RestaurantOrdersPageProps> = ({
  search,
  reloadCounts,
  focusOrder,
  onFocusHandled,
}) => {
  const [tabId, setTabId] = useState<string>('new');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [detail, setDetail] = useState<RestaurantOrder | null>(null);


  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];
  const statusParam = tab.states.join(',');

  const queue = useFetch(
    () => restaurantAdminService.orders(statusParam ? { status: statusParam } : {}),
    [statusParam]
  );

  const { reload } = queue;
  const loadingRef = useRef(false);
  loadingRef.current = queue.loading || queue.refreshing;

  /* The moves on an order and the dialogs they ask their questions in — shared with the page behind the
     WhatsApp link (orderShared.tsx). What is specific to THIS screen is how a move reaches the server
     (the console's session) and what happens once it has: the queue and the nav badge are re-read. */
  const { busy, anyOpen, onMove, openAccept, openChoose, resend, dialogs } = useOrderActions({
    setStatus: (order, status, extra) =>
      restaurantAdminService.setOrderStatus(order.orderNumber, status, extra),
    setDelivery: (order, by) => restaurantAdminService.setDelivery(order.orderNumber, by),
    onChanged: () => {
      reload();
      reloadCounts?.();
    },
    onStale: reload,
    notify: setToast,
  });

  useEffect(() => {
    if (!queue.loading && !queue.refreshing) setUpdatedAt(new Date());
  }, [queue.loading, queue.refreshing]);

  /*
   * An order arrived at by link — open it, whatever tab it is in.
   *
   * Fetched by number rather than hunted for in `rows`: the link lands on
   * the "New" tab, and by the time somebody opens the WhatsApp the order may
   * already have been accepted from the kitchen tablet and moved out of it.
   * Searching the visible list would then find nothing and the link would
   * appear broken precisely when two people are working the same order.
   *
   * A miss is reported rather than ignored — a link to an order that is not
   * this restaurant's answers 404, and silently doing nothing would read as
   * a dead link.
   *
   * An order still WAITING opens the Accept dialog, not the detail. The link
   * is the one in the "you have a new order" WhatsApp, and what its reader has
   * been told to do is accept it: the detail is read-only, so landing on it
   * left an owner one close-button and a search for the row away from the only
   * thing they came for. Anything already past that — accepted from the
   * tablet while the message sat unread — opens the detail as before.
   */
  useEffect(() => {
    if (!focusOrder) return;
    let cancelled = false;
    (async () => {
      const res = await restaurantAdminService.order(focusOrder);
      if (cancelled) return;
      if (res.success && res.data) {
        if (res.data.status === 'placed') {
          openAccept(res.data);
        } else {
          setDetail(res.data);
        }
      } else setToast({ tone: 'crit', message: res.message || `Could not find order ${focusOrder}.` });
      onFocusHandled?.();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOrder]);

  /* The self-refresh. Skipped while a request is already in flight, so a slow
     network cannot stack requests on top of each other, and paused while a
     modal is open — a list reordering under a confirmation dialog is how
     somebody refuses the wrong order. */
  const paused = anyOpen || Boolean(detail);
  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => {
      if (!loadingRef.current) reload();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [reload, paused]);

  const counts = queue.data?.counts ?? {};

  /* The header filter, applied to what is already on screen. Deliberately
     client-side: the server's list is capped at fifty of the newest rows for
     one shop, which is the whole working set, and a round trip per keystroke
     would make the queue feel slower than the kitchen it serves.

     Derived from `queue.data` rather than from an `orders` array built in the
     render body: `?? []` mints a new array every pass, which would make this
     memo re-run on every keystroke anywhere on the page. */
  const rows = useMemo(() => {
    const orders = queue.data?.orders ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return orders;
    return orders.filter((order) =>
      [
        order.orderNumber,
        order.customerName,
        order.customerPhone,
        ...(order.lines || []).map((line) => line.productName),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [queue.data, search]);

  /** The buttons one row offers — the server's own list, or its general table. */
  const movesFor = (order: RestaurantOrder): FoodOrderStatus[] =>
    order.moves ?? PARTNER_TRANSITIONS[order.status] ?? [];

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="My restaurant"
        title="Orders"
        description="Take an order and choose who delivers it — your own person or a Lampose driver — then say when it is cooking and when it is ready."
        actions={
          <Box className="flex items-center gap-2.5">
            <Text className="text-label text-ink-3 hidden sm:block">
              {updatedAt ? `Updated ${relativeTime(updatedAt)}` : 'Loading…'}
            </Text>
            <Button
              size="sm"
              variant="secondary"
              icon={RefreshCw}
              onClick={reload}
              loading={queue.refreshing}
            >
              Refresh
            </Button>
          </Box>
        }
      />

      {/* Tabs. Each carries its own count, from the same request as the rows
          below — one number, one source, so a tab cannot promise an order the
          list then fails to show. */}
      <Box role="tablist" aria-label="Order states" className="flex flex-wrap gap-1.5">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = item.id === tabId;
          const n = tabCount(item, counts);
          return (
            <PlainButton
              key={item.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTabId(item.id)}
              className={cx(
                'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-control border text-label transition-colors duration-120',
                active
                  ? 'bg-brand-soft border-brand-border text-brand-ink font-medium'
                  : 'bg-surface border-line text-ink-2 hover:bg-surface-inset hover:text-ink'
              )}
            >
              <Icon className="size-3.5 shrink-0" strokeWidth={active ? 2 : 1.75} />
              {item.label}
              {n > 0 && <Inline className="tabular text-ink-3">{n}</Inline>}
            </PlainButton>
          );
        })}
      </Box>

      {queue.error && <ErrorState message={queue.error} onRetry={reload} />}

      <Card>
        <Table>
          <TableHead>
            <Tr>
              <Th>Order</Th>
              <Th>Items</Th>
              <Th className="text-right">Food</Th>
              <Th>Payment</Th>
              <Th>State</Th>
              <Th className="text-right">Action</Th>
            </Tr>
          </TableHead>
          <TableBody>
            {queue.loading ? (
              <TableSkeleton rows={6} cols={6} />
            ) : rows.length === 0 ? (
              <PlainTr>
                <PlainTd colSpan={6}>
                  <EmptyState
                    icon={tab.icon}
                    title={
                      search.trim() ? 'Nothing matches that' : `No orders ${tab.label.toLowerCase()}`
                    }
                    description={
                      search.trim()
                        ? 'Clear the filter in the header to see the whole queue.'
                        : tab.id === 'new'
                          ? 'New orders land here the moment a diner places one. This page refreshes itself every few seconds.'
                          : 'Nothing in this state right now.'
                    }
                  />
                </PlainTd>
              </PlainTr>
            ) : (
              rows.map((order) => {
                const look = STATUS_LOOK[order.status] ?? STATUS_LOOK.placed;
                const pay =
                  order.paymentMode === 'cod' && order.paymentStatus !== 'paid'
                    ? PAYMENT_LOOK.pending
                    : PAYMENT_LOOK[order.paymentStatus] ?? PAYMENT_LOOK.pending;
                const moves = movesFor(order);
                const working = busy === order.orderNumber;

                return (
                  <Tr key={order.orderNumber}>
                    <Td>
                      <PlainButton
                        onClick={() => setDetail(order)}
                        className="text-left hover:underline underline-offset-2"
                      >
                        <Strong className="text-ink tabular">{order.orderNumber}</Strong>
                      </PlainButton>
                      <Text className="text-label text-ink-3 mt-0.5">
                        {relativeTime(order.placedAt)}
                      </Text>
                    </Td>
                    <Td>
                      <Text className="text-ink-2">{summarise(order)}</Text>
                      <Text className="text-label text-ink-3 mt-0.5">
                        {itemCount(order)} item{itemCount(order) === 1 ? '' : 's'}
                        {order.customerName ? ` · ${order.customerName}` : ''}
                      </Text>
                    </Td>
                    <Td className="text-right">
                      {/* The FOOD, and what reaches the kitchen for it.
                          This used to print `grandTotal`, which carries GST,
                          the platform fee and the delivery fee — so a ₹160
                          order read ₹200 here, and none of the difference was
                          the restaurant's to sell, collect or keep. The server
                          no longer sends it: see `partnerView`. */}
                      <Strong className="text-ink tabular">{rupees(order.itemsTotal)}</Strong>
                      <Text className="text-label text-ink-3 tabular mt-0.5">
                        you get {rupees(order.partnerPayout)}
                      </Text>
                    </Td>
                    <Td>
                      <Badge tone={pay.tone}>{pay.label}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={look.tone} icon={look.icon}>
                        {look.label}
                      </Badge>
                      {/* Who brings it, once the order is accepted and until
                          it has left — with the button to choose, change, or
                          resend a request that did not go out. */}
                      {choosesDelivery(order) && DELIVERY_OPEN.includes(order.status) && (
                        <DeliveryLine
                          order={order}
                          busy={working}
                          onChoose={() => openChoose(order)}
                          onResend={() => resend(order)}
                        />
                      )}
                    </Td>
                    <Td className="text-right">
                      {moves.length === 0 ? (
                        <Button size="sm" variant="ghost" onClick={() => setDetail(order)}>
                          View
                        </Button>
                      ) : (
                        <Box className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                          {moves.map((next) => {
                            const m = MOVE_LOOK[next];
                            return (
                              <Button
                                key={next}
                                size="sm"
                                variant={m.variant}
                                icon={m.icon}
                                loading={working}
                                onClick={() => onMove(order, next)}
                              >
                                {m.label}
                              </Button>
                            );
                          })}
                        </Box>
                      )}
                    </Td>
                  </Tr>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {dialogs}

      {/* ── One order in full ──────────────────────────────────────────── */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Order ${detail.orderNumber}` : ''}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setDetail(null)}>
            Close
          </Button>
        }
      >
        {detail && <OrderDetail order={detail} />}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
