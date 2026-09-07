/* ══════════════════════════════════════════════════════════════════════════
   The application — five steps, one object.

   Everything the flow collects lives in a single `data` object rather than a
   hundred separate pieces of state. That shape is inherited from the website's
   onboarding page deliberately: a step screen is handed `data` and `set` and
   nothing else, the payload posted to the backend is that object rearranged,
   and adding a field is a line in INITIAL rather than a prop threaded through
   three components.

   It is persisted because a phone loses the foreground constantly — a photo
   picker, a permission sheet, an SMS, a call — and an application that
   evaporates when the OS reclaims the app is one nobody finishes.

   Attachments persist as plain objects (name + uri). A picker URI is all that
   survives a restart, which is fine: the files upload separately, and only
   their names travel with the application today.
   ══════════════════════════════════════════════════════════════════════════ */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DAYS } from "@/constants/partner";
import { uid } from "@/lib/uid";
import { disconnectOrderSocket } from "@/services/orderSocket";
import { releaseOrderSound } from "@/services/alertSound";
import { getPushToken } from "@/services/orderAlerts";
import { unregisterDevice } from "@/services/foodPartner";

// ─── Domain types ─────────────────────────────────────────────────────────────

export type Attachment = {
  name: string;
  uri: string;
  size?: number;
  mimeType?: string;
  /** Set once the file has been uploaded and has a remote home. */
  url?: string;
  publicId?: string;
};

/** "HH:MM", 24-hour. A day is a LIST of these: a kitchen that closes between
    meals has two, which is why this is not a single open/close pair. */
export type Slot = { open: string; close: string };

export type Variant = { id: string; name: string; price: string };
export type AddOn = { id: string; name: string; price: string };
export type SpiceLevel = "none" | "mild" | "medium" | "hot";
export type VegType = "veg" | "non-veg" | "egg";
export type DeliveryFeeType = "flat" | "distance_based" | "free_above";
export type OpenState = "auto" | "open" | "closed";
export type AccountType = "savings" | "current";

export type MenuItem = {
  id: string;
  productName: string;
  productImage: Attachment | null;
  galleryImages: Attachment[];
  description: string;
  category: string;
  isVeg: VegType;
  price: string;
  discountedPrice: string;
  isAvailable: boolean;
  variants: Variant[];
  addOns: AddOn[];
  spiceLevel: SpiceLevel;
  serves: string;
  tags: string[];
  allergenInfo: string[];
  calories: string;
  preparationTime: string;
  displayOrder: number;
};

export type MenuCategory = { id: string; name: string; items: MenuItem[] };

export type MenuRow = {
  id: string;
  category: string;
  itemName: string;
  price: string;
  description: string;
  itemType: string;
  isBestseller: boolean;
  image: Attachment | null;
};

/**
 * Where an application stands.
 *
 * `pending` / `approved` / `rejected` are the SERVER's three, verbatim from
 * `food_restaurants.verificationStatus` — the app must not invent a fourth,
 * because `syncFromServer` writes whatever the server says straight into this
 * field and anything the screens do not recognise renders as nothing. An
 * earlier revision had `submitted` and `under_review` here, which the backend
 * has never stored, and the status screen crashed the first time a real
 * `pending` arrived.
 *
 * `none` and `draft` are purely local: they describe a form that has not been
 * sent yet, which the server has no opinion about.
 */
export type ApplicationStatus = "none" | "draft" | "pending" | "approved" | "rejected";

/** The three the server can send. Anything else is not ours to display. */
const SERVER_STATUSES: ApplicationStatus[] = ["pending", "approved", "rejected"];

export const asApplicationStatus = (value: unknown): ApplicationStatus | null =>
  SERVER_STATUSES.includes(value as ApplicationStatus) ? (value as ApplicationStatus) : null;

export type Session = {
  restaurantId: string;
  restaurantName: string;
  ownerName: string;
  ownerEmail: string;
  token: string;
} | null;

