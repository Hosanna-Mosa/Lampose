/* ══════════════════════════════════════════════════════════════════════════
   The food-order desk — the console's side.

   Reads `/v1/admin/food-orders`, the v1 admin surface behind the same admin
   token every other service here uses. Diners, riders and restaurants reach
   the same collection through three other routers, each of which can only ever
   see its own author's orders; the console never touches those.

   Versioned in the path for the reason `foodAdminService` gives: the
   unversioned aliases in `routes/index.js` exist to keep callers written before
   versioning working, not to hand new ones a second spelling to drift onto.

   ## Nothing is defaulted into existence

   `money.commissionAmount` and `money.lamposeNet` arrive as `null` on an order
   that never had a payout written, and they stay null all the way to the
   screen, where the page draws a dash. Coercing them to zero here would be the
   console asserting that a kitchen earned nothing, which is a different claim
   from "nobody wrote it down" and a false one.

   ## Why the two refund calls read a code and nothing else here does

   Every other call in this file lets `apiCaller` turn a non-2xx into
   `{ success: false, message }`, which is all a list or a detail ever needs.
   The refund routes are different: their refusals carry a `code`, and three
   different 409s mean three different next actions. ALREADY_REFUNDED means the
   money has gone and the button must never come back; NOT_OWED means there was
   never anything to send; REFUND_IN_FLIGHT means a click is still in the air
   and the answer is to wait; REFUND_FAILED carries Razorpay's own sentence and
   the retry must stay live.

   `apiCaller` carries that code through on the envelope now, so these are
   ordinary `api.post` calls. They used to pass axios's own `validateStatus` so
   that a refusal arrived as DATA with its code intact — a second path through
   the error handling, kept alive only because one field was being dropped one
   layer up. That path also resolved every status, so 401 had to be excluded by
   hand or a signed-out session would have been shown a refund button instead
   of being signed out. Both of those are gone: one path, and one place where
   `api:unauthorized` is dispatched.

   ## A refund that was never answered is not a refund that failed

   `axiosInstance` gives up after fifteen seconds, and the sentence the
   interceptor writes for that is "Backend server unreachable". For a GET that
   is true enough. For this POST it is a claim nobody is in a position to make:
   a Razorpay refund slower than the client's patience, or an answer lost on
   the way back, leaves the money in exactly the state a successful one does.
   So a failure with no response behind it is reported as `unanswered` rather
   than as a refusal, and the page treats it as an outcome that is UNKNOWN —
   reload and look before anybody sends anything again.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';
import type {
  ApiResponse,
  FoodDispatchOffer,
  FoodDispatchOfferOutcome,
  FoodDispatchState,
  FoodOrderAddOn,
  FoodOrderCounts,
  FoodOrderDetail,
  FoodOrderFlags,
  FoodOrderLine,
  FoodOrderPage,
  FoodOrderPaymentStatus,
  FoodOrderQuery,
  FoodOrderRiderBrief,
  FoodOrderRow,
  FoodOrderStatus,
  FoodOrderStatusEvent,
  FoodRefundCode,
  FoodRefundDetail,
  FoodRefundRecord,
  FoodRefundResult,
  FoodRefundState,
} from '../types';

/* The versioned path, spelled once. `axiosInstance` supplies the `/api` base. */
const BASE = '/v1/admin/food-orders';

/* The model's own enums, mirrored so an unexpected string degrades to a known
   value instead of colouring a badge by accident. Kept in step with
   `Backend/src/modules/foodpartners/foodOrder.model.js`. */
export const FOOD_ORDER_STATUSES: readonly FoodOrderStatus[] = [
  'placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'rejected', 'cancelled',
];

/** Still running: nobody has been fed and nobody has been told no. */
export const FOOD_ORDER_OPEN_STATUSES: readonly FoodOrderStatus[] = [
  'placed', 'accepted', 'preparing', 'ready', 'picked_up',
];

export const FOOD_PAYMENT_STATUSES: readonly FoodOrderPaymentStatus[] = [
  'pending', 'paid', 'refunded', 'failed',
];

