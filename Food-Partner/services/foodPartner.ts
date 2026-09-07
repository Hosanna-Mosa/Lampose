/* ══════════════════════════════════════════════════════════════════════════
   The food-partner endpoints, and the payload the backend is handed.

   These call the ONE Lampose backend at /api/v2/food-partners. Nothing here
   invents a second server — see the repo's CLAUDE.md.

   ## Real data only

   There is no simulation layer and no fallback. Every function here either
   reaches the backend or throws, and the screen that called it shows the real
   reason. An earlier revision of this file faked responses when the server was
   unreachable so the flow could be walked without one; that is gone, because a
   partner app that invents a menu or an approval teaches a restaurant to trust
   something that is not in the database.

   With EXPO_PUBLIC_API_URL unset, `api()` throws a named error saying exactly
   that, which is the honest failure rather than a convincing one.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from "./api";
import { uploadApplicationImages, type UploadProgress } from "./uploads";
import type { MenuItem, OnboardingData } from "@/store/partnerStore";

const BASE = "/api/v2/food-partners";

const num = (value: string | number | undefined | null): number | undefined => {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * A file, as the backend stores it.
 *
 * ONLY an `https` url is passed on. The backend's sanitiser accepts `uri` as an
 * alias for `url`, so handing it a local `file:///…` path would store that path
 * verbatim and every image would 404 for everyone but the phone that picked it.
 * Uploading happens first, in `services/uploads.ts`; anything still local by
 * the time it reaches here travels as a filename only.
 */
const remoteUrl = (file: { url?: string } | null): string | null =>
  file?.url && /^https?:\/\//.test(file.url) ? file.url : null;

const named = (file: { name: string; url?: string; publicId?: string } | null) => {
  if (!file) return null;
  const url = remoteUrl(file);
  return { fileName: file.name, ...(url ? { url, publicId: file.publicId ?? "" } : null) };
};

/** An image field: `{ url, publicId }` when uploaded, otherwise nothing. */
const image = (file: { url?: string; publicId?: string } | null) => {
  const url = remoteUrl(file);
  return url ? { url, publicId: file?.publicId ?? "" } : null;
};

/* ── The payload ─────────────────────────────────────────────────────────── */

/**
 * `OnboardingData` rearranged into the shape the backend stores.
 *
 * Names match the food_restaurants schema exactly. Numbers are sent as numbers
 * rather than the strings the form holds, and the per-day slot map is
 * flattened into the `openingHours` array the model persists — a day appears
 * more than once when a kitchen closes between meals.
 */
export const buildApplicationPayload = (d: OnboardingData) => ({
  restaurantName: d.restaurantName.trim(),
  ownerName: d.ownerName.trim(),
  ownerPhone: `+91${d.phone}`,
  ownerEmail: d.ownerEmail.trim().toLowerCase(),
  password: d.password,
  description: d.description.trim(),
  cuisineTypes: d.cuisineTypes,
  logoImage: image(d.logoImage),
  coverBannerImage: image(d.coverBannerImage),

  address: {
    line1: d.addressLine1.trim(),
    line2: d.addressLine2.trim(),
    city: d.city.trim(),
    state: d.state.trim(),
    pincode: d.pincode,
    landmark: d.landmark.trim(),
  },
  latitude: num(d.lat),
  longitude: num(d.lng),
  contactNumber: `+91${d.sameAsOwner ? d.phone : d.contactNumber}`,

  openingHours: d.days.flatMap((day) =>
    (d.slots[day] || []).map((s) => ({ day, openTime: s.open, closeTime: s.close })),
  ),
  openState: d.openState,
  avgPreparationTime: d.avgPreparationTime,
  deliveryRadiusKm: d.deliveryRadiusKm,
  minOrderValue: num(d.minOrderValue) ?? 0,
  packagingCharge: num(d.packagingCharge) ?? 0,
  deliveryFee: {
    type: d.deliveryFeeType,
    amount: num(d.deliveryFeeAmount) ?? 0,
    perKm: num(d.deliveryFeePerKm) ?? 0,
    freeAboveValue: num(d.deliveryFreeAboveValue) ?? 0,
  },
  acceptsOnlinePayment: d.acceptsOnlinePayment,
  acceptsCod: d.acceptsCod,

  fssaiLicenseNumber: d.fssai,
  fssaiExpiry: d.fssaiExpiry,
  gstNumber: d.gstExempt ? "" : d.gstin,
  gstExempt: d.gstExempt,
  panNumber: d.pan,
  payout: {
    accountHolderName: d.accountHolderName.trim(),
    bankAccountNumber: d.account,
    ifscCode: d.ifsc,
    accountType: d.accountType,
    upiId: d.upiId.trim(),
  },
  documents: [
    { kind: "fssai", number: d.fssai, expiry: d.fssaiExpiry, ...named(d.fssaiFile) },
    ...(d.gstExempt ? [] : [{ kind: "gst", number: d.gstin, ...named(d.gstFile) }]),
    { kind: "pan", number: d.pan, ...named(d.panFile) },
    { kind: "cheque", ...named(d.chequeFile) },
    ...(d.menuFile ? [{ kind: "menu_sheet", ...named(d.menuFile) }] : []),
  ],

  contract: { accepted: d.accepted, signature: d.signature.trim() },

  products: productsFrom(d),
});