/**
 * Proof that the owner's phone was verified, handed back by the OTP step and
 * spent on the application POST.
 *
 * Short-lived and deliberately NOT persisted: it is worth less than a session
 * and expires quickly, so carrying it across a restart would only ever produce
 * a confusing 401 halfway through a form.
 */
export type PhoneProof = string | null;

// ─── The application ──────────────────────────────────────────────────────────

export type OnboardingData = {
  /* ── Step 1 — Restaurant Information ─────────────────────────────────── */
  restaurantName: string;
  description: string;
  cuisineTypes: string[];
  logoImage: Attachment | null;
  coverBannerImage: Attachment | null;
  ownerName: string;
  ownerEmail: string;
  password: string;
  confirmPassword: string;
  phone: string;
  otpSent: boolean;
  otp: string;
  otpVerified: boolean;
  contactNumber: string;
  sameAsOwner: boolean;
  lat: string;
  lng: string;
  search: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string;

  /* ── Step 2 — Operations & Delivery ──────────────────────────────────── */
  days: string[];
  activeDay: string;
  slots: Record<string, Slot[]>;
  openState: OpenState;
  avgPreparationTime: number;
  deliveryRadiusKm: number;
  minOrderValue: string;
  packagingCharge: string;
  deliveryFeeType: DeliveryFeeType;
  deliveryFeeAmount: string;
  deliveryFeePerKm: string;
  deliveryFreeAboveValue: string;
  acceptsOnlinePayment: boolean;
  acceptsCod: boolean;

  /* ── Step 3 — Menu & Products ────────────────────────────────────────── */
  menuMode: "manual" | "upload";
  menuFile: Attachment | null;
  menuRows: MenuRow[];
  menuValid: boolean;
  menuError: string;
  menuCategories: MenuCategory[];

  /* ── Step 4 — Documents & Payout ─────────────────────────────────────── */
  fssai: string;
  fssaiExpiry: string;
  fssaiFile: Attachment | null;
  gstin: string;
  gstFile: Attachment | null;
  gstExempt: boolean;
  pan: string;
  panFile: Attachment | null;
  accountHolderName: string;
  account: string;
  accountConfirm: string;
  accountType: AccountType;
  ifsc: string;
  ifscVerified: boolean;
  upiId: string;
  chequeFile: Attachment | null;

  /* ── Step 5 — Contract & Review ──────────────────────────────────────── */
  accepted: boolean;
  signature: string;
};

const defaultSlots = (): Record<string, Slot[]> =>
  DAYS.reduce<Record<string, Slot[]>>((acc, day) => {
    acc[day] = [{ open: "09:00", close: "22:00" }];
    return acc;
  }, {});

export const INITIAL: OnboardingData = {
  restaurantName: "",
  description: "",
  cuisineTypes: [],
  logoImage: null,
  coverBannerImage: null,
  ownerName: "",
  ownerEmail: "",
  password: "",
  confirmPassword: "",
  phone: "",
  otpSent: false,
  otp: "",
  otpVerified: false,
  contactNumber: "",
  sameAsOwner: true,
  lat: "",
  lng: "",
  search: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",

  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  activeDay: "Monday",
  slots: defaultSlots(),
  openState: "auto",
  avgPreparationTime: 30,
  deliveryRadiusKm: 5,
  minOrderValue: "",
  packagingCharge: "",
  deliveryFeeType: "flat",
  deliveryFeeAmount: "",
  deliveryFeePerKm: "",
  deliveryFreeAboveValue: "",
  acceptsOnlinePayment: true,
  acceptsCod: true,

  menuMode: "manual",
  menuFile: null,
  menuRows: [],
  menuValid: false,
  menuError: "",
  menuCategories: [],

  fssai: "",
  fssaiExpiry: "",
  fssaiFile: null,
  gstin: "",
  gstFile: null,
  gstExempt: false,
  pan: "",
  panFile: null,
  accountHolderName: "",
  account: "",
  accountConfirm: "",
  accountType: "savings",
  ifsc: "",
  ifscVerified: false,
  upiId: "",
  chequeFile: null,

  accepted: false,
  signature: "",
};