export const FOOD_DISPATCH_STATES: readonly FoodDispatchState[] = [
  'idle', 'searching', 'assigned', 'unassigned',
];

const OFFER_OUTCOMES: readonly FoodDispatchOfferOutcome[] = [
  'offered', 'accepted', 'declined', 'timeout', 'cancelled',
];

const REFUND_STATES: readonly FoodRefundState[] = ['owed', 'settled', 'none'];

const REFUND_CODES: readonly FoodRefundCode[] = [
  'BAD_INPUT', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'ALREADY_REFUNDED', 'NOT_OWED',
  'NO_PAYMENT_ID', 'REFUND_IN_FLIGHT', 'REFUND_FAILED', 'PAYMENTS_NOT_CONFIGURED',
  'DB_DISCONNECTED',
];

/* ------------------------------------------------------------------ *
 * Reading an untyped body without pretending it is typed
 * ------------------------------------------------------------------ */

type Json = Record<string, unknown>;

const obj = (value: unknown): Json => (
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
);

const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const str = (value: unknown, fallback = ''): string => (
  typeof value === 'string' ? value : fallback
);

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Absent stays absent. See the header — a null here is not a zero. */
const maybeNum = (value: unknown): number | null => (
  value === null || value === undefined || value === '' ? null : num(value)
);

const iso = (value: unknown): string | null => (
  typeof value === 'string' && value ? value : null
);

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (
  allowed.includes(value as T) ? (value as T) : fallback
);

/**
 * The server's refusal code, or '' when what came back was not one of them.
 *
 * Anything else on the wire — axios's own 'ERR_BAD_REQUEST', a code from a
 * route that grew one this file has not been told about — is reported as no
 * code rather than mistaken for one of these, because the page branches on it
 * to decide whether a refund button ever comes back.
 */
const refundCode = (value: unknown): FoodRefundCode | '' => (
  REFUND_CODES.includes(value as FoodRefundCode) ? (value as FoodRefundCode) : ''
);

/**
 * The codes that mean the answer never arrived.
 *
 * `axiosInstance`'s response interceptor rewrites all of them to
 * 'NETWORK_ERROR' on the path a refund actually takes; the rest are here so a
 * request that fails before the interceptor can see it is read the same way.
 * None of them says anything about what the server did with the request, which
 * is the whole point. See the header.
 */
const NO_ANSWER_CODES = new Set([
  'NETWORK_ERROR', 'ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED',
]);

/* ------------------------------------------------------------------ *
 * Normalising
 * ------------------------------------------------------------------ */

const normalizeFlags = (raw: unknown): FoodOrderFlags => {
  const flags = obj(raw);
  const refundOwed = flags.refundOwed === true;
  const dispatchFailed = flags.dispatchFailed === true;
  const stuck = flags.stuck === true;
  return {
    refundOwed,
    dispatchFailed,
    stuck,
    /* The union rather than the sent value, so a row can never claim to need
       nobody while one of its three reasons is lit. */
    needsHuman: flags.needsHuman === true || refundOwed || dispatchFailed || stuck,
  };
};

const normalizeRefund = (raw: unknown): FoodRefundRecord => {
  const refund = obj(raw);
  const channel = str(refund.channel);
  return {
    state: oneOf(refund.state, REFUND_STATES, 'none'),
    channel: channel === 'razorpay' || channel === 'manual' ? channel : '',
    reference: str(refund.reference),
    at: iso(refund.at),
    by: str(refund.by),
  };
};

const normalizeRefundDetail = (raw: unknown): FoodRefundDetail => ({
  ...normalizeRefund(raw),
  note: str(obj(raw).note),
});

const normalizeRiderBrief = (raw: unknown): FoodOrderRiderBrief | null => {
  const rider = obj(raw);
  if (!str(rider.driverId)) return null;
  return {
    driverId: str(rider.driverId),
    name: str(rider.name),
    phone: str(rider.phone),
  };
};

