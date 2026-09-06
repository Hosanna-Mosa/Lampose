import { api } from './client';
import { endpoints } from './endpoints';

/**
 * Placing and tracking a food order.
 *
 * ## The request says WHAT, never HOW MUCH
 *
 * Every figure on an order — line totals, packaging, delivery, the payout —
 * is computed by the server from `food_products` and `food_restaurants`. This
 * layer deliberately sends only product ids, quantities, a variant name and
 * add-on names. Sending a total would be sending a number the server has to
 * ignore, and a client that believes its own arithmetic is a client that
 * eventually disagrees with the receipt.
 *
 * That also means the totals the cart shows are an ESTIMATE until the order
 * comes back. They are computed from the same menu rows the server prices
 * from, so they agree in every ordinary case — but the order's own figures
 * are the ones that count, and the tracking screen reads those.
 */

export type PlaceOrderLine = {
  productId: string;
  quantity: number;
  /** A portion the kitchen offers, by name. Replaces the base price. */
  variantName?: string;
  /** Add-on names, matched against the dish's own list. */
  addOns?: string[];
  note?: string;
};

export type PlaceOrderRequest = {
  restaurantId: string;
  lines: PlaceOrderLine[];
  fulfilment: 'delivery' | 'pickup';
  paymentMode: 'online' | 'cod';
  deliveryAddress?: string;
  customerName?: string;
  /**
   * Where the food is going, so a rider can be found for it.
   *
   * Optional, and its absence is an ordinary case — a diner who declined
   * location access still orders. The dispatcher falls back to searching
   * around the RESTAURANT rather than refusing, which is the right trade: a
   * rider near the kitchen can always reach the address written on the order.
   */
  dropLat?: number;
  dropLng?: number;
};

export type ServerOrderLine = {
  productId: string;
  productName: string;
  variantName?: string;
  addOns?: { name: string; price: number }[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isVeg?: 'veg' | 'non-veg' | 'egg';
  note?: string;
};

/**
 * The rider search, which runs BESIDE the kitchen's status rather than inside
 * it — an order is being cooked and looked for at the same time.
 *
 *   idle        nobody has been sent for. A pickup order stays here, and so
 *               does an online order that has not been paid.
 *   searching   offers are going out, one rider at a time, nearest first.
 *   assigned    a rider took it.
 *   unassigned  everybody nearby said no. NOT a failure — the kitchen is still
 *               cooking and the server tries again when the food is ready,
 *               which is why the tracking screen says "still looking" rather
 *               than "no luck".
 */
export type DispatchState = 'idle' | 'searching' | 'assigned' | 'unassigned';

/** What the diner is told about their rider. Nothing more is sent. */
export type ServerRider = {
  name: string;
  phone: string;
  vehicle?: { type?: string; model?: string; plate?: string };
  assignedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  /**
   * Where they are, as [longitude, latitude] — MongoDB's order, kept all the
   * way to the screen so nothing has to remember to swap it.
   *
   * NULL is a real and frequent answer: the server drops the position once the
   * rider's last fix is more than two minutes old, because a marker sitting
   * still reads as a rider who has stopped rather than as a phone that lost
   * signal. Only ever present on the single-order read, never in the list.
   */
  location?: [number, number] | null;
  /** Degrees from north. Null on a handset with no compass. */
  heading?: number | null;
  /** When the fix was taken, so the map can say how old it is. */
  at?: string | null;
};

export type ServerFoodOrder = {
  orderNumber: string;
  restaurantId: string;
  customerId?: string;
  deliveryAddress?: string;
  fulfilment?: 'delivery' | 'pickup';
  /**
   * The two fixed ends of the journey, as GeoJSON.
   *
   * Snapshotted onto the order at placement rather than joined from the
   * restaurant, so a partner who moves their pin cannot move an order that is
   * already out. `dropLocation` is absent when the diner ordered without
   * granting location access, which is an ordinary case the map handles.
   */
  pickupLocation?: { type?: string; coordinates?: number[] } | null;
  dropLocation?: { type?: string; coordinates?: number[] } | null;
  /**
   * Who cooked it, as it was at the time.
   *
   * Snapshotted onto the order for the same reason the coordinates above are:
   * a restaurant that renames itself, or leaves the platform entirely, must not
   * be able to rename an order that has already happened. It is also the only
   * name a delisted kitchen's orders will ever have, because the catalogue the
   * app searches holds listed kitchens only.
   *
   * Optional because orders placed before the field existed do not carry it.
   */
  restaurant?: { name?: string; address?: string; phone?: string } | null;
  lines: ServerOrderLine[];
  itemsTotal: number;
  packagingCharge: number;
  deliveryFee: number;
  discount: number;
  grandTotal: number;
  paymentMode: 'online' | 'cod';
  paymentStatus: 'pending' | 'paid' | 'refunded' | 'failed';
  status: 'placed' | 'accepted' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'rejected' | 'cancelled';
  statusHistory?: { status: string; at: string; by?: string; note?: string }[];
  /** The rider track. See `DispatchState`. */
  dispatch?: {
    state: DispatchState;
    candidateCount?: number;
    startedAt?: string | null;
    failureReason?: string;
  };
  /** Null until a rider accepts. */
  rider?: ServerRider | null;
  /**
   * The four digits the diner reads out at the door.
   *
   * Not a credential and not treated as one — it opens nothing on the server.
   * It is a value the diner and the rider COMPARE, which is exactly what a
   * hand-over is, and it has to be shown to work at all.
   */
  deliveryOtp?: string;
  promisedMinutes?: number;
  rejectionReason?: string;
  placedAt: string;
};

type Envelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  notified?: boolean;
  /**
   * What the app does next, decided by the SERVER rather than inferred from
   * `paymentMode` in three different clients.
   *
   *   'track'    the kitchen has it and a rider is being found.
   *   'payment'  the order is held and nobody has been told about it yet.
   */
  nextStep?: 'track' | 'payment';
};