// ─── Sample data ──────────────────────────────────────────────────────────────

/**
 * Realistic sample content, per step.
 *
 * This is a testing affordance and it is load-bearing: the application is well
 * over a hundred fields, and nobody types that twice on a phone to check that
 * a gate opens. Each step's sample is internally consistent and satisfies that
 * step's own gate, so the flow can be walked end to end in five taps.
 */
/**
 * A real, minimal JPEG as a data uri.
 *
 * It matters that this is genuine image bytes rather than a `sample://`
 * placeholder: sample content goes through the SAME Cloudinary upload as a
 * photograph off the camera, so filling a step with samples exercises the
 * whole image pipeline instead of quietly skipping it. It is a 1×1 pixel, so
 * it costs nothing to send.
 */
const SAMPLE_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

const sampleFile = (name: string, mimeType = "image/jpeg"): Attachment => ({
  name,
  uri: SAMPLE_JPEG,
  size: 160,
  mimeType,
});

const sampleItem = (
  category: string,
  productName: string,
  price: string,
  isVeg: VegType,
  extras: Partial<MenuItem> = {},
): MenuItem => ({
  id: uid(),
  productName,
  productImage: sampleFile(`${productName.toLowerCase().replace(/\W+/g, "_")}.jpg`),
  galleryImages: [],
  description: "",
  category,
  isVeg,
  price,
  discountedPrice: "",
  isAvailable: true,
  variants: [],
  addOns: [],
  spiceLevel: "none",
  serves: "",
  tags: [],
  allergenInfo: [],
  calories: "",
  preparationTime: "",
  displayOrder: 0,
  ...extras,
});