const normalizeRow = (raw: unknown): FoodOrderRow => {
  const row = obj(raw);
  return {
    orderNumber: str(row.orderNumber),
    placedAt: iso(row.placedAt),
    ageMinutes: num(row.ageMinutes),
    status: oneOf(row.status, FOOD_ORDER_STATUSES, 'placed'),
    dispatchState: oneOf(row.dispatchState, FOOD_DISPATCH_STATES, 'idle'),
    dispatchFailureReason: str(row.dispatchFailureReason),
    fulfilment: row.fulfilment === 'pickup' ? 'pickup' : 'delivery',
    restaurantId: str(row.restaurantId),
    /* Left empty on purpose when the server had nothing — the page prints the
       id in that case rather than a name nobody ever wrote down. */
    restaurantName: str(row.restaurantName),
    customerName: str(row.customerName),
    customerPhone: str(row.customerPhone),
    grandTotal: num(row.grandTotal),
    paymentMode: row.paymentMode === 'online' ? 'online' : 'cod',
    paymentStatus: oneOf(row.paymentStatus, FOOD_PAYMENT_STATUSES, 'pending'),
    refund: normalizeRefund(row.refund),
    rider: normalizeRiderBrief(row.rider),
    flags: normalizeFlags(row.flags),
  };
};

const normalizeAddOns = (raw: unknown): FoodOrderAddOn[] => arr(raw).map((entry) => {
  const addOn = obj(entry);
  return { name: str(addOn.name), price: num(addOn.price) };
});

const normalizeLine = (raw: unknown): FoodOrderLine => {
  const line = obj(raw);
  const veg = str(line.isVeg);
  return {
    productId: str(line.productId),
    productName: str(line.productName, 'Unnamed item'),
    variantName: str(line.variantName),
    addOns: normalizeAddOns(line.addOns),
    quantity: num(line.quantity),
    unitPrice: num(line.unitPrice),
    lineTotal: num(line.lineTotal),
    isVeg: veg === 'non-veg' || veg === 'egg' ? veg : 'veg',
    note: str(line.note),
  };
};

const normalizeOffer = (raw: unknown): FoodDispatchOffer => {
  const offer = obj(raw);
  return {
    driverId: str(offer.driverId),
    distanceMeters: num(offer.distanceMeters),
    offeredAt: iso(offer.offeredAt),
    respondedAt: iso(offer.respondedAt),
    outcome: oneOf(offer.outcome, OFFER_OUTCOMES, 'offered'),
    reason: str(offer.reason),
  };
};

const normalizeEvent = (raw: unknown): FoodOrderStatusEvent => {
  const event = obj(raw);
  return {
    status: oneOf(event.status, FOOD_ORDER_STATUSES, 'placed'),
    at: iso(event.at),
    by: str(event.by, 'system'),
    note: str(event.note),
  };
};

