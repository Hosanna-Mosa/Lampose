/* ══════════════════════════════════════════════════════════════════════════
   The Restaurant Admin console — the owner's side of the API.

   Reads `/v1/restaurant-admin`, which is a router of its own on the backend
   with a guard of its own and a token of its own. Nothing in this file
   touches `/v1/admin/*`: those are the STAFF surfaces, they answer to an
   `admins` token, and an owner's session would be refused by every one of
   them. The two consoles share a shell and a design system and nothing else.

   Every response here is already scoped to one restaurant — the one named in
   the token. No call in this file takes a restaurantId, and none should: an
   id sent from a browser is a request, not a fact, and the server decides
   whose orders these are.

   ## Shapes

   The order shape is the backend's `partnerView` — the same one the
   Food-Partner mobile app renders, minus the diner's delivery PIN and the
   gateway reference, both of which that view deletes on the way out. Typed
   here rather than in `api/types.ts` because that file describes the STAFF
   console's entities, and an order as a kitchen sees it is a different
   reading of the same row: it carries `pickupCode` and no commission, where
   the staff view carries commission and no pickup code.

   ## Errors carry a code

   `apiCaller` puts the server's own `code` on the envelope. Three of them
   matter to a screen here: INVALID_TRANSITION (the order moved under you —
   reload before trying again), ACCOUNT_REJECTED (a dead end, with the reason
   in `message`) and VALIDATION on a menu save, whose body also carries a
   per-field list. The callers read `code` rather than parsing English.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';
import type { ApiResponse } from '../types';

/*
 * Versioned in the path, deliberately.
 *
 * `VITE_API_BASE_URL` ends at `/api`, not `/api/v1`, so every path in this
 * console carries its own version. The unversioned aliases in
 * `routes/index.js` exist to keep callers written BEFORE versioning working —
 * which is why `authService` still says `/admin/login` — and this router was
 * given none: a new caller should not be handed a second spelling to drift
 * onto. The same reasoning `foodAdminService` and `foodOrderService` record.
 */
const BASE = '/v1/restaurant-admin';

/* ── The signed-in shop ───────────────────────────────────────────────── */

/** What the console stores at sign-in and renders its header from. */
export interface RestaurantProfile {
  restaurantId: string;
  restaurantName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  logoUrl: string;
  verificationStatus: 'pending' | 'approved' | 'rejected' | string;
  isActive: boolean;
  /** 'open' | 'closed' | 'auto' — 'auto' follows the opening-hours schedule. */
  openState: string;
  /** Derived from `openState` AND the schedule — what the header reads. */
  isCurrentlyOpen: boolean;
}

export interface RestaurantAdminSession {
  token: string;
  restaurant: RestaurantProfile;
}

/* ── Orders ───────────────────────────────────────────────────────────── */

export type FoodOrderStatus =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'rejected'
  | 'cancelled';

/**
 * What a kitchen may do to an order from each state — the client's copy of
 * `ALLOWED_PARTNER_TRANSITIONS`.
 *
 * Mirrored ONLY so a button that the server would refuse is never drawn. The
 * server enforces the same table on every call and answers INVALID_TRANSITION
 * when the two disagree, which is the case that matters: two people on two
 * devices working one order. This copy going stale shows the wrong button;
 * the server going stale would let the wrong thing happen, and it cannot.
 */
export const PARTNER_TRANSITIONS: Record<FoodOrderStatus, FoodOrderStatus[]> = {
  placed: ['accepted', 'rejected'],
  accepted: ['preparing', 'rejected'],
  preparing: ['ready'],
  ready: [],
  picked_up: [],
  delivered: [],
  rejected: [],
  cancelled: [],
};

/**
 * One line of an order, spelled as `orderLineSchema` spells it.
 *
 * `variantName` is a STRING, not the `{ name, price }` object a menu item's
 * variants are — the chosen portion is flattened into the line at placement,
 * because a line records what was ordered rather than what could have been.
 * Likewise `note` is singular. Both are '' rather than absent on a line that
 * has neither.
 */
export interface FoodOrderLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  variantName?: string;
  addOns?: { name: string; price: number }[];
  isVeg?: IsVeg;
  note?: string;
}

