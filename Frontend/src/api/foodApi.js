/* ══════════════════════════════════════════════════════════════════════════
   The food surface, from the server.

   This module is what `data/food.js` promised: its header said the fixture
   existed "so that swapping this module for `foodApi` is a change of source,
   not a change of every component". This is that module.

   Every function here calls `/api/v2/food-web/*`, whose handlers live in
   `Backend/src/modules/foodweb/`. The shapes that come back are the fixture's
   shapes — the backend does the mapping, on purpose, so that a kitchen card
   is assembled in ONE place rather than once here and once in the apps.

   ## What stayed behind in data/food.js

   The pure helpers — `rupees`, `clockLabel`, `readyLabel`, `dietAllowed`,
   `DIET_LABEL`. They are formatters and a predicate, not data, and there is
   nothing for a server to tell us about how to write "₹1,247". Components go
   on importing those from where they always did.

   What is GONE from there is every array: `KITCHENS`, `DISHES`, `COUPONS`,
   `ADDRESSES`, `PAYMENT_METHODS`, `ORDERS`, `USUALS`, `SPEND`, `CUISINES`,
   `AREA`.

   ## Errors are not swallowed here

   `apiRequest` throws with `status` and `code` attached. This module lets
   that through untouched. A feed that silently rendered an empty list on a
   failed fetch would look exactly like "no kitchens deliver to you", which is
   a real and completely different answer — `useFood` is where the two are
   told apart and drawn differently.
   ══════════════════════════════════════════════════════════════════════════ */
import { apiClient } from './apiClient';

/* Every route in this module sits under one prefix. Written once so a rename
   on the server is one line here. */
const BASE = '/v2/food-web';

/**
 * Drop empty values before they become query string noise.
 *
 * `?cuisine=` is not the same request as no `cuisine` at all — the first
 * sends an empty string the server then has to decide about. Cleared filters
 * should vanish, not arrive blank.
 */
const clean = (params = {}) => Object.fromEntries(
  Object.entries(params).filter(([, value]) => (
    value !== undefined && value !== null && value !== '' && value !== false
  )),
);

/* ── Public ─────────────────────────────────────────────────────────────── */

/**
 * The feed's chrome: cuisine chips, the diet labels, and the delivery verdict.
 *
 * `lat`/`lng` are optional. Without them the reply carries `located: false`
 * and `kitchensReaching: 0`, and the page asks for a location rather than
 * promising a delivery it has not measured.
 */
export const fetchCatalogue = ({ lat, lng } = {}) => apiClient
  .get(`${BASE}/catalogue`, clean({ lat, lng }))
  .then((res) => res.data);

/**
 * The kitchens.
 *
 * @param {object} [q]
 * @param {number} [q.lat] @param {number} [q.lng]  sorts nearest-first and
 *        fills `walkMinutes`; without them the order is newest-first
 * @param {string} [q.cuisine]  one chip, exactly as the catalogue spells it
 * @param {'on'}   [q.veg]      pure-veg kitchens only
 * @param {boolean}[q.openNow]
 * @param {string} [q.search]
 * @param {number} [q.limit]
 */
export const fetchKitchens = (q = {}) => apiClient
  .get(`${BASE}/kitchens`, clean({ ...q, openNow: q.openNow ? 'true' : '' }))
  .then((res) => res.data);

/** One kitchen — the header of the kitchen page. Its menu is a second call. */
export const fetchKitchen = (kitchenId) => apiClient
  .get(`${BASE}/kitchens/${encodeURIComponent(kitchenId)}`)
  .then((res) => res.data.kitchen);

/**
 * A kitchen's menu, flat AND grouped into its sections.
 *
 * Both shapes come back from one call because the page needs both: the
 * sections to render headings, and the flat list to look a dish up when the
 * sheet opens.
 */
export const fetchKitchenDishes = (kitchenId, { veg } = {}) => apiClient
  .get(`${BASE}/kitchens/${encodeURIComponent(kitchenId)}/dishes`, clean({ veg }))
  .then((res) => res.data);

/** The "popular" strip. Empty until dishes have ratings — see its handler. */
export const fetchPopularDishes = ({ limit } = {}) => apiClient
  .get(`${BASE}/dishes/popular`, clean({ limit }))
  .then((res) => res.data.dishes);

/** One dish, with its add-ons and allergens — everything the sheet shows. */
export const fetchDish = (dishId) => apiClient
  .get(`${BASE}/dishes/${encodeURIComponent(dishId)}`)
  .then((res) => res.data.dish);

/**
 * What this kitchen accepts.
 *
 * `kitchenId` is required: a kitchen that has switched cash off must not be
 * offered cash, so there is no kitchen-independent answer.
 */
export const fetchPaymentMethods = (kitchenId) => apiClient
  .get(`${BASE}/payment-methods`, clean({ kitchenId }))
  .then((res) => res.data);

/**
 * The offers at checkout.
 *
 * Works signed out. A signed-in diner also gets their referral credit, which
 * is a real row but is NOT redeemable on a food order today.
 *
 * Every row carries `enforced`, and it is the only thing that says whether an
 * order will subtract the coupon. Today no coupon is enforced — the order
 * controller bills with `discount: 0` — so a caller that applies anything
 * without checking it would show a total the server then refuses to charge.
 * See the handler's header.
 */
export const fetchCoupons = ({ kitchenId } = {}) => apiClient
  .get(`${BASE}/coupons`, clean({ kitchenId }))
  .then((res) => res.data.coupons);

/* ── The diner's own — a session is required ────────────────────────────── */