const normalizeDetail = (raw: unknown): FoodOrderDetail => {
  const order = obj(raw);
  const customer = obj(order.customer);
  const restaurant = obj(order.restaurant);
  const money = obj(order.money);
  const payment = obj(order.payment);
  const dispatch = obj(order.dispatch);
  const rider = obj(order.rider);
  const vehicle = obj(rider.vehicle);
  const failure = obj(payment.lastFailure);

  return {
    orderNumber: str(order.orderNumber),
    placedAt: iso(order.placedAt),
    status: oneOf(order.status, FOOD_ORDER_STATUSES, 'placed'),
    fulfilment: order.fulfilment === 'pickup' ? 'pickup' : 'delivery',
    promisedMinutes: num(order.promisedMinutes),
    rejectionReason: str(order.rejectionReason),
    ageMinutes: num(order.ageMinutes),

    customer: {
      customerId: str(customer.customerId),
      name: str(customer.name),
      phone: str(customer.phone),
      deliveryAddress: str(customer.deliveryAddress),
    },

    restaurant: {
      restaurantId: str(restaurant.restaurantId),
      name: str(restaurant.name),
      address: str(restaurant.address),
      phone: str(restaurant.phone),
      ownerName: str(restaurant.ownerName),
      ownerPhone: str(restaurant.ownerPhone),
    },

    lines: arr(order.lines).map(normalizeLine),

    money: {
      itemsTotal: num(money.itemsTotal),
      packagingCharge: num(money.packagingCharge),
      deliveryFee: num(money.deliveryFee),
      discount: num(money.discount),
      grandTotal: num(money.grandTotal),
      partnerPayout: num(money.partnerPayout),
      commissionRate: num(money.commissionRate),
      commissionAmount: maybeNum(money.commissionAmount),
      riderEarnings: num(money.riderEarnings),
      lamposeNet: maybeNum(money.lamposeNet),
    },

    payment: {
      mode: payment.mode === 'online' ? 'online' : 'cod',
      status: oneOf(payment.status, FOOD_PAYMENT_STATUSES, 'pending'),
      razorpayOrderId: str(payment.razorpayOrderId),
      razorpayPaymentId: str(payment.razorpayPaymentId),
      amountPaise: num(payment.amountPaise),
      paidAt: iso(payment.paidAt),
      /* The server decides this, and the page never second-guesses it. */
      refundable: payment.refundable === true,
      refundBlockedReason: str(payment.refundBlockedReason),
      refund: normalizeRefundDetail(payment.refund),
      lastFailure: payment.lastFailure
        ? { note: str(failure.note), at: iso(failure.at) }
        : null,
    },

    dispatch: {
      state: oneOf(dispatch.state, FOOD_DISPATCH_STATES, 'idle'),
      candidateCount: num(dispatch.candidateCount),
      attempts: num(dispatch.attempts),
      startedAt: iso(dispatch.startedAt),
      failureReason: str(dispatch.failureReason),
      offers: arr(dispatch.offers).map(normalizeOffer),
    },

    rider: str(rider.driverId)
      ? {
        driverId: str(rider.driverId),
        name: str(rider.name),
        phone: str(rider.phone),
        vehicle: {
          type: str(vehicle.type) || undefined,
          model: str(vehicle.model) || undefined,
          plate: str(vehicle.plate) || undefined,
        },
        assignedAt: iso(rider.assignedAt),
        pickedUpAt: iso(rider.pickedUpAt),
        deliveredAt: iso(rider.deliveredAt),
        earnings: num(rider.earnings),
        acceptedFromMeters: num(rider.acceptedFromMeters),
      }
      : null,

    pickupCode: str(order.pickupCode),
    channel: order.channel === 'web' ? 'web' : 'app',
    deliveryMethod: order.deliveryMethod === 'self' || order.deliveryMethod === 'driver'
      ? order.deliveryMethod
      : '',
    canMarkDelivered: order.canMarkDelivered === true,
    statusHistory: arr(order.statusHistory).map(normalizeEvent),
    flags: normalizeFlags(order.flags),
  };
};

/**
 * Zero-filled from the enums rather than from what arrived.
 *
 * The server already fills every key, and this keeps that promise true on the
 * console's side too: the chip row is built by iterating these records, and a
 * missing key would silently drop a chip rather than show a nought.
 */
const tally = <T extends string>(raw: unknown, keys: readonly T[]): Record<T, number> => {
  const source = obj(raw);
  const acc = {} as Record<T, number>;
  keys.forEach((key) => { acc[key] = num(source[key]); });
  return acc;
};

const EMPTY_COUNTS: FoodOrderCounts = {
  needsHuman: 0,
  refundOwed: 0,
  refundOwedValue: 0,
  dispatchFailed: 0,
  stuck: 0,
  /* Matches STUCK_MINUTES in the controller. Only ever seen if a response is
     missing the field, in which case a wrong-looking label beats a zero that
     claims every open order is late. */
  stuckAfterMinutes: 45,
  openOrders: 0,
  byStatus: tally(null, FOOD_ORDER_STATUSES),
  byPaymentStatus: tally(null, FOOD_PAYMENT_STATUSES),
};

/* ------------------------------------------------------------------ *
 * Query building
 * ------------------------------------------------------------------ */

