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

   ## Accepting quotes a time, and that time does real work

   `promisedMinutes` is not a label for the diner. The server turns it
   straight into the radius riders are called from, so every rider who could
   reach the shop before the food is ready is offered the job at once. A
   number typed here is the difference between a rider waiting at the pass
   and food going cold.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  Bike,
  CheckCircle2,
  ChefHat,
  Clock,
  CookingPot,
  Inbox,
  PackageCheck,
  Phone,
  RefreshCw,
  Timer,
  Truck,
  Utensils,
} from 'lucide-react';
import { Badge } from '../../components/common/atoms/Badge';
import type { BadgeTone } from '../../components/common/atoms/Badge';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Card } from '../../components/common/atoms/Card';
import { Inline } from '../../components/common/atoms/Inline';
import { Input } from '../../components/common/atoms/Input';
import { List } from '../../components/common/atoms/List';
import { ListItem } from '../../components/common/atoms/ListItem';
import { PlainButton } from '../../components/common/atoms/PlainButton';
import { Strong } from '../../components/common/atoms/Strong';
import { Table, Td, Th, Tr } from '../../components/common/atoms/Table';
import { PlainTd, PlainTr, TableBody, TableHead } from '../../components/common/atoms/PlainTable';
import { Text } from '../../components/common/atoms/Text';
import { Textarea } from '../../components/common/atoms/Textarea';
import { EmptyState } from '../../components/common/molecules/EmptyState';
import { ErrorState } from '../../components/common/molecules/ErrorState';
import { Field } from '../../components/common/molecules/Field';
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
import { formatDateTime, relativeTime, rupees } from '../../lib/format';

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

const STATUS_LOOK: Record<FoodOrderStatus, { label: string; tone: BadgeTone; icon: React.ElementType }> = {
  placed: { label: 'New', tone: 'warn', icon: Inbox },
  accepted: { label: 'Accepted', tone: 'brand', icon: CheckCircle2 },
  preparing: { label: 'Cooking', tone: 'brand', icon: ChefHat },
  ready: { label: 'Ready', tone: 'good', icon: PackageCheck },
  picked_up: { label: 'On the way', tone: 'good', icon: Bike },
  delivered: { label: 'Delivered', tone: 'good', icon: CheckCircle2 },
  rejected: { label: 'Refused', tone: 'crit', icon: Ban },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: Ban },
};

/** What each move is called on a button, and how loud that button should be. */
const MOVE_LOOK: Record<
  FoodOrderStatus,
  { label: string; variant: 'primary' | 'secondary' | 'danger'; icon: React.ElementType }
> = {
  accepted: { label: 'Accept', variant: 'primary', icon: CheckCircle2 },
  rejected: { label: 'Refuse', variant: 'danger', icon: Ban },
  preparing: { label: 'Start cooking', variant: 'primary', icon: ChefHat },
  ready: { label: 'Food is ready', variant: 'primary', icon: PackageCheck },
  placed: { label: 'Reopen', variant: 'secondary', icon: Inbox },
  picked_up: { label: 'Picked up', variant: 'secondary', icon: Bike },
  delivered: { label: 'Delivered', variant: 'secondary', icon: CheckCircle2 },
  cancelled: { label: 'Cancel', variant: 'secondary', icon: Ban },
};

const PAYMENT_LOOK: Record<string, { label: string; tone: BadgeTone }> = {
  paid: { label: 'Paid online', tone: 'good' },
  pending: { label: 'Cash on delivery', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'warn' },
  failed: { label: 'Payment failed', tone: 'crit' },
};

/** One line of the order, as a kitchen reads it: "2 × Veg Biryani (Full)". */
const lineLabel = (line: RestaurantOrder['lines'][number]): string => {
  const variant = line.variantName ? ` (${line.variantName})` : '';
  return `${line.quantity} × ${line.productName}${variant}`;
};

