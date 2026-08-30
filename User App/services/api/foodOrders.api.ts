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

export type ServerFoodOrder = {
  orderNumber: string;
  restaurantId: string;
  customerId?: string;
  deliveryAddress?: string;
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
  promisedMinutes?: number;
  rejectionReason?: string;
  placedAt: string;
};

type Envelope<T> = { success?: boolean; data?: T; message?: string; notified?: boolean };

/** Place it. Throws `ApiError` with the server's own reason on refusal. */
export async function placeFoodOrder(
  request: PlaceOrderRequest,
): Promise<{ order: ServerFoodOrder; notified: boolean }> {
  const res = await api.post<Envelope<ServerFoodOrder>>(endpoints.foodOrders, request);
  if (!res?.data) throw new Error(res?.message || 'The order did not go through.');
  /* `notified` says whether a handset in the kitchen actually rang. The
     confirmation screen words itself differently when nobody was reachable —
     the order is still placed either way. */
  return { order: res.data, notified: !!res.notified };
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