const SAMPLES: Record<number, () => Partial<OnboardingData>> = {
  1: () => ({
    restaurantName: "Paradise Biryani House",
    description: "Authentic Hyderabadi dum biryani, cooked to order",
    cuisineTypes: ["North Indian", "Mughlai", "South Indian"],
    logoImage: sampleFile("paradise_logo.jpg"),
    coverBannerImage: sampleFile("paradise_cover.jpg"),
    ownerName: "Ravi Kumar Reddy",
    ownerEmail: "ravi@paradisebiryani.in",
    password: "lampose123",
    confirmPassword: "lampose123",
    phone: "9876543210",
    otpSent: true,
    otp: "1234",
    otpVerified: true,
    sameAsOwner: false,
    contactNumber: "8912345670",
    lat: "17.7231",
    lng: "83.3012",
    search: "MVP Colony, Visakhapatnam",
    addressLine1: "Shop 42, Sunrise Towers",
    addressLine2: "Sector 4",
    city: "Visakhapatnam",
    state: "Andhra Pradesh",
    pincode: "530017",
    landmark: "Opposite the RTC complex",
  }),
  2: () => ({
    days: [...DAYS],
    activeDay: "Monday",
    slots: DAYS.reduce<Record<string, Slot[]>>((acc, day) => {
      acc[day] = [
        { open: "11:00", close: "15:30" },
        { open: "18:30", close: "23:00" },
      ];
      return acc;
    }, {}),
    openState: "auto",
    avgPreparationTime: 25,
    deliveryRadiusKm: 6,
    minOrderValue: "150",
    packagingCharge: "20",
    deliveryFeeType: "free_above",
    deliveryFeeAmount: "30",
    deliveryFreeAboveValue: "499",
    acceptsOnlinePayment: true,
    acceptsCod: true,
  }),
  3: () => ({
    menuMode: "manual",
    menuCategories: [
      {
        id: uid(),
        name: "Starters",
        items: [
          sampleItem("Starters", "Paneer Tikka", "220", "veg", {
            description: "Char-grilled cottage cheese, mint chutney",
            tags: ["Bestseller"],
            spiceLevel: "medium",
            serves: "2",
            allergenInfo: ["Dairy"],
            calories: "310",
            preparationTime: "15",
            variants: [
              { id: uid(), name: "Half", price: "220" },
              { id: uid(), name: "Full", price: "380" },
            ],
          }),
          sampleItem("Starters", "Chicken 65", "260", "non-veg", {
            description: "Andhra-style fried chicken, curry leaf tempering",
            spiceLevel: "hot",
            tags: ["Chef's Special"],
          }),
        ],
      },
      {
        id: uid(),
        name: "Rice & Biryani",
        items: [
          sampleItem("Rice & Biryani", "Hyderabadi Chicken Biryani", "320", "non-veg", {
            description: "Dum-cooked with long grain rice, served with raita",
            discountedPrice: "289",
            tags: ["Bestseller", "Must Try"],
            serves: "2",
            spiceLevel: "medium",
            preparationTime: "35",
            addOns: [
              { id: uid(), name: "Extra raita", price: "40" },
              { id: uid(), name: "Mirchi ka salan", price: "60" },
            ],
          }),
          sampleItem("Rice & Biryani", "Veg Dum Biryani", "240", "veg", { serves: "2" }),
        ],
      },
      {
        id: uid(),
        name: "Breads",
        items: [
          sampleItem("Breads", "Butter Naan", "60", "veg", { allergenInfo: ["Gluten", "Dairy"] }),
          sampleItem("Breads", "Tandoori Roti", "40", "veg", { allergenInfo: ["Gluten"] }),
        ],
      },
    ],
  }),
  4: () => ({
    pan: "ABCDE1234F",
    panFile: sampleFile("pan_card.jpg"),
    gstExempt: false,
    gstin: "37AAAAA0000A1Z5",
    gstFile: sampleFile("gst_certificate.jpg"),
    fssai: "12345678901234",
    /* Comfortably in the future, so the expiry warning on step 4 stays quiet
       for the happy path and only fires on a real problem. */
    fssaiExpiry: "2030-12-31",
    fssaiFile: sampleFile("fssai_licence.jpg"),
    accountHolderName: "Ravi Kumar Reddy",
    account: "912010012345678",
    accountConfirm: "912010012345678",
    accountType: "savings" as AccountType,
    ifsc: "HDFC0001234",
    ifscVerified: true,
    upiId: "paradisebiryani@okhdfcbank",
    chequeFile: sampleFile("cancelled_cheque.jpg"),
  }),
  5: () => ({ accepted: true, signature: "Ravi Kumar Reddy" }),
};

// ─── The store ────────────────────────────────────────────────────────────────

type PartnerState = {
  hydrated: boolean;
  data: OnboardingData;
  status: ApplicationStatus;
  submittedAt: string | null;
  restaurantId: string | null;
  verificationNote: string;
  session: Session;
  phoneProof: PhoneProof;
  submitting: boolean;
  submitError: string;

  patch: (next: Partial<OnboardingData>) => void;
  set: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  toggleInArray: (key: "cuisineTypes", value: string) => void;
  toggleDay: (day: string) => void;
  setSlots: (day: string, slots: Slot[]) => void;
  setRowImage: (rowId: string, image: Attachment | null) => void;

  addCategory: (name: string) => void;
  removeCategory: (categoryId: string) => void;
  saveItem: (categoryId: string, item: MenuItem) => void;
  removeItem: (categoryId: string, itemId: string) => void;

  fillSample: (step: number) => void;
  setStatus: (status: ApplicationStatus, note?: string) => void;
  setPhoneProof: (token: PhoneProof) => void;
  /** Fold a fresh `/me` response into the local view of the application. */
  syncFromServer: (r: {
    restaurantId: string;
    restaurantName: string;
    verificationStatus: ApplicationStatus | string;
    verificationNote?: string;
  }) => void;
  beginSubmit: () => void;
  finishSubmit: (result: { restaurantId: string; token: string } | null, error?: string) => void;
  signIn: (session: Session) => void;
  signOut: () => void;
  reset: () => void;
};