/**
 * Saved addresses, each judged against one kitchen.
 *
 * With `kitchenId` every row carries `serviceable` and, when it is false, an
 * `unserviceableNote` written for the page to print. Without it the list is
 * just a list.
 */
export const fetchAddresses = ({ kitchenId } = {}) => apiClient
  .get(`${BASE}/addresses`, clean({ kitchenId }))
  .then((res) => res.data);

/** This diner's orders, newest first, plus the reference of any live one. */
export const fetchOrders = ({ limit } = {}) => apiClient
  .get(`${BASE}/orders`, clean({ limit }))
  .then((res) => res.data);

/**
 * One order with both tracks — what the tracking page draws.
 *
 * `token` is the read-only code from the "your order is placed" WhatsApp. With
 * it the page opens on a phone that has never signed in here, which is most of
 * them: a link tapped in WhatsApp lands in an in-app browser holding nothing.
 * Without it the route is the diner's own session, exactly as before.
 */
export const fetchOrder = (reference, { token } = {}) => apiClient
  .get(`${BASE}/orders/${encodeURIComponent(reference)}`, clean({ token }))
  .then((res) => res.data.order);

/** What this diner reaches for, most-ordered first, priced as it is today. */
export const fetchUsuals = ({ limit } = {}) => apiClient
  .get(`${BASE}/usuals`, clean({ limit }))
  .then((res) => res.data.usuals);

/** What they have spent this calendar month. */
export const fetchSpend = () => apiClient
  .get(`${BASE}/spend`)
  .then((res) => res.data);

/* ── The one write ──────────────────────────────────────────────────────── */

/*
 * Every route above is under `/food-web`, which is READ-ONLY by design. Placing
 * an order is not one of them: it lives under `/food-partners`, the same
 * endpoint the Lampose app uses, because that is where the order is priced,
 * written, the kitchen is told, and a rider search can begin. A second "place
 * an order" here would be a second way to take money and a second thing to keep
 * correct.
 */
const ORDERS = '/v2/food-partners/orders';

/**
 * Place an order.
 *
 * The server prices it from its own copy of the menu and ignores any price the
 * client sends, refuses a closed or unapproved kitchen, a dish that has gone,
 * and an order under the kitchen's minimum - each with a sentence written for
 * the diner, carried on `error.message` with the machine-readable `error.code`
 * beside it (`RESTAURANT_CLOSED`, `DISH_SOLD_OUT`, `BELOW_MINIMUM`, ...).
 *
 * Requires a customer session: a guest gets a 401, and `apiClient` drops the
 * stale session on the way out.
 *
 * @param {object} order
 * @param {string} order.restaurantId
 * @param {{productId: string, quantity: number, addOns?: {name: string}[], note?: string}[]} order.lines
 * @param {'cod'} order.paymentMode   only cash for now - see the checkout page
 * @param {'delivery'} order.fulfilment  delivery only — the server refuses a
 *        pickup order, which is no longer offered anywhere
 * @param {string} [order.deliveryAddress]
 * @param {number} [order.dropLat]    named, never a pair: see the address row
 * @param {number} [order.dropLng]
 * @returns {Promise<{data: object, notified: boolean, message: string}>}
 *   `data` is the order as the diner is allowed to see it (its `orderNumber` is
 *   the reference on every later screen). `notified` is the server being honest
 *   about whether anybody at the kitchen was actually reached - the order is
 *   saved and visible to them either way, but "we have told the kitchen" and
 *   "we are still reaching them" are different things to say to a hungry person.
 */
export const placeFoodOrder = (order) => apiClient.post(ORDERS, order);

/**
 * Open the gateway for an order that is waiting to be paid.
 *
 * Mints (or re-uses) the Razorpay order for the amount THIS server computed —
 * the price is never sent from here — and answers with the publishable key and
 * the ids the checkout window needs. Re-callable: a diner who backs out of the
 * UPI screen and taps again lands on the same Razorpay order rather than a
 * second one.
 */
export const startFoodPayment = (reference) => apiClient
  .post(`${ORDERS}/${encodeURIComponent(reference)}/payment`)
  .then((res) => res.data);

/**
 * Hand back what Razorpay returned, and let the server decide.
 *
 * `paymentStatus: 'paid'` has exactly one cause in this product — a verified
 * signature — so this is not "tell the server it worked": it is handing over
 * three strings the server checks against its own secret. Until it answers,
 * nothing has been paid, the kitchen has not been told, and no rider is looked
 * for.
 */
export const verifyFoodPayment = (reference, proof) => apiClient
  .post(`${ORDERS}/${encodeURIComponent(reference)}/payment/verify`, proof)
  .then((res) => res.data);

/**
 * "Delivered" — the diner says a website order has reached them.
 *
 * The last step of an order the restaurant arranged: the restaurant says the
 * delivery boy has taken it, and the person who can see whether the food arrived
 * says so here. The server only accepts it once the order is on its way, and only
 * from the diner it belongs to; pressed twice, it is the same answer.
 */
export const confirmDelivered = (reference) => apiClient
  .patch(`${ORDERS}/${encodeURIComponent(reference)}/delivered`);

export default {
  fetchCatalogue,
  fetchKitchens,
  fetchKitchen,
  fetchKitchenDishes,
  fetchPopularDishes,
  fetchDish,
  fetchPaymentMethods,
  fetchCoupons,
  fetchAddresses,
  fetchOrders,
  fetchOrder,
  fetchUsuals,
  fetchSpend,
  placeFoodOrder,
  startFoodPayment,
  verifyFoodPayment,
  confirmDelivered,
};
