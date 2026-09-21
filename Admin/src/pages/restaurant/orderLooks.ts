/* ══════════════════════════════════════════════════════════════════════════
   The words for an order: what each state and each move is called, how loud it
   is, and what the toast says about a delivery choice.

   Plain constants and functions, no JSX — kept apart from the components that
   draw them so a screen can import a label without importing a component, and so
   editing a component reloads in place. Shared by the Orders page of the console
   and the page behind the link in the "new order" WhatsApp.
   ══════════════════════════════════════════════════════════════════════════ */
import type React from 'react';
import { Ban, Bike, CheckCircle2, ChefHat, Inbox, PackageCheck, UserRound } from 'lucide-react';
import type { BadgeTone } from '../../components/common/atoms/Badge';
import type { ToastState } from '../../components/common/organisms/Toast';
import type {
  DeliveryBy,
  DeliveryReport,
  FoodOrderStatus,
  RestaurantOrder,
} from '../../api/services/restaurantAdminService';

export const STATUS_LOOK: Record<FoodOrderStatus, { label: string; tone: BadgeTone; icon: React.ElementType }> = {
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
export const MOVE_LOOK: Record<
  FoodOrderStatus,
  { label: string; variant: 'primary' | 'secondary' | 'danger'; icon: React.ElementType }
> = {
  accepted: { label: 'Accept', variant: 'primary', icon: CheckCircle2 },
  rejected: { label: 'Refuse', variant: 'danger', icon: Ban },
  preparing: { label: 'Start cooking', variant: 'primary', icon: ChefHat },
  ready: { label: 'Food is ready', variant: 'primary', icon: PackageCheck },
  placed: { label: 'Reopen', variant: 'secondary', icon: Inbox },
  /* Offered only on an order the restaurant arranged itself — see the header. */
  /* "The delivery boy has taken it" — the diner is told. Offered only on an order
     the restaurant arranged, and the LAST move it has: "delivered" is the diner's. */
  picked_up: { label: 'Taken by delivery boy', variant: 'primary', icon: Bike },
  delivered: { label: 'Delivered', variant: 'primary', icon: CheckCircle2 },
  cancelled: { label: 'Cancel', variant: 'secondary', icon: Ban },
};

/** The two answers to "who delivers this order?", as the dialogs word them. */
export const DELIVERY_CHOICES: {
  value: DeliveryBy;
  title: string;
  hint: string;
  icon: React.ElementType;
}[] = [
  {
    value: 'self',
    title: 'Our own delivery person',
    hint: 'You deliver it yourselves. Nobody is contacted, and the customer is told a driver is assigned.',
    icon: UserRound,
  },
  {
    value: 'driver',
    title: 'A Lampose driver',
    hint: 'A delivery request goes to the Lampose delivery desk on WhatsApp, and they send a driver.',
    icon: Bike,
  },
];

/** An order that has somebody to bring it: not a counter pickup. */
export const isDelivery = (order: RestaurantOrder): boolean => order.fulfilment !== 'pickup';

/**
 * Does the RESTAURANT arrange who delivers this order?
 *
 * Only for an order placed on the WEBSITE (`channel: 'web'`): there the restaurant
 * says its own person or a Lampose driver, and the diner confirms the delivery
 * with a button. An order placed in the app is unchanged — once it is accepted the
 * system searches for a real driver, and the driver's own app takes it from there.
 * An order that already has a delivery choice counts as a website order whatever
 * its `channel` says: the choice can only have come through the website's flow.
 */
export const choosesDelivery = (order: RestaurantOrder): boolean =>
  isDelivery(order) && (order.channel === 'web' || Boolean(order.deliveryChoice?.method));

/** States in which the way it travels can still be chosen or changed. */
export const DELIVERY_OPEN: FoodOrderStatus[] = ['accepted', 'preparing', 'ready'];

/**
 * What the toast says about a delivery choice.
 *
 * A driver request that did not go out is the one outcome that must not read as
 * success, so it is `crit` and says what is and is not true: the order IS
 * accepted, the desk has NOT been asked, and the customer has NOT been told a
 * driver is assigned.
 */
export const deliveryToast = (report: DeliveryReport): ToastState => {
  if (!report.ok) return { tone: 'crit', message: report.message || 'Delivery could not be set.' };
  if (report.method === 'self') {
    return {
      tone: 'good',
      message: 'You are delivering it yourselves. The customer is told a driver is assigned.',
    };
  }
  if (report.sent) {
    return {
      tone: 'good',
      message:
        'Delivery request sent to the Lampose delivery desk on WhatsApp. The customer is told a driver is assigned.',
    };
  }
  return {
    tone: 'crit',
    /* The reason arrives as a sentence with its own full stop, and this one
       goes on after it — without trimming it read "…on WhatsApp..". */
    message: `The driver request could not be sent: ${(report.message || 'unknown reason').replace(/[.\s]+$/, '')}. The customer has not been told a driver is assigned — use “Send again” on the order.`,
  };
};

export const PAYMENT_LOOK: Record<string, { label: string; tone: BadgeTone }> = {
  paid: { label: 'Paid online', tone: 'good' },
  pending: { label: 'Cash on delivery', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'warn' },
  failed: { label: 'Payment failed', tone: 'crit' },
};

/** One line of the order, as a kitchen reads it: "2 × Veg Biryani (Full)". */
export const lineLabel = (line: RestaurantOrder['lines'][number]): string => {
  const variant = line.variantName ? ` (${line.variantName})` : '';
  return `${line.quantity} × ${line.productName}${variant}`;
};

export const summarise = (order: RestaurantOrder): string => {
  const lines = order.lines || [];
  if (!lines.length) return '—';
  const first = lineLabel(lines[0]);
  return lines.length > 1 ? `${first} + ${lines.length - 1} more` : first;
};

/** Total dishes, not total lines — "4 items" means four things in the bag. */
export const itemCount = (order: RestaurantOrder): number =>
  (order.lines || []).reduce((n, line) => n + (line.quantity || 0), 0);