export const usePartnerStore = create<PartnerState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      data: INITIAL,
      status: "none",
      submittedAt: null,
      restaurantId: null,
      verificationNote: "",
      session: null,
      phoneProof: null,
      submitting: false,
      submitError: "",

      patch: (next) => set((s) => ({ data: { ...s.data, ...next } })),
      set: (key, value) => set((s) => ({ data: { ...s.data, [key]: value } })),

      toggleInArray: (key, value) =>
        set((s) => {
          const list = s.data[key];
          return {
            data: {
              ...s.data,
              [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
            },
          };
        }),

      /* Dropping the day the hours editor points at has to move it, or the
         editor is left editing something no longer selected. */
      toggleDay: (day) =>
        set((s) => {
          const days = s.data.days.includes(day)
            ? s.data.days.filter((d) => d !== day)
            : [...s.data.days, day];
          const activeDay = days.includes(s.data.activeDay) ? s.data.activeDay : days[0] ?? day;
          return { data: { ...s.data, days, activeDay } };
        }),

      setSlots: (day, slots) => set((s) => ({ data: { ...s.data, slots: { ...s.data.slots, [day]: slots } } })),

      setRowImage: (rowId, image) =>
        set((s) => ({
          data: { ...s.data, menuRows: s.data.menuRows.map((r) => (r.id === rowId ? { ...r, image } : r)) },
        })),

      addCategory: (name) =>
        set((s) => ({
          data: { ...s.data, menuCategories: [...s.data.menuCategories, { id: uid(), name, items: [] }] },
        })),

      removeCategory: (categoryId) =>
        set((s) => ({
          data: { ...s.data, menuCategories: s.data.menuCategories.filter((c) => c.id !== categoryId) },
        })),

      saveItem: (categoryId, item) =>
        set((s) => ({
          data: {
            ...s.data,
            menuCategories: s.data.menuCategories.map((c) => {
              if (c.id !== categoryId) return c;
              const exists = c.items.some((i) => i.id === item.id);
              return {
                ...c,
                items: exists
                  ? c.items.map((i) => (i.id === item.id ? item : i))
                  : /* A new item goes to the END of its category. Defaulting
                       displayOrder to 0 would silently jump it to the top. */
                    [...c.items, { ...item, displayOrder: c.items.length }],
              };
            }),
          },
        })),

      removeItem: (categoryId, itemId) =>
        set((s) => ({
          data: {
            ...s.data,
            menuCategories: s.data.menuCategories.map((c) =>
              c.id === categoryId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c,
            ),
          },
        })),

      fillSample: (step) => {
        const make = SAMPLES[step];
        if (!make) return;
        set((s) => ({ data: { ...s.data, ...make() } }));
      },

      setStatus: (status, note = "") => set({ status, verificationNote: note }),

      setPhoneProof: (token) => set({ phoneProof: token }),

      /* The server is the authority on where an application stands: an
         approval happens in the admin console, not on this device, so a
         locally-held status is only ever a cache of the last thing we were
         told. */
      syncFromServer: (r) =>
        set((s) => ({
          restaurantId: r.restaurantId,
          /* Validated rather than cast. A cast would let a status the app has
             no rendering for reach the screens, which is exactly how the
             status screen crashed on a real `pending`. */
          status: asApplicationStatus(r.verificationStatus) ?? s.status,
          verificationNote: r.verificationNote ?? "",
          session: s.session ? { ...s.session, restaurantName: r.restaurantName } : s.session,
        })),

      beginSubmit: () => set({ submitting: true, submitError: "" }),

      finishSubmit: (result, error) => {
        /* The proof is spent whichever way this went — a retry re-verifies. */
        if (!result) {
          set({ submitting: false, submitError: error || "We could not send that. Please try again." });
          return;
        }
        const { data } = get();
        set({
          submitting: false,
          submitError: "",
          phoneProof: null,
          status: "pending",
          submittedAt: new Date().toISOString(),
          restaurantId: result.restaurantId,
          session: {
            restaurantId: result.restaurantId,
            restaurantName: data.restaurantName,
            ownerName: data.ownerName,
            ownerEmail: data.ownerEmail,
            token: result.token,
          },
        });
      },

      signIn: (session) => set({ session }),
      signOut: () => {
        /* ── The two ways a counter tablet keeps ringing for the last kitchen
           ─────────────────────────────────────────────────────────────────

           The SOCKET is the one that stops here and now: left open it keeps
           the previous partner's room joined, so the next restaurant to sign
           in on that device would hear somebody else's orders arrive.

           The PUSH REGISTRATION is the one that outlives the app being closed.
           The server sends an order to every device token the restaurant has
           registered, and it has no way of knowing this one walked away — the
           sign-out call is the only thing that takes it off the list, which is
           what `device.controller.js` says in as many words. Without it a
           shared tablet keeps buzzing for the previous restaurant's orders,
           on a screen the next one can read, until somebody reinstalls.

           It is started before the session is cleared, because the request
           needs that token to authenticate — and it is deliberately NOT
           awaited. Signing out is a thing somebody does when they are leaving,
           and a partner who has lost their connection must not be held on a
           screen they are trying to get out of by a call that is going to time
           out. A failed unregister is a stale row on the server; a sign-out
           that hangs is a person standing there. */
        const token = get().session?.token;
        if (token) {
          getPushToken()
            .then((registration) => (registration ? unregisterDevice(registration.token, token) : null))
            .catch(() => {
              /* No push token on this handset, or no way to reach the server.
                 Either way the sign-out below has already happened. */
            });
        }
        disconnectOrderSocket();
        releaseOrderSound();
        set({ session: null });
      },

      reset: () =>
        set({
          data: INITIAL,
          status: "none",
          submittedAt: null,
          restaurantId: null,
          verificationNote: "",
          session: null,
          phoneProof: null,
          submitting: false,
          submitError: "",
        }),
    }),
    {
      name: "lampose-food-partner",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        data: s.data,
        status: s.status,
        submittedAt: s.submittedAt,
        restaurantId: s.restaurantId,
        verificationNote: s.verificationNote,
        session: s.session,
        /* Short-lived (30 min) and single-purpose, unlike `session` — but
           still worth surviving an app close, or the applicant loses their
           phone proof every time the JS process restarts between verifying
           in step 1 and submitting in step 5. The rehydrate check below
           covers the case where it really has expired by the time it comes
           back. */
        phoneProof: s.phoneProof,
      }),
      /* Hydrated on success AND on failure. A corrupt cache must never strand
         a partner on the splash screen with no way forward. */
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn("[partnerStore] rehydrate failed, starting fresh", error);
        usePartnerStore.setState({ hydrated: true });
        /* `data.otpVerified` is a flag the form gates on; `phoneProof` is the
           token that actually backs it. If the cached proof is gone or has
           aged past its 30-minute life, the flag must not keep claiming the
           number is verified — that dead-ends at step 5's "Submit and sign"
           with a server refusal and no way back to step 1's send-code UI.
           Clearing it here instead sends the applicant back to "Send code"
           for real, on the one screen that already knows how to ask. */
        if (state?.data?.otpVerified && !state.phoneProof) {
          usePartnerStore.setState((s) => ({ data: { ...s.data, otpVerified: false, otpSent: false, otp: "" } }));
        }
      },
    },
  ),
);