export interface RestaurantOrder {
  orderNumber: string;
  status: FoodOrderStatus;
  placedAt: string;
  lines: FoodOrderLine[];
  itemsTotal: number;
  packagingCharge: number;
  deliveryFee: number;
  discount: number;
  grandTotal: number;
  /** What the kitchen is owed once commission comes off. */
  partnerPayout: number;
  commissionRate: number;
  paymentMode: 'cod' | 'online' | string;
  paymentStatus: 'pending' | 'paid' | 'refunded' | 'failed' | string;
  /** The number the cook reads out at the pass. The diner's PIN never arrives. */
  pickupCode?: string;
  promisedMinutes?: number | null;
  rejectionReason?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  /** 'delivery' | 'pickup' — a pickup order never gets a rider. */
  fulfilment?: 'delivery' | 'pickup' | string;
  statusHistory?: { status: string; at: string; by: string }[];
  dispatch: { state: string; candidateCount: number; failureReason: string };
  rider: {
    name: string;
    phone: string;
    vehicle?: Record<string, unknown>;
    assignedAt: string | null;
    pickedUpAt: string | null;
  } | null;
}

/** The per-status tally the list returns beside its rows, for the tab badges. */
export type OrderStatusCounts = Partial<Record<FoodOrderStatus, number>>;

export interface OrderList {
  orders: RestaurantOrder[];
  counts: OrderStatusCounts;
}

/* ── Menu ─────────────────────────────────────────────────────────────── */

export type IsVeg = 'veg' | 'non-veg' | 'egg';
export type SpiceLevel = 'mild' | 'medium' | 'hot';

export interface MenuOption {
  name: string;
  price: number;
}

export interface MenuItem {
  productId: string;
  restaurantId: string;
  productName: string;
  category: string;
  description: string;
  isVeg: IsVeg;
  price: number;
  /** `null` when there is no offer — never 0, which the model keeps distinct. */
  discountedPrice: number | null;
  isAvailable: boolean;
  productImage?: { url: string; publicId?: string };
  galleryImages?: { url: string; publicId?: string }[];
  variants?: MenuOption[];
  addOns?: MenuOption[];
  spiceLevel: SpiceLevel | null;
  serves?: number;
  tags?: string[];
  allergenInfo?: string[];
  calories?: number | null;
  preparationTime?: number | null;
  displayOrder?: number;
}

export interface MenuList {
  items: MenuItem[];
  /** How many are switched off — the headline above the list. */
  unavailable: number;
}

/** Only what a form sends. The server whitelists again; this keeps it honest. */
export interface MenuItemInput {
  productName?: string;
  category?: string;
  description?: string;
  isVeg?: IsVeg;
  price?: number;
  discountedPrice?: number | null;
  spiceLevel?: SpiceLevel | null;
  serves?: number;
  preparationTime?: number | null;
  calories?: number | null;
  tags?: string[];
  allergenInfo?: string[];
  variants?: MenuOption[];
  addOns?: MenuOption[];
  isAvailable?: boolean;
  productImage?: { url: string; publicId?: string } | null;
  galleryImages?: { url: string; publicId?: string }[];
}

/* ── Analytics ────────────────────────────────────────────────────────── */

/** One day in the window. Every day is present, including the empty ones —
 *  the server fills the gaps, because a column chart that closes them makes a
 *  quiet Tuesday look like a Tuesday that did not happen. */
export interface AnalyticsDay {
  /** `YYYY-MM-DD`. */
  date: string;
  orders: number;
  delivered: number;
  /** What the kitchen earned that day, from delivered orders only. */
  earnings: number;
  /** What diners paid that day, fees included. */
  gross: number;
}

export interface AnalyticsTotals {
  placed: number;
  delivered: number;
  orders: number;
  earnings: number;
  gross: number;
  /** The kitchen's own revenue before commission. */
  items: number;
  /** `null`, not 0, when nothing was delivered — see the controller. */
  averageOrder: number | null;
  /** Delivered ÷ concluded. `null` when nothing has concluded yet. */
  fulfilmentRate: number | null;
}

export interface TopDish {
  productName: string;
  quantity: number;
  revenue: number;
  orders: number;
}