/** Both menu routes flatten into the same product list the backend stores. */
const productsFrom = (d: OnboardingData) => {
  if (d.menuMode === "upload") {
    return d.menuRows.map((row, i) => ({
      productName: row.itemName,
      category: row.category || "Menu",
      description: row.description,
      price: num(row.price) ?? 0,
      isVeg: /non/i.test(row.itemType) ? "non-veg" : /egg/i.test(row.itemType) ? "egg" : "veg",
      tags: row.isBestseller ? ["Bestseller"] : [],
      productImage: image(row.image),
      isAvailable: true,
      displayOrder: i,
    }));
  }

  return d.menuCategories.flatMap((category) =>
    category.items.map((item, i) => ({
      productName: item.productName,
      category: category.name,
      description: item.description,
      price: num(item.price) ?? 0,
      discountedPrice: num(item.discountedPrice),
      isVeg: item.isVeg,
      isAvailable: item.isAvailable,
      productImage: image(item.productImage),
      galleryImages: item.galleryImages.map(image).filter(Boolean),
      variants: item.variants.map((v) => ({ name: v.name, price: num(v.price) ?? 0 })),
      addOns: item.addOns.map((a) => ({ name: a.name, price: num(a.price) ?? 0 })),
      spiceLevel: item.spiceLevel === "none" ? null : item.spiceLevel,
      serves: num(item.serves),
      tags: item.tags,
      allergenInfo: item.allergenInfo,
      calories: num(item.calories),
      preparationTime: num(item.preparationTime),
      displayOrder: i,
    })),
  );
};

/* ── What the backend gives back ─────────────────────────────────────────── */

export type ServerImage = { url?: string; publicId?: string } | null;

export type ServerProduct = {
  productId: string;
  restaurantId: string;
  productName: string;
  category: string;
  description: string;
  price: number;
  discountedPrice?: number | null;
  isVeg: "veg" | "non-veg" | "egg";
  isAvailable: boolean;
  productImage?: ServerImage;
  galleryImages?: { url?: string; publicId?: string }[];
  variants?: { name: string; price: number }[];
  addOns?: { name: string; price: number }[];
  spiceLevel?: string | null;
  serves?: number | null;
  tags?: string[];
  allergenInfo?: string[];
  calories?: number | null;
  preparationTime?: number | null;
  displayOrder?: number;
};

export type ServerRestaurant = {
  restaurantId: string;
  restaurantName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  description?: string;
  cuisineTypes?: string[];
  logoImage?: ServerImage;
  coverBannerImage?: ServerImage;
  address?: Record<string, string>;
  contactNumber?: string;
  openingHours?: { day: string; openTime: string; closeTime: string }[];
  openState?: "auto" | "open" | "closed";
  isCurrentlyOpen?: boolean;
  avgPreparationTime?: number;
  deliveryRadiusKm?: number;
  minOrderValue?: number;
  packagingCharge?: number;
  deliveryFee?: { type?: string; amount?: number; perKm?: number; freeAboveValue?: number };
  acceptsOnlinePayment?: boolean;
  acceptsCod?: boolean;
  verificationStatus: "pending" | "approved" | "rejected";
  verificationNote?: string;
  isActive?: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  payout?: { accountLast4?: string; ifscCode?: string; accountHolderName?: string; upiId?: string };
  fssaiLicenseNumber?: string;
  gstNumber?: string;
  panNumber?: string;
};