/**
 * Empty strings are dropped rather than sent.
 *
 * `?needs=` would be read as a filter on the empty value, and the queue would
 * go blank the moment somebody cleared a chip. Arrays become the comma list the
 * route documents.
 */
const paramsFrom = (query: FoodOrderQuery): Record<string, string | number> => {
  const params: Record<string, string | number> = {};
  (Object.keys(query) as (keyof FoodOrderQuery)[]).forEach((key) => {
    const value = query[key];
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      if (value.length) params[key] = value.join(',');
      return;
    }
    params[key] = value;
  });
  return params;
};

/* ------------------------------------------------------------------ *
 * The two refund calls, and why they are shaped differently
 * ------------------------------------------------------------------ */

export interface FoodRefundResponse extends ApiResponse<FoodRefundResult | null> {
  /** The server's own refusal code, or '' when it did not send one of them. */
  code: FoodRefundCode | '';
  /**
   * Nothing came back at all — the fifteen-second timeout, or a connection
   * that dropped. Read this BEFORE the message: the outcome is unknown rather
   * than failed, and the money may already have moved. See the header.
   */
  unanswered: boolean;
}

/**
 * One place where both refund routes' answers become the same shape.
 *
 * Both can return the ordinary success (a message and the whole updated
 * order); only `/refund` can return the rare one where the money moved and the
 * save did not, which carries no `payment` at all. Branching here rather than
 * in the page means the page reads one field — `recorded` — and never has to
 * know that `data.payment` is sometimes absent.
 */
const readRefundBody = (
  res: ApiResponse<unknown>,
  fallbackOrderNumber: string,
): FoodRefundResponse => {
  /* Refused, or never answered. `apiCaller` carries the sentence and the code;
     all this adds is which of the two it was, because they call for opposite
     next moves — one of them is a retry, the other is "go and look at the
     payment before anybody touches this again". */
  if (!res.success) {
    return {
      ...res,
      data: null,
      code: refundCode(res.code),
      unanswered: NO_ANSWER_CODES.has(res.code ?? ''),
    };
  }

  const body = obj(res.data);

  /* A 2xx that says it failed. The routes do not answer that way today — every
     refusal is a 4xx — but this field is the server's own verdict and it
     outranks the status if the two ever disagree. */
  if (body.success !== true) {
    return {
      ...res,
      success: false,
      data: null,
      message: str(body.message) || str(body.error) || 'That refund did not go through.',
      code: oneOf(body.code, REFUND_CODES, 'REFUND_FAILED'),
      unanswered: false,
    };
  }

  const recorded = body.recorded !== false;
  const data = obj(body.data);

  return {
    ...res,
    success: true,
    message: str(body.message),
    code: '',
    unanswered: false,
    data: {
      recorded,
      orderNumber: str(data.orderNumber) || fallbackOrderNumber,
      message: str(body.message),
      warning: str(body.warning),
      /* The cut-down shape carries `data.refund`; the ordinary one carries it
         under `data.payment.refund`. Both are read, in that order. */
      refund: normalizeRefundDetail(data.refund ?? obj(data.payment).refund),
      order: recorded ? normalizeDetail(data) : null,
    },
  };
};

/* ------------------------------------------------------------------ *
 * Calls
 * ------------------------------------------------------------------ */