export interface RestaurantAnalytics {
  days: number;
  since: string;
  series: AnalyticsDay[];
  /** All twenty-four, so the chart can be read against a clock. */
  hours: { hour: number; orders: number }[];
  status: OrderStatusCounts;
  totals: AnalyticsTotals;
  topDishes: TopDish[];
  payment: {
    cash: { orders: number; earnings: number };
    online: { orders: number; earnings: number };
  };
}

/* ── Earnings ─────────────────────────────────────────────────────────── */

/**
 * NOT a payout statement — see the route's own header.
 *
 * There is no food settlement ledger in this system: nothing records that a
 * restaurant was actually paid. These are earnings. The `note` the server
 * sends says so, and the page repeats it on screen, because the person
 * reading it is the one who cannot check.
 */
export interface EarningsBucket {
  orders: number;
  earnings: number;
  /** What was taken from the diner in total, fees included. */
  collected: number;
  delivery: number;
  pickup: number;
}

export interface EarningsRow {
  orderNumber: string;
  placedAt: string;
  itemsTotal: number;
  deliveryFee: number;
  packagingCharge: number;
  grandTotal: number;
  partnerPayout: number;
  commissionRate: number;
  commission: number;
  paidBy: 'cash' | 'online';
  fulfilment: 'delivery' | 'pickup' | string;
}

export interface RestaurantEarnings {
  from: string;
  to: string;
  totals: {
    orders: number;
    items: number;
    gross: number;
    commission: number;
    earnings: number;
    effectiveRate: number | null;
  };
  /** Kept apart rather than netted: the two settle in opposite directions. */
  paidBy: { online: EarningsBucket; cash: EarningsBucket };
  ledger: EarningsRow[];
  ledgerLimit: number;
  ledgerTruncated: boolean;
  note: string;
}

/* ── Payout accounts ──────────────────────────────────────────────────── */

/**
 * A saved bank account. The full number is never sent to a browser — it is
 * `select: false` on the model and `toJSON` deletes it again — so every
 * screen works from `accountLast4`.
 */
export interface PayoutAccount {
  accountId: string;
  label: string;
  accountHolderName: string;
  accountLast4: string;
  ifscCode: string;
  accountType: 'savings' | 'current' | string;
  upiId: string;
  /** Exactly one saved account is active: the one settlements go to. */
  isActive: boolean;
  addedAt: string | null;
}

export interface PayoutAccountList {
  accounts: PayoutAccount[];
  maxAccounts: number;
}

/** What the add form sends. The full number goes up once and never returns. */
export interface PayoutAccountInput {
  accountHolderName: string;
  bankAccountNumber: string;
  /** Compared against the number server-side; a mismatch is a 400. */
  confirmAccountNumber: string;
  ifscCode: string;
  accountType: 'savings' | 'current';
  label?: string;
  upiId?: string;
  /** The first account saved is active regardless — the server decides that. */
  makeActive?: boolean;
}

/* ── Payout requests ──────────────────────────────────────────────────── */

export type FoodPayoutStatus = 'pending' | 'paid' | 'rejected';

/**
 * What a kitchen can ask for, and what it cannot.
 *
 * `available` is deliberately NOT the same as the Earnings page's total.
 * Lampose can only send money it is holding, so an order where the diner
 * collected at the counter and paid cash is excluded — that money went
 * straight into the restaurant's own till. `collectedByYou` reports exactly
 * that amount so the difference between the two screens is explained rather
 * than left as a discrepancy.
 */
export interface PayoutBalance {
  available: number;
  availableOrders: number;
  /** Already requested and not yet settled. */
  pending: number;
  pendingRequests: number;
  /** Cash the restaurant took at its own counter — never payable by us. */
  collectedByYou: number;
  collectedByYouOrders: number;
  /** Accepted, cooking or on a bike. Real, but not earned yet. */
  inProgress: number;
  inProgressOrders: number;
}

export interface FoodPayout {
  payoutId: string;
  restaurantId: string;
  restaurantName: string;
  amount: number;
  status: FoodPayoutStatus;
  orderCount: number;
  orderNumbers: string[];
  /** A snapshot taken when the request was made, not a live reference. */
  account: {
    accountId?: string;
    label?: string;
    accountHolderName?: string;
    accountLast4?: string;
    ifscCode?: string;
    accountType?: string;
    upiId?: string;
  };
  requestedAt: string;
  paidAt: string | null;
  /** The bank's transfer reference, once a person has recorded it. */
  reference: string;
  paidByAdminName: string;
  rejectionReason: string;
  rejectedAt: string | null;
}