export type ServerOrder = {
  orderNumber: string;
  restaurantId: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  lines: {
    productName: string;
    variantName?: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    isVeg?: string;
    note?: string;
  }[];
  itemsTotal: number;
  packagingCharge: number;
  deliveryFee: number;
  grandTotal: number;
  partnerPayout: number;
  paymentMode: "online" | "cod";
  paymentStatus: string;
  status: string;
  /**
   * The rider search, which runs BESIDE `status` rather than inside it — an
   * order is being cooked and looked for at the same time.
   *
   * The kitchen mostly needs one thing from it: whether somebody is coming to
   * collect. `unassigned` means every rider nearby said no, and the server
   * tries again the moment this order is marked ready — which is worth saying
   * on the card, because a cook who plates food nobody is coming for has made
   * a decision on bad information.
   */
  dispatch?: {
    state: "idle" | "searching" | "assigned" | "unassigned";
    candidateCount?: number;
    failureReason?: string;
  };
  /** Null until a rider accepts. */
  rider?: {
    name: string;
    phone: string;
    vehicle?: { type?: string; model?: string; plate?: string };
    assignedAt?: string | null;
    pickedUpAt?: string | null;
  } | null;
  /**
   * The four digits the cook reads out to the rider at the pass.
   *
   * Not a credential — it opens nothing. It is a value the two of them
   * COMPARE, and the rider's app posts it to prove the hand-over happened
   * where both people were standing.
   */
  pickupCode?: string;
  promisedMinutes?: number;
  rejectionReason?: string;
  placedAt: string;
};

type Envelope<T> = { success: boolean; data: T; message?: string };

/* ── Onboarding ──────────────────────────────────────────────────────────── */

export const startPhoneOtp = (phone: string) =>
  api<Envelope<unknown>>(`${BASE}/auth/otp/start`, { method: "POST", body: { phone } });

/**
 * The backend answers `{ success, data: { verificationToken, ... } }` — the
 * token is NESTED, same as `login` and `submitApplication` below. Read either
 * shape rather than assuming which, so an older build that ever answered flat
 * still works. Getting this wrong is silent: the caller still gets an object
 * back, just one whose `verificationToken` is `undefined`, and every step
 * after it (including the final submit) fails on a proof that was never
 * there — see `contract.tsx`'s send().
 */
export const verifyPhoneOtp = async (phone: string, code: string) => {
  const res = await api<Envelope<{ verificationToken: string }> & { verificationToken: string }>(
    `${BASE}/auth/otp/verify`,
    { method: "POST", body: { phone, code } },
  );
  return (res.data ?? res) as { verificationToken: string };
};

export type SubmitResult = { restaurantId: string; token: string; verificationStatus: string };

/**
 * The whole application, images and all.
 *
 * Every picture goes to Cloudinary FIRST and the payload is built from what
 * comes back, so the row written to Mongo carries real links rather than paths
 * that only mean something on the phone that chose them. An upload that fails
 * fails the submit — a restaurant listed with broken images is worse than one
 * that told its owner to try again.
 */
export const submitApplication = async (
  data: OnboardingData,
  verificationToken?: string | null,
  onProgress?: (p: UploadProgress) => void,
): Promise<SubmitResult> => {
  const withImages = await uploadApplicationImages(data, verificationToken, onProgress);
  const payload = buildApplicationPayload(withImages);
  const res = await api<Envelope<SubmitResult> & SubmitResult>(`${BASE}/applications`, {
    method: "POST",
    body: payload,
    token: verificationToken ?? undefined,
  });
  /* The backend answers `{ success, data: {...} }`; older builds answered the
     object flat. Read either rather than making the app depend on which. */
  return (res.data ?? res) as SubmitResult;
};

/* ── The session ─────────────────────────────────────────────────────────── */

export type LoginResult = { token: string; restaurant: ServerRestaurant };

export const login = async (identifier: string, password: string): Promise<LoginResult> => {
  const res = await api<Envelope<LoginResult> & LoginResult>(`${BASE}/auth/login`, {
    method: "POST",
    body: { identifier, password },
  });
  return (res.data ?? res) as LoginResult;
};

/**
 * The signed-in restaurant.
 *
 * `/me` answers `{ data: { restaurant, menuItemCount, isCurrentlyOpen } }` —
 * the restaurant is NESTED, and `isCurrentlyOpen` is repeated at the top level
 * because it is derived rather than stored. Flattened here so every screen
 * reads one object instead of each one remembering the envelope.
 */
export const getMe = async (token: string): Promise<ServerRestaurant & { menuItemCount: number }> => {
  const res = await api<Envelope<{
    restaurant: ServerRestaurant;
    menuItemCount: number;
    isCurrentlyOpen: boolean;
  }>>(`${BASE}/me`, { token });

  const { restaurant, menuItemCount, isCurrentlyOpen } = res.data;
  return { ...restaurant, isCurrentlyOpen, menuItemCount };
};

/* PATCH answers with the restaurant, but older builds wrapped it the same way
   `/me` does. Read either rather than depending on which. */