const summarise = (order: RestaurantOrder): string => {
  const lines = order.lines || [];
  if (!lines.length) return '—';
  const first = lineLabel(lines[0]);
  return lines.length > 1 ? `${first} + ${lines.length - 1} more` : first;
};

/** Total dishes, not total lines — "4 items" means four things in the bag. */
const itemCount = (order: RestaurantOrder): number =>
  (order.lines || []).reduce((n, line) => n + (line.quantity || 0), 0);

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
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<RestaurantOrder | null>(null);

  /* The two moves that ask a question before they happen. Held as the order
     plus the move, so the modal knows what it is confirming. */
  const [accepting, setAccepting] = useState<RestaurantOrder | null>(null);
  const [minutes, setMinutes] = useState('20');
  const [refusing, setRefusing] = useState<RestaurantOrder | null>(null);
  const [reason, setReason] = useState('');

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
   */
  useEffect(() => {
    if (!focusOrder) return;
    let cancelled = false;
    (async () => {
      const res = await restaurantAdminService.order(focusOrder);
      if (cancelled) return;
      if (res.success && res.data) setDetail(res.data);
      else setToast({ tone: 'crit', message: res.message || `Could not find order ${focusOrder}.` });
      onFocusHandled?.();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOrder]);

  /* The self-refresh. Skipped while a request is already in flight, so a slow
     network cannot stack requests on top of each other, and paused while a
     modal is open — a list reordering under a confirmation dialog is how
     somebody refuses the wrong order. */
  const paused = Boolean(accepting || refusing || detail);
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

  /**
   * Move one order, and say what happened.
   *
   * Every refusal is shown with the server's own sentence rather than a
   * generic one: INVALID_TRANSITION names the state the order is actually in,
   * which is the only useful thing to tell somebody whose button did nothing.
   * The queue reloads either way — on success because the row has moved tabs,
   * on INVALID_TRANSITION because what is on screen is out of date.
   */
  const move = useCallback(
    async (
      order: RestaurantOrder,
      status: FoodOrderStatus,
      extra: { reason?: string; promisedMinutes?: number } = {}
    ) => {
      setBusy(order.orderNumber);
      const res = await restaurantAdminService.setOrderStatus(order.orderNumber, status, extra);
      setBusy(null);

      if (res.success) {
        setToast({
          tone: 'good',
          message: `${order.orderNumber} — ${STATUS_LOOK[status].label.toLowerCase()}.`,
        });
        reload();
        reloadCounts?.();
        return true;
      }

      setToast({ tone: 'crit', message: res.message || 'That change could not be saved.' });
      /* The order moved under us, or somebody else moved it. Either way what
         is on screen is wrong and arguing with it helps nobody. */
      if (res.code === 'INVALID_TRANSITION') reload();
      return false;
    },
    [reload, reloadCounts]
  );

  const confirmAccept = async () => {
    if (!accepting) return;
    const parsed = Number(minutes);
    const ok = await move(accepting, 'accepted', {
      /* Only sent when it is a real number. The server clamps it to four
         hours and ignores anything that is not positive, so an empty box
         means "no quote" rather than "zero minutes". */
      ...(Number.isFinite(parsed) && parsed > 0 ? { promisedMinutes: parsed } : {}),
    });
    if (ok) {
      setAccepting(null);
      setMinutes('20');
    }
  };

  const confirmRefuse = async () => {
    if (!refusing) return;
    const ok = await move(refusing, 'rejected', { reason: reason.trim() });
    if (ok) {
      setRefusing(null);
      setReason('');
    }
  };

  /** The buttons one row offers, from the server's own transition table. */
  const movesFor = (order: RestaurantOrder): FoodOrderStatus[] =>
    PARTNER_TRANSITIONS[order.status] ?? [];

  const onMove = (order: RestaurantOrder, status: FoodOrderStatus) => {
    /* Two of the four moves ask something first: accepting quotes a cooking
       time that sizes the rider search, and refusing wants a reason the diner
       will be told. The other two are unambiguous and happen on the click. */
    if (status === 'accepted') {
      setMinutes(String(order.promisedMinutes || 20));
      setAccepting(order);
      return;
    }
    if (status === 'rejected') {
      setReason('');
      setRefusing(order);
      return;
    }
    move(order, status);
  };

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="My restaurant"
        title="Orders"
        description="Take an order, tell the kitchen it is cooking, and say when it is ready. The rider is called automatically."
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
              <Th className="text-right">Total</Th>
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
                      <Strong className="text-ink tabular">{rupees(order.grandTotal)}</Strong>
                      {/* What reaches the kitchen, under what the diner paid.
                          The two are different numbers and an owner cares
                          about the second one. */}
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

      {/* ── Accept ─────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(accepting)}
        onClose={() => setAccepting(null)}
        title={`Accept ${accepting?.orderNumber ?? ''}`}
        description="How long until the food is ready? A rider is called straight away, sized to this answer."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAccepting(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={CheckCircle2}
              loading={busy === accepting?.orderNumber}
              onClick={confirmAccept}
            >
              Accept order
            </Button>
          </>
        }
      >
        <Box className="space-y-4">
          <Field
            label="Minutes until ready"
            hint="Every rider who can reach you by then is offered the job at once. Leave it blank if you cannot say."
          >
            <Input
              type="number"
              min={1}
              max={240}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="20"
            />
          </Field>
          {accepting && (
            <Box className="rounded-panel border border-line bg-surface-subtle p-3">
              <Text className="text-label uppercase text-ink-3 mb-1.5">The order</Text>
              <List className="space-y-1 list-none m-0 p-0">
                {(accepting.lines || []).map((line, i) => (
                  <ListItem key={`${line.productId}-${i}`} className="text-sm text-ink-2">
                    {lineLabel(line)}
                    {line.note ? <Inline className="text-ink-3"> — {line.note}</Inline> : null}
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Box>
      </Modal>

      {/* ── Refuse ─────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(refusing)}
        onClose={() => setRefusing(null)}
        title={`Refuse ${refusing?.orderNumber ?? ''}`}
        description="The diner is told, any rider already assigned is released, and money already paid is flagged for a refund."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefusing(null)}>
              Keep the order
            </Button>
            <Button
              variant="danger"
              icon={Ban}
              loading={busy === refusing?.orderNumber}
              onClick={confirmRefuse}
            >
              Refuse it
            </Button>
          </>
        }
      >
        <Field
          label="Why?"
          hint="The diner sees this. “Out of paneer” is more use than “unavailable”."
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="We have run out of one of these items."
          />
        </Field>
      </Modal>

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

/* ══════════════════════════════════════════════════════════════════════════
   One order, in full
   ══════════════════════════════════════════════════════════════════════════ */

const Line: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box className="flex items-baseline justify-between gap-4 py-1.5">
    <Text className="text-label text-ink-3 shrink-0">{label}</Text>
    <Text className="text-sm text-ink-2 text-right break-words">{children}</Text>
  </Box>
);

const OrderDetail: React.FC<{ order: RestaurantOrder }> = ({ order }) => {
  const look = STATUS_LOOK[order.status] ?? STATUS_LOOK.placed;

  return (
    <Box className="space-y-5">
      <Box className="flex flex-wrap items-center gap-2">
        <Badge tone={look.tone} icon={look.icon}>
          {look.label}
        </Badge>
        <Badge tone="neutral" icon={Clock}>
          {formatDateTime(order.placedAt)}
        </Badge>
        {/* The number the cook reads out at the pass. The diner's own PIN is
            never sent to a restaurant — see `partnerView` on the server. */}
        {order.pickupCode && (
          <Badge tone="brand" icon={Bike}>
            Pickup code {order.pickupCode}
          </Badge>
        )}
        {order.promisedMinutes ? (
          <Badge tone="neutral" icon={Timer}>
            Quoted {order.promisedMinutes} min
          </Badge>
        ) : null}
      </Box>

      <Box>
        <Text className="text-label uppercase text-ink-3 mb-2">Items</Text>
        <Box className="rounded-panel border border-line divide-y divide-line">
          {(order.lines || []).map((line, i) => (
            <Box key={`${line.productId}-${i}`} className="flex items-start justify-between gap-4 p-3">
              <Box className="min-w-0">
                <Text className="text-sm text-ink">{lineLabel(line)}</Text>
                {line.addOns?.length ? (
                  <Text className="text-label text-ink-3 mt-0.5">
                    + {line.addOns.map((a) => a.name).join(', ')}
                  </Text>
                ) : null}
                {line.note ? (
                  <Text className="text-label text-warn mt-0.5">Note: {line.note}</Text>
                ) : null}
              </Box>
              <Text className="text-sm text-ink tabular shrink-0">{rupees(line.lineTotal)}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      <Box className="grid sm:grid-cols-2 gap-5">
        <Box>
          <Text className="text-label uppercase text-ink-3 mb-1">Money</Text>
          <Box className="divide-y divide-line">
            <Line label="Items">{rupees(order.itemsTotal)}</Line>
            {order.packagingCharge > 0 && <Line label="Packaging">{rupees(order.packagingCharge)}</Line>}
            {order.deliveryFee > 0 && <Line label="Delivery">{rupees(order.deliveryFee)}</Line>}
            {order.discount > 0 && <Line label="Discount">−{rupees(order.discount)}</Line>}
            <Line label="Diner paid">
              <Strong className="text-ink">{rupees(order.grandTotal)}</Strong>
            </Line>
            {/* The figure this whole screen exists to show an owner. */}
            <Line label={`You receive (after ${order.commissionRate}% commission)`}>
              <Strong className="text-ink">{rupees(order.partnerPayout)}</Strong>
            </Line>
          </Box>
        </Box>

        <Box>
          <Text className="text-label uppercase text-ink-3 mb-1">Delivery</Text>
          <Box className="divide-y divide-line">
            {order.customerName && <Line label="Diner">{order.customerName}</Line>}
            {order.customerPhone && (
              <Line label="Phone">
                <Inline className="inline-flex items-center gap-1 tabular">
                  <Phone className="size-3" /> {order.customerPhone}
                </Inline>
              </Line>
            )}
            {order.deliveryAddress && <Line label="Address">{order.deliveryAddress}</Line>}
            <Line label="Rider">
              {/* A pickup order never gets one, and "not assigned yet" on a
                  diner who is walking in would be a wait that never ends. */}
              {order.fulfilment === 'pickup' ? (
                <Inline className="text-ink-3">Collected by the diner</Inline>
              ) : order.rider ? (
                `${order.rider.name}${order.rider.phone ? ` · ${order.rider.phone}` : ''}`
              ) : (
                <Inline className="text-ink-3">
                  {order.dispatch?.state === 'searching'
                    ? 'Looking for a rider…'
                    : 'Not assigned yet'}
                </Inline>
              )}
            </Line>
            {order.rejectionReason && <Line label="Refused because">{order.rejectionReason}</Line>}
          </Box>
        </Box>
      </Box>

      {order.statusHistory?.length ? (
        <Box>
          <Text className="text-label uppercase text-ink-3 mb-2">History</Text>
          <List className="space-y-1 list-none m-0 p-0">
            {order.statusHistory.map((entry, i) => (
              <ListItem
                key={`${entry.status}-${i}`}
                className="flex items-center justify-between gap-3 text-label"
              >
                <Inline className="text-ink-2">
                  {STATUS_LOOK[entry.status as FoodOrderStatus]?.label ?? entry.status}
                  <Inline className="text-ink-3"> · by {entry.by}</Inline>
                </Inline>
                <Inline className="text-ink-3 tabular">{formatDateTime(entry.at)}</Inline>
              </ListItem>
            ))}
          </List>
        </Box>
      ) : null}
    </Box>
  );
};