export interface PayoutOverview {
  balance: PayoutBalance;
  /** The floor, from the server, so the button and the API agree. */
  minimum: number;
  history: FoodPayout[];
}

/* ── The shop record ──────────────────────────────────────────────────── */

export interface RestaurantAddress {
  line1: string;
  line2: string;
  city: string;
  state: string;
  district: string;
  pincode: string;
  landmark: string;
}

/**
 * The full record behind `GET /me`.
 *
 * Loosely typed on purpose where it is only ever displayed: this is the
 * model's own document, it carries forty fields, and typing every one of them
 * here would be a second schema to keep in step for no gain. The fields a
 * screen reads or writes are named; the rest travel through.
 */
export interface RestaurantRecord {
  restaurantId: string;
  restaurantName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  description: string;
  contactNumber: string;
  cuisineTypes: string[];
  address: Partial<RestaurantAddress>;
  fssaiLicenseNumber: string;
  gstNumber: string;
  openState: string;
  isActive: boolean;
  verificationStatus: string;
  verificationNote: string;
  avgPreparationTime: number;
  minOrderValue: number;
  packagingCharge: number;
  deliveryRadiusKm: number;
  acceptsCod: boolean;
  acceptsOnlinePayment: boolean;
  logoImage?: { url: string; publicId?: string };
  openingHours?: { day: string; openTime: string; closeTime: string }[];
  [key: string]: unknown;
}

export interface RestaurantMe {
  restaurant: RestaurantRecord;
  menuItemCount: number;
  isCurrentlyOpen: boolean;
}

/**
 * What an owner may change about their own shop.
 *
 * Deliberately a short list, and the short list is the SERVER's. Its
 * `RE_VERIFICATION_FIELDS` refuses the trading name, the address, the
 * licences and the payout account from a session: the licence names a
 * business at an address, so a name an owner could edit after approval would
 * silently invalidate the check somebody performed on the papers — and a
 * session that can repoint the payout account is the whole of that attack.
 * Those changes go through Lampose. This type names only what will actually
 * be accepted, so the form cannot offer a field that is going to 403.
 */
export interface ShopSettingsInput {
  description?: string;
  contactNumber?: string;
  avgPreparationTime?: number;
  minOrderValue?: number;
  packagingCharge?: number;
  acceptsCod?: boolean;
  acceptsOnlinePayment?: boolean;
}

/* ── The day at a glance ──────────────────────────────────────────────── */

export interface RestaurantSummary {
  restaurant: {
    restaurantId: string;
    restaurantName: string;
    logoUrl: string;
    verificationStatus: string;
    isActive: boolean;
    openState: string;
    isCurrentlyOpen: boolean;
  };
  live: {
    newOrders: number;
    inKitchen: number;
    awaitingPickup: number;
    onTheWay: number;
    byStatus: OrderStatusCounts;
  };
  today: {
    placed: number;
    delivered: number;
    rejected: number;
    cancelled: number;
    byStatus: OrderStatusCounts;
    gross: number;
    earnings: number;
    commissionRate: number;
  };
  menu: { total: number; outOfStock: number; available: number };
  since: string;
}

/* ══════════════════════════════════════════════════════════════════════════
   The calls
   ══════════════════════════════════════════════════════════════════════════ */

