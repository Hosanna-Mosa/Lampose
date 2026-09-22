/* ══════════════════════════════════════════════════════════════════════════
   What an order looks like — the pieces both screens draw.

   The delivery picker, the line that says how an accepted order is travelling,
   and the order in full. Shared by the Orders page of the console (an owner
   who is signed in, seeing the queue) and the page behind the link in the "new
   order" WhatsApp (an owner who is not, seeing one order): two screens that must
   offer the same things can only stay the same if there is one of each.
   ══════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import { Ban, Bike, Clock, Phone, Send, Timer, Truck, UserRound } from 'lucide-react';
import { Badge } from '../../components/common/atoms/Badge';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Inline } from '../../components/common/atoms/Inline';
import { List } from '../../components/common/atoms/List';
import { ListItem } from '../../components/common/atoms/ListItem';
import { PlainButton } from '../../components/common/atoms/PlainButton';
import { Strong } from '../../components/common/atoms/Strong';
import { Text } from '../../components/common/atoms/Text';
import { cx } from '../../components/common/utils';
import type { DeliveryBy, FoodOrderStatus, RestaurantOrder } from '../../api/services/restaurantAdminService';
import { formatDateTime, rupees } from '../../lib/format';
import { choosesDelivery, DELIVERY_CHOICES, lineLabel, STATUS_LOOK } from './orderLooks';

/**
 * The two answers as a pair of cards. `role="radio"` on buttons rather than a
 * native radio: the whole card is the target, which matters on the tablet a
 * kitchen actually works from.
 */
export const DeliveryPicker: React.FC<{
  value: DeliveryBy | '';
  onChange: (next: DeliveryBy) => void;
}> = ({ value, onChange }) => (
  <Box role="radiogroup" aria-label="Who delivers this order" className="grid gap-2">
    {DELIVERY_CHOICES.map((choice) => {
      const Icon = choice.icon;
      const selected = value === choice.value;
      return (
        <PlainButton
          key={choice.value}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onChange(choice.value)}
          className={cx(
            'flex items-start gap-3 text-left rounded-panel border p-3 transition-colors duration-120',
            selected
              ? 'bg-brand-soft border-brand-border'
              : 'bg-surface border-line hover:bg-surface-inset'
          )}
        >
          <Icon
            className={cx('size-4 mt-0.5 shrink-0', selected ? 'text-brand-ink' : 'text-ink-3')}
            strokeWidth={selected ? 2 : 1.75}
          />
          <Box className="min-w-0">
            <Text className={cx('text-sm', selected ? 'text-brand-ink font-medium' : 'text-ink')}>
              {choice.title}
            </Text>
            <Text className="text-label text-ink-3 mt-0.5">{choice.hint}</Text>
          </Box>
        </PlainButton>
      );
    })}
  </Box>
);

/**
 * How an accepted delivery order stands, under its state badge — and the
 * button that fixes it.
 *
 *   nothing chosen    "Choose delivery"
 *   own person        "You deliver" · Change
 *   driver, sent      "Driver requested" · Change
 *   driver, NOT sent  "Request not sent" + "Send again" — the customer has not
 *                     been told a driver is assigned, and this is what changes
 *                     that
 */
export const DeliveryLine: React.FC<{
  order: RestaurantOrder;
  busy: boolean;
  onChoose: () => void;
  onResend: () => void;
}> = ({ order, busy, onChoose, onResend }) => {
  const choice = order.deliveryChoice;
  const method = choice?.method ?? '';

  if (!method) {
    return (
      <Button size="sm" variant="secondary" icon={Truck} onClick={onChoose} className="mt-1.5">
        Choose delivery
      </Button>
    );
  }

  const change = (
    <PlainButton
      onClick={onChoose}
      className="text-label text-ink-3 underline underline-offset-2 hover:text-ink"
    >
      Change
    </PlainButton>
  );

  if (method === 'self') {
    return (
      <Box className="mt-1.5 flex items-center gap-2 flex-wrap">
        <Badge tone="good" icon={UserRound}>
          You deliver
        </Badge>
        {change}
      </Box>
    );
  }

  const request = choice?.request;
  if (request?.ok) {
    return (
      <Box className="mt-1.5 flex items-center gap-2 flex-wrap">
        <Badge tone="good" icon={Bike}>
          Driver requested
        </Badge>
        {change}
      </Box>
    );
  }

  return (
    <Box className="mt-1.5 space-y-1">
      <Badge tone="crit" icon={Ban}>
        Request not sent
      </Badge>
      <Box className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="primary" icon={Send} loading={busy} onClick={onResend}>
          Send again
        </Button>
        {change}
      </Box>
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

export const OrderDetail: React.FC<{ order: RestaurantOrder }> = ({ order }) => {
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
        {/* The number the cook reads out at the pass, for a rider who comes to
            collect. A website order has no rider of ours and no code — the
            restaurant's own person, or the desk's, takes it — and the diner's
            own PIN is never sent to a restaurant (see `partnerView`). */}
        {order.pickupCode && !choosesDelivery(order) && (
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
            {/*
              Two lines, and they are the only two that are the kitchen's.

              GST, the platform fee, the delivery fee and what the diner
              finally paid used to be listed here as well. None of them is the
              restaurant's to sell, collect or keep, and the server stopped
              sending them to a partner session at all — see `partnerView`.
              What an owner needs from a single order is what they cooked and
              what they are paid for it; the diner's bill belongs to the diner.
            */}
            <Line label="Food total">{rupees(order.itemsTotal)}</Line>
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
            <Line label="Delivery">
              {/* A pickup order never gets one, and "not assigned yet" on a
                  diner who is walking in would be a wait that never ends. */}
              {order.fulfilment === 'pickup' ? (
                <Inline className="text-ink-3">Collected by the diner</Inline>
              ) : order.deliveryChoice?.method === 'self' ? (
                'Your own delivery person'
              ) : order.deliveryChoice?.method === 'driver' ? (
                order.deliveryChoice.request?.ok ? (
                  `A Lampose driver — requested on WhatsApp${
                    order.deliveryChoice.request.sentAt
                      ? ` at ${formatDateTime(order.deliveryChoice.request.sentAt)}`
                      : ''
                  }`
                ) : (
                  <Inline className="text-crit">
                    Driver request not sent
                    {order.deliveryChoice.request?.error
                      ? ` — ${order.deliveryChoice.request.error}`
                      : ''}
                  </Inline>
                )
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