const unwrapRestaurant = (data: unknown): ServerRestaurant => {
  const d = data as { restaurant?: ServerRestaurant } & ServerRestaurant;
  return (d?.restaurant ?? d) as ServerRestaurant;
};

export const updateMe = async (token: string, patch: Record<string, unknown>) => {
  const res = await api<Envelope<unknown>>(`${BASE}/me`, { method: "PATCH", token, body: patch });
  return unwrapRestaurant(res.data);
};

export const setAvailability = async (token: string, openState: "auto" | "open" | "closed") => {
  const res = await api<Envelope<unknown>>(`${BASE}/me/availability`, {
    method: "PATCH",
    token,
    body: { openState },
  });
  return unwrapRestaurant(res.data);
};

/* ── The menu ────────────────────────────────────────────────────────────── */

export const listMyProducts = async (token: string): Promise<ServerProduct[]> => {
  const res = await api<Envelope<ServerProduct[]>>(`${BASE}/me/products`, { token });
  return Array.isArray(res.data) ? res.data : [];
};

/** The wire shape of a dish. Shared by create and update. */
export const productBody = (item: MenuItem, category: string) => ({
  productName: item.productName.trim(),
  category,
  description: item.description.trim(),
  price: num(item.price) ?? 0,
  discountedPrice: num(item.discountedPrice) ?? null,
  isVeg: item.isVeg,
  isAvailable: item.isAvailable,
  /* Uploaded URLs only — never `uri`. See `remoteUrl`. */
  productImage: image(item.productImage),
  galleryImages: item.galleryImages.map(image).filter(Boolean),
  variants: item.variants.filter((v) => v.name.trim()).map((v) => ({ name: v.name, price: num(v.price) ?? 0 })),
  addOns: item.addOns.filter((a) => a.name.trim()).map((a) => ({ name: a.name, price: num(a.price) ?? 0 })),
  spiceLevel: item.spiceLevel === "none" ? null : item.spiceLevel,
  serves: num(item.serves) ?? null,
  tags: item.tags,
  allergenInfo: item.allergenInfo,
  calories: num(item.calories) ?? null,
  preparationTime: num(item.preparationTime) ?? null,
});

export const createProduct = async (token: string, body: ReturnType<typeof productBody>) => {
  const res = await api<Envelope<ServerProduct>>(`${BASE}/me/products`, { method: "POST", token, body });
  return res.data;
};

export const updateProduct = async (
  token: string,
  productId: string,
  body: Partial<ReturnType<typeof productBody>>,
) => {
  const res = await api<Envelope<ServerProduct>>(`${BASE}/me/products/${productId}`, {
    method: "PATCH",
    token,
    body,
  });
  return res.data;
};

export const deleteProduct = (token: string, productId: string) =>
  api<Envelope<unknown>>(`${BASE}/me/products/${productId}`, { method: "DELETE", token });

export const setProductAvailability = async (token: string, productId: string, isAvailable: boolean) => {
  const res = await api<Envelope<ServerProduct>>(`${BASE}/me/products/${productId}/availability`, {
    method: "PATCH",
    token,
    body: { isAvailable },
  });
  return res.data;
};

/* ── Handsets ────────────────────────────────────────────────────────────── */

/**
 * Register this device for order alerts.
 *
 * Called on every sign-in and every cold start, because a push token can be
 * reissued at any time. The server upserts by token, so repeating it is the
 * ordinary case rather than a leak.
 */
export const registerDevice = (token: string, platform: string, session: string) =>
  api<Envelope<unknown>>(`${BASE}/me/devices`, {
    method: "POST",
    token: session,
    body: { token, platform },
  });

export const unregisterDevice = (token: string, session: string) =>
  api<Envelope<unknown>>(`${BASE}/me/devices`, {
    method: "DELETE",
    token: session,
    body: { token },
  });

/* ── Orders ──────────────────────────────────────────────────────────────── */

export type OrdersPage = { data: ServerOrder[]; counts: Record<string, number> };

export const listMyOrders = async (token: string, status?: string): Promise<OrdersPage> => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await api<{ success: boolean; data: ServerOrder[]; counts: Record<string, number> }>(
    `${BASE}/me/orders${query}`,
    { token },
  );
  return { data: Array.isArray(res.data) ? res.data : [], counts: res.counts || {} };
};

export const setOrderStatus = async (
  token: string,
  orderNumber: string,
  status: string,
  extra?: { reason?: string; promisedMinutes?: number },
) => {
  const res = await api<Envelope<ServerOrder>>(`${BASE}/me/orders/${orderNumber}/status`, {
    method: "PATCH",
    token,
    body: { status, ...extra },
  });
  return res.data;
};