export const foodOrderService = {
  /**
   * The queue, filtered.
   *
   * Sorting is deliberately not passed unless somebody asks: with a `needs`
   * filter on, the server sorts oldest-first, because the question a working
   * list answers is "who has been waiting longest".
   */
  async list(query: FoodOrderQuery = {}): Promise<ApiResponse<FoodOrderPage>> {
    const res = await api.get<unknown>(BASE, paramsFrom(query));
    const empty: FoodOrderPage = { rows: [], count: 0, total: 0, page: 1, pages: 1 };
    if (!res.success) return { ...res, data: empty };

    const body = obj(res.data);
    return {
      ...res,
      data: {
        rows: arr(body.data).map(normalizeRow),
        count: num(body.count),
        total: num(body.total),
        page: num(body.page, 1),
        pages: Math.max(1, num(body.pages, 1)),
      },
    };
  },

  /** The badge number, and the strip of counts above the queue. */
  async counts(): Promise<ApiResponse<FoodOrderCounts>> {
    const res = await api.get<unknown>(`${BASE}/counts`);
    if (!res.success) return { ...res, data: EMPTY_COUNTS };

    const data = obj(obj(res.data).data);
    return {
      ...res,
      data: {
        needsHuman: num(data.needsHuman),
        refundOwed: num(data.refundOwed),
        refundOwedValue: num(data.refundOwedValue),
        dispatchFailed: num(data.dispatchFailed),
        stuck: num(data.stuck),
        stuckAfterMinutes: num(data.stuckAfterMinutes, EMPTY_COUNTS.stuckAfterMinutes),
        openOrders: num(data.openOrders),
        byStatus: tally(data.byStatus, FOOD_ORDER_STATUSES),
        byPaymentStatus: tally(data.byPaymentStatus, FOOD_PAYMENT_STATUSES),
      },
    };
  },

  /** One order in full. The number is trimmed and upper-cased server-side. */
  async get(orderNumber: string): Promise<ApiResponse<FoodOrderDetail | null>> {
    const res = await api.get<unknown>(`${BASE}/${encodeURIComponent(orderNumber)}`);
    const data = obj(obj(res.data).data);
    if (!res.success || !str(data.orderNumber)) return { ...res, data: null };
    return { ...res, data: normalizeDetail(data) };
  },

  /**
   * Say a website order has reached the diner.
   *
   * For when the diner has not pressed their own "Delivered" button — the
   * order is taken by the delivery boy, the diner was told, and nobody
   * confirmed. It ends the order (and marks a cash order paid), so it is the
   * Super Admin's and Admin's to press; the server refuses anyone else and
   * refuses an order it should not touch, with the sentence to show. Returns
   * the whole updated order, or null with the reason on the envelope.
   */
  async markDelivered(
    orderNumber: string,
    note?: string,
  ): Promise<ApiResponse<FoodOrderDetail | null>> {
    const res = await api.post<unknown>(
      `${BASE}/${encodeURIComponent(orderNumber)}/delivered`,
      note ? { note } : {},
    );
    const data = obj(obj(res.data).data);
    if (!res.success || !str(data.orderNumber)) return { ...res, data: null };
    return { ...res, data: normalizeDetail(data) };
  },

  /**
   * Send the money back through Razorpay.
   *
   * FULL AMOUNT, and no amount is sent: the gateway refunds the whole captured
   * payment and reports what it actually returned. There is no amount argument
   * here because there is nowhere on the order to record a partial one, and a
   * figure this console invented could disagree with what was captured — a
   * disagreement that would be settled in a student's bank account.
   *
   * `reason` is free text. It goes into the order's history and into Razorpay's
   * own notes, so it is the sentence somebody reads in the gateway six weeks
   * later trying to work out what this row was.
   */
  async refund(orderNumber: string, reason?: string): Promise<FoodRefundResponse> {
    const res = await api.post<unknown>(
      `${BASE}/${encodeURIComponent(orderNumber)}/refund`,
      reason ? { reason } : {},
    );
    return readRefundBody(res, orderNumber);
  },

  /**
   * Record a refund somebody made outside this app.
   *
   * It moves no money. It is a CLAIM that money moved — it takes the order out
   * of the queue and tells everybody afterwards that the debt is settled — so
   * the reference is required, and it is the only thing that will ever let
   * anybody match this order to the payment again.
   */
  async recordSettledRefund(
    orderNumber: string,
    reference: string,
    note?: string,
  ): Promise<FoodRefundResponse> {
    const res = await api.post<unknown>(
      `${BASE}/${encodeURIComponent(orderNumber)}/refund/settled`,
      { reference, ...(note ? { note } : {}) },
    );
    return readRefundBody(res, orderNumber);
  },
};

export default foodOrderService;
