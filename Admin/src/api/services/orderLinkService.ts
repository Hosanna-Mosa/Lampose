/* ══════════════════════════════════════════════════════════════════════════
   The page behind the link in "you have a new order" — one order, no sign-in.

   Every call here carries the link's own proof (`?token=`) and NOTHING from a
   sign-in: this is the door for an owner who has not signed in, in a browser
   that remembers nothing. The server side is `orderLink.service.js`, which says
   what the proof is good for: this one order, for a day, and no other page.

   Same shapes as the console's own order calls — `RestaurantOrder`, and the
   delivery report that rides with an accept — because the server runs the same
   handlers behind both. What an owner can do to the order is identical; what
   differs is only how they proved they may.

   ## Failures are 403 and 410, on purpose

   A 401 from this console means "your session ended" and signs the person out
   (`api:unauthorized`). A link that is wrong must not do that to somebody who
   happens to be signed in to the console in another tab, so the server answers
   a wrong link with 403 (`LINK_INVALID`) and an old one with 410
   (`LINK_EXPIRED`), and this file reads `code` to tell them apart.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';
import type { ApiResponse } from '../types';
import type {
  DeliveryBy,
  DeliveryReport,
  FoodOrderStatus,
  OrderMoveResponse,
  RestaurantOrder,
} from './restaurantAdminService';

const BASE = '/v1/order-link';

/** `/v1/order-link/LO241045/status?token=…` — the proof rides in the query, on every call. */
const at = (orderNumber: string, token: string, path = ''): string =>
  `${BASE}/${encodeURIComponent(orderNumber)}${path}?token=${encodeURIComponent(token)}`;

export const orderLinkService = {
  /** The order, as its restaurant sees it. */
  async order(orderNumber: string, token: string): Promise<ApiResponse<RestaurantOrder | null>> {
    const res = await api.get<{ data: RestaurantOrder }>(at(orderNumber, token));
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /** Move the order: accept (with the cooking time, and on a website order who delivers), refuse, cook, ready, taken by the delivery boy. */
  async setOrderStatus(
    orderNumber: string,
    token: string,
    status: FoodOrderStatus,
    extra: {
      reason?: string;
      promisedMinutes?: number;
      deliveryBy?: DeliveryBy;
    } = {}
  ): Promise<OrderMoveResponse> {
    const res = await api.patch<{ data: RestaurantOrder; delivery?: DeliveryReport | null }>(
      at(orderNumber, token, '/status'),
      { status, ...extra }
    );
    return res.success
      ? { ...res, data: res.data?.data ?? null, delivery: res.data?.delivery ?? null }
      : { ...res, data: null, delivery: null };
  },

  /** Choose, change, or resend who delivers an accepted order. */
  async setDelivery(orderNumber: string, token: string, deliveryBy: DeliveryBy): Promise<OrderMoveResponse> {
    const res = await api.patch<{ data: RestaurantOrder; delivery?: DeliveryReport | null }>(
      at(orderNumber, token, '/delivery'),
      { deliveryBy }
    );
    return res.success
      ? { ...res, data: res.data?.data ?? null, delivery: res.data?.delivery ?? null }
      : { ...res, data: null, delivery: null };
  },
};