/** Place it. Throws `ApiError` with the server's own reason on refusal. */
export async function placeFoodOrder(
  request: PlaceOrderRequest,
): Promise<{ order: ServerFoodOrder; notified: boolean; nextStep: 'track' | 'payment' }> {
  const res = await api.post<Envelope<ServerFoodOrder>>(endpoints.foodOrders, request);
  if (!res?.data) throw new Error(res?.message || 'The order did not go through.');
  /* `notified` says whether a handset in the kitchen actually rang. The
     confirmation screen words itself differently when nobody was reachable —
     the order is still placed either way. */
  return {
    order: res.data,
    notified: !!res.notified,
    nextStep: res.nextStep ?? (request.paymentMode === 'online' ? 'payment' : 'track'),
  };
}

/* ── Paying ─────────────────────────────────────────────────────────────── */

/** What Razorpay's checkout needs to open, all of it computed server-side. */
export type PaymentIntent = {
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  /** The PUBLISHABLE key. The secret never leaves the server. */
  keyId: string;
  orderNumber: string;
  name: string;
  description: string;
  prefill?: { name?: string; contact?: string };
  alreadyPaid?: boolean;
  /**
   * Proof that this handset may open the checkout PAGE.
   *
   * A WebView loading a URL sends no Authorization header, and an order number
   * is six digits — so the link carries a short-lived token naming exactly one
   * order instead. It expires in ten minutes; re-opening the payment mints a
   * fresh one.
   */
  checkoutToken?: string;
};

/**
 * Open (or re-open) the payment for an order.
 *
 * Safe to call twice: the server re-uses the Razorpay order it already minted
 * rather than creating a second one, which is what makes backing out of the
 * UPI screen and trying again land on the same order instead of a duplicate.
 */
export async function startFoodPayment(orderNumber: string): Promise<PaymentIntent> {
  const res = await api.post<Envelope<PaymentIntent>>(endpoints.foodOrderPayment(orderNumber), {});
  if (!res?.data) throw new Error(res?.message || 'We could not open the payment.');
  return res.data;
}

/**
 * Hand the signature back for checking.
 *
 * This is the call that rings the kitchen — see `foodPayment.controller.js`.
 * Nothing before it has told anybody the order exists, which is deliberate: a
 * kitchen cooking on an unpaid order is cooking on a promise. The rider
 * search itself waits further still, for the kitchen to accept and quote a
 * prep time.
 *
 * Idempotent. Razorpay's webhook routinely beats the app back, and a diner
 * whose payment already landed must not be shown a failure for also telling us
 * about it.
 */
export async function verifyFoodPayment(
  orderNumber: string,
  signature: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  },
): Promise<ServerFoodOrder> {
  const res = await api.post<Envelope<{ order: ServerFoodOrder }>>(
    endpoints.foodOrderPaymentVerify(orderNumber),
    signature,
  );
  const order = (res?.data as { order?: ServerFoodOrder } | undefined)?.order;
  if (!order) throw new Error(res?.message || 'We could not confirm that payment.');
  return order;
}

/** The diner's own history. */
export async function fetchMyFoodOrders(): Promise<ServerFoodOrder[]> {
  const res = await api.get<{ data?: ServerFoodOrder[] }>(endpoints.foodOrders);
  return Array.isArray(res?.data) ? res.data : [];
}

/** One order, for the tracking screen. */
export async function fetchFoodOrder(orderNumber: string): Promise<ServerFoodOrder | null> {
  const res = await api.get<Envelope<ServerFoodOrder>>(endpoints.foodOrder(orderNumber));
  return res?.data ?? null;
}

/** Cancel, while the kitchen has not started. Refused after that, by the server. */
export async function cancelFoodOrder(orderNumber: string, reason?: string): Promise<ServerFoodOrder | null> {
  const res = await api.patch<Envelope<ServerFoodOrder>>(endpoints.foodOrderCancel(orderNumber), { reason });
  return res?.data ?? null;
}