export const restaurantAdminService = {
  /**
   * Sign in with the same email-or-phone and password the Food-Partner app
   * uses. One field for both, because the owner types whichever they
   * remember and the server decides which it is from the `@`.
   */
  async login(identifier: string, password: string): Promise<ApiResponse<RestaurantAdminSession>> {
    const res = await api.post<{ data: RestaurantAdminSession }>(`${BASE}/login`, {
      identifier,
      password,
    });
    return res.success
      ? { ...res, data: res.data?.data as RestaurantAdminSession }
      : { ...res, data: null as unknown as RestaurantAdminSession };
  },

  /** The opening screen: what needs a person now, and how the day has gone. */
  async summary(): Promise<ApiResponse<RestaurantSummary | null>> {
    const res = await api.get<{ data: RestaurantSummary }>(`${BASE}/summary`);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /**
   * This shop's orders, newest first.
   *
   * `status` accepts a comma-joined list because the console's tabs are
   * groups rather than single states — "In the kitchen" is
   * `accepted,preparing`. The server takes the same two shapes.
   */
  async orders(params: { status?: string; limit?: number } = {}): Promise<ApiResponse<OrderList>> {
    const res = await api.get<{ data: RestaurantOrder[]; counts: OrderStatusCounts }>(
      `${BASE}/orders`,
      params
    );
    return res.success
      ? { ...res, data: { orders: res.data?.data ?? [], counts: res.data?.counts ?? {} } }
      : { ...res, data: { orders: [], counts: {} } };
  },

  async order(orderNumber: string): Promise<ApiResponse<RestaurantOrder | null>> {
    const res = await api.get<{ data: RestaurantOrder }>(`${BASE}/orders/${orderNumber}`);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /**
   * Move one order forward.
   *
   * This is the call with consequences behind it — the server starts the
   * rider search on `accepted`, cancels the dispatch and flags the money on
   * `rejected`, re-broadcasts on `ready`. `reason` is recorded on a rejection
   * and `promisedMinutes` is the kitchen's own quote, which is what sizes the
   * radius riders are called from.
   */
  async setOrderStatus(
    orderNumber: string,
    status: FoodOrderStatus,
    extra: { reason?: string; promisedMinutes?: number } = {}
  ): Promise<ApiResponse<RestaurantOrder | null>> {
    const res = await api.patch<{ data: RestaurantOrder }>(
      `${BASE}/orders/${orderNumber}/status`,
      { status, ...extra }
    );
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /* ── Menu ───────────────────────────────────────────────────────────── */

  async menu(): Promise<ApiResponse<MenuList>> {
    const res = await api.get<{ data: MenuItem[]; unavailable: number }>(`${BASE}/menu`);
    return res.success
      ? { ...res, data: { items: res.data?.data ?? [], unavailable: res.data?.unavailable ?? 0 } }
      : { ...res, data: { items: [], unavailable: 0 } };
  },

  async createMenuItem(input: MenuItemInput): Promise<ApiResponse<MenuItem | null>> {
    const res = await api.post<{ data: MenuItem }>(`${BASE}/menu`, input);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  async updateMenuItem(
    productId: string,
    input: MenuItemInput
  ): Promise<ApiResponse<MenuItem | null>> {
    const res = await api.patch<{ data: MenuItem }>(`${BASE}/menu/${productId}`, input);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /**
   * In stock or out of stock.
   *
   * The STATE is sent rather than a toggle, matching the server: a toggle is
   * decided by whatever the server holds when it arrives, so a double click
   * or a retry on a poor connection lands somewhere nobody chose.
   */
  async setMenuItemAvailability(
    productId: string,
    isAvailable: boolean
  ): Promise<ApiResponse<MenuItem | null>> {
    const res = await api.patch<{ data: MenuItem }>(`${BASE}/menu/${productId}/availability`, {
      isAvailable,
    });
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  async deleteMenuItem(productId: string): Promise<ApiResponse<unknown>> {
    return api.delete(`${BASE}/menu/${productId}`);
  },

  /* ── Analytics and earnings ─────────────────────────────────────────── */

  /** The shape of the trade over a window of days. */
  async analytics(days = 30): Promise<ApiResponse<RestaurantAnalytics | null>> {
    const res = await api.get<{ data: RestaurantAnalytics }>(`${BASE}/analytics`, { days });
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /**
   * What the shop earned in a period, order by order.
   *
   * `from` and `to` are `YYYY-MM-DD`. Both are optional and default to the
   * last thirty days on the server; a date it cannot read is a 400 rather
   * than a silent fallback to "everything", because a statement covering a
   * period nobody asked for looks right and is not.
   */
  async earnings(range: { from?: string; to?: string } = {}): Promise<ApiResponse<RestaurantEarnings | null>> {
    const res = await api.get<{ data: RestaurantEarnings }>(`${BASE}/earnings`, range);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /* ── Payout requests ────────────────────────────────────────────────── */

  /** The balance, the floor, and everything asked for so far. */
  async payouts(): Promise<ApiResponse<PayoutOverview | null>> {
    const res = await api.get<{ data: PayoutOverview }>(`${BASE}/payouts`);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /**
   * Ask Lampose for the balance.
   *
   * Moves no money — it reserves what is owed and puts a row in front of a
   * person, who makes the transfer and records the reference.
   *
   * `accountId` names which saved account this one payout goes to, so an
   * owner can send a single payout elsewhere without changing their standing
   * preference. Omitted, it goes to the active account. Naming an account
   * that is not theirs is a 404 rather than a quiet fall back to the active
   * one — which would pay the right person at the wrong bank and tell them
   * it went where they asked.
   *
   * Refusals worth branching on: NOTHING_TO_PAY_OUT, BELOW_MINIMUM,
   * REQUEST_ALREADY_OPEN, NO_PAYOUT_ACCOUNT.
   */
  async requestPayout(accountId?: string): Promise<ApiResponse<FoodPayout | null>> {
    const res = await api.post<{ data: FoodPayout }>(
      `${BASE}/payouts/request`,
      accountId ? { accountId } : {}
    );
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /* ── Payout accounts ────────────────────────────────────────────────── */

  /**
   * The saved accounts, active one first.
   *
   * These are their OWN routes rather than part of `updateProfile`, and
   * deliberately: `PATCH /me` refuses `payout` outright — it sits in the
   * server's `RE_VERIFICATION_FIELDS` beside the trading name and the FSSAI
   * licence — and that refusal still stands. Repointing settlements is
   * reachable only by asking for it by name.
   */
  async payoutAccounts(): Promise<ApiResponse<PayoutAccountList>> {
    const res = await api.get<{ data: PayoutAccount[]; maxAccounts: number }>(
      `${BASE}/payout-accounts`
    );
    return res.success
      ? { ...res, data: { accounts: res.data?.data ?? [], maxAccounts: res.data?.maxAccounts ?? 8 } }
      : { ...res, data: { accounts: [], maxAccounts: 8 } };
  },

  async addPayoutAccount(input: PayoutAccountInput): Promise<ApiResponse<PayoutAccount | null>> {
    const res = await api.post<{ data: PayoutAccount }>(`${BASE}/payout-accounts`, input);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /** Send future settlements to this account instead. Idempotent. */
  async activatePayoutAccount(accountId: string): Promise<ApiResponse<PayoutAccount | null>> {
    const res = await api.patch<{ data: PayoutAccount }>(
      `${BASE}/payout-accounts/${accountId}/activate`
    );
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /**
   * Remove a saved account.
   *
   * The server refuses to remove the ACTIVE one while another could take its
   * place (409 ACCOUNT_IS_ACTIVE) — deleting it would leave the platform
   * paying into an account the owner has just disowned. Removing the last
   * one is allowed and clears the payout details with it.
   */
  async removePayoutAccount(accountId: string): Promise<ApiResponse<unknown>> {
    return api.delete(`${BASE}/payout-accounts/${accountId}`);
  },

  /* ── The shop ───────────────────────────────────────────────────────── */

  /** The whole record, for the Shop screen. */
  async profile(): Promise<ApiResponse<RestaurantMe | null>> {
    const res = await api.get<{ data: RestaurantMe }>(`${BASE}/me`);
    return res.success ? { ...res, data: res.data?.data ?? null } : { ...res, data: null };
  },

  /** Change the few things an owner owns — see `ShopSettingsInput`. */
  async updateProfile(input: ShopSettingsInput): Promise<ApiResponse<unknown>> {
    return api.patch(`${BASE}/me`, input);
  },

  /**
   * Open the kitchen, close it, or hand it back to the schedule.
   *
   * Three states rather than a boolean, and the server refuses a boolean on
   * purpose: `auto` means "follow the opening hours", and mapping `true` to
   * `open` would pin a kitchen open until somebody noticed.
   */
  async setOpenState(openState: 'open' | 'closed' | 'auto'): Promise<ApiResponse<unknown>> {
    return api.patch(`${BASE}/me/availability`, { openState });
  },

  /** Photographs for a dish. Returns what the menu save should send back. */
  async uploadImages(files: File[]): Promise<ApiResponse<{ images?: { url: string; publicId: string }[] }>> {
    const form = new FormData();
    files.forEach((file) => form.append('images', file));
    return api.upload(`${BASE}/uploads/images`, form);
  },
};
