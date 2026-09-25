import { AppState, type AppStateStatus } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { secureFields } from "../services/secureStore";
import { api, ApiError, SESSION_DEAD_CODES } from "@/utils/api";
import type { ChatMessage } from "@/utils/chatMessages";
import { getPushToken } from "@/services/offerAlerts";
import { playOfferAlert } from "@/services/alertSound";
import { socketService } from "@/utils/socketService";
/* Importing this REGISTERS the background location task: `defineTask` runs at
   module scope there, and it has to have run before Android can hand the task
   a batch — including on a headless relaunch. See `services/backgroundLocation.ts`. */
import { startDeliveryTracking, stopDeliveryTracking } from "@/services/backgroundLocation";

/**
 * The rider's session and their work.
 *
 * Every path here talks to `/api/v2/drivers/*` — the sixth identity system in
 * the Lampose backend, with its own `typ: "driver"` token. There is no
 * password: a number, a six-digit code, and the same two calls do sign-in and
 * sign-up, exactly as the customer app does.
 *
 * ## The offer is the whole product, and it arrives twice
 *
 * A delivery offer is a fifteen-second decision. It reaches this store two
 * ways, deliberately:
 *
 *   · the socket (`delivery_offer`), which is instant, and
 *   · `GET /me/offer`, polled while online, which is what actually delivers
 *     the work on a train, in a lift, or on a deployment where the socket
 *     server is not running.
 *
 * Both funnel into `receiveOffer`, which is idempotent on the order number, so
 * getting both is one offer rather than two. Nothing about the flow depends on
 * the socket being up — it only makes it faster.
 *
 * ## What the SERVER decides, and this store never guesses
 *
 * Whether an offer is still live, who won a race for it, whether a hand-over
 * code is right, what a delivery paid. Every one of those is a request whose
 * refusal is shown in the server's own words. A rider told "accepted" by an
 * optimistic client and "too late" by the server two seconds later stops
 * trusting the button, which is the one thing this app cannot afford.
 */

// ─── Domain types ─────────────────────────────────────────────────────────────

/** Mirrors `food_orders.status`. The kitchen owns the first four. */
export type OrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "picked_up"
  | "delivered"
  | "rejected"
  | "cancelled";

/** Mirrors `food_orders.dispatch.state` — the rider track, run in parallel. */
export type DispatchState = "idle" | "searching" | "assigned" | "unassigned";

export type OrderLine = { productName: string; variantName?: string; quantity: number };

export type Job = {
  orderNumber: string;
  restaurantId: string;
  /**
   * Who the rider is collecting from, in words.
   *
   * Optional because an app build outlives a deployment: a handset updated
   * before the server sends this meets a `riderView` that has only ever had
   * `restaurantId`, and `FP-9C4A21B8` is not a place anybody can ride to. Any
   * of the three strings may also be empty on its own — a restaurant with no
   * number on file is ordinary — so every screen reads them through
   * `restaurantLabel` and renders the phone button only when there is a number
   * to dial.
   */
  restaurant?: { name: string; address: string; phone: string };
  status: OrderStatus;
  dispatchState: DispatchState;
  paymentMode: "online" | "cod";
  paymentStatus: "pending" | "paid" | "refunded" | "failed";
  /** What to take at the door. Zero on a prepaid order — do not ask for money. */
  collectAmount: number;
  earnings: number;
  itemCount: number;
  lines: OrderLine[];
  pickup: {
    location: [number, number] | null;
    distanceMeters: number | null;
    /**
     * Minutes, from the same planning-speed estimate `foodDispatch.service.js`
     * paces the offer itself against — see `riderEtaMinutes` there. Rough by
     * construction (no directions API, straight-line distance), so it is
     * shown as an approximation ("~4 min"), never a promise. Optional because
     * an older server build sends no such field.
     */
    etaMinutes?: number;
  };
  drop: { location: [number, number] | null; address: string };
  /** Empty until the offer is accepted — the server withholds both. */
  customerName: string;
  customerPhone: string;
  /** The kitchen reads this out at the pass. Empty until accepted. */
  pickupCode: string;
  placedAt?: string;
  promisedMinutes?: number;
  /**
   * ISO timestamp for when the food should be ready, or null when the
   * kitchen never quoted a prep time. This is what a rider decides against
   * now instead of a personal countdown — see `Offer`'s own comment on why
   * there is no longer one to have.
   */
  readyAt?: string | null;
};

/**
 * A job that is currently being offered.
 *
 * No countdown on it any more. Dispatch used to hold one rider at a time and
 * had to move the job on after fifteen seconds or nobody else got a turn —
 * with every rider in range offered together instead (see
 * `foodDispatch.service.js`'s own header), there is no queue for a timeout
 * to protect, and a rider two minutes from the restaurant has no reason to
 * be rushed by a clock that was only ever there for that queue. An offer now
 * simply stays open until the order is taken, declined, or cancelled — what
 * a rider actually needs to decide is `readyAt`, not a number of seconds.
 */
export type Offer = Job;

export type EarningsSummary = {
  today: number;
  week: number;
  month: number;
  todayTrips: number;
  weekTrips: number;
  monthTrips: number;
  /** Minutes since the CURRENT duty session started — 0 if offline. A live
      snapshot, not a period total: it does not add up past sessions, so it
      is not "online minutes today/this week/this month" even though the
      server sends one number for all three. See `earnings.tsx`. */
  onlineMinutes: number;
  /** Last 7 days, oldest first — drives the earnings bar chart. */
  weekly: { day: string; amount: number }[];
};

export type Vehicle = {
  type: "bike" | "scooter" | "cycle" | "auto";
  model?: string;
  plate?: string;
};

/** The five documents an administrator reads before letting somebody ride. */
export type DocumentKind = "licence" | "rc" | "aadhaar" | "pan" | "insurance";

/**
 * One row of the checklist, exactly as `GET /me` returns it.
 *
 * `missing` is not a decision anybody made — it is the absence of one, and the
 * server sends a row for every known kind so the app draws the full list
 * whether or not anything has been uploaded. Nothing is ever submitted with
 * it.
 */
export type DriverDocument = {
  kind: DocumentKind;
  label: string;
  required: boolean;
  number: string;
  frontUrl: string;
  backUrl: string;
  expiresAt: string | null;
  status: "missing" | "pending" | "verified" | "rejected";
  /** Why it was refused. Shown verbatim — it is what to photograph again. */
  reason: string;
  submittedAt: string | null;
  reviewedAt: string | null;
};

/** Where the rider is paid. The account number never leaves the server. */
export type Payout = {
  accountHolderName: string;
  accountLast4: string;
  ifscCode: string;
  bankName: string;
  accountType: "savings" | "current";
  upiId: string;
};

/**
 * Where the rider lives. ONE, not a list.
 *
 * An approver reads it beside the Aadhaar — a mismatch there is a common
 * reason an application is refused. Shares its shape and its validation with
 * the diner's address book and the property owner's address, so the three
 * cannot drift; see `Backend/src/shared/utils/address.js`.
 */
export type RiderAddress = {
  addressId: string;
  kind: "room" | "hostel" | "home" | "work" | "gate" | "other";
  label: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  instructions: string;
  /** `[longitude, latitude]`, or null when no pin was captured. */
  location: [number, number] | null;
  isDefault: boolean;
};

/** What the form sends. Every field optional; `null` clears the address. */
export type RiderAddressInput = {
  kind?: RiderAddress["kind"];
  label?: string;
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  instructions?: string;
  location?: { lat: number; lng: number } | null;
};

export type OnboardingStep = "personal" | "vehicle" | "documents" | "bank" | "done";

/** What `GET /me` answers. `blockedReason` is computed server-side. */
export type DriverProfile = {
  driverId: string;
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: string | null;
  city?: string;
  profilePhotoUrl?: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  statusReason?: string;
  vehicle?: Vehicle;
  address?: RiderAddress | null;
  documents: DriverDocument[];
  payout?: Payout;
  /**
   * How far through sign-up the server thinks this rider is.
   *
   * `missing` is the list the app puts in front of them, in the server's own
   * words. The app deliberately does NOT recompute it: `PATCH /me` refuses to
   * mark onboarding finished against the same rule, so a second
   * implementation here would be a form that lets a rider press Finish and
   * then tells them they cannot.
   */
  onboarding: { step: OnboardingStep; complete: boolean; missing: string[] };
  hasCompletedOnboarding: boolean;
  canGoOnline: boolean;
  blockedReason: string;
  locationFresh: boolean;
  isOnline: boolean;
  isAvailable: boolean;
  currentOrderNumber: string | null;
};

/** What the rider's own screens may change about themselves. */
export type ProfilePatch = {
  name?: string;
  email?: string;
  dateOfBirth?: string;
  city?: string;
  profilePhotoUrl?: string;
  vehicle?: Partial<Vehicle>;
  address?: RiderAddressInput | null;
  payout?: Partial<Payout> & { bankAccountNumber?: string };
  onboardingStep?: OnboardingStep;
  hasCompletedOnboarding?: boolean;
};

/*
 * The shape before the server has answered, and the shape a rider who has
 * delivered nothing genuinely has.
 *
 * Zeroes, and nothing else. A `dailyTarget: 1500` used to sit in here — a
 * figure no endpoint returns and no operator set, which the earnings screens
 * would have drawn progress against as if somebody had agreed it with the
 * rider. `GET /me/earnings` returns eight fields and this mirrors exactly
 * those eight; `earningsLoaded` is what tells the difference between these
 * zeroes and a real quiet week.
 */
const EMPTY_EARNINGS: EarningsSummary = {
  today: 0,
  week: 0,
  month: 0,
  todayTrips: 0,
  weekTrips: 0,
  monthTrips: 0,
  onlineMinutes: 0,
  weekly: [],
};

const BASE = "/api/v2/drivers";

/** How often the poll fallback asks, while online and holding nothing. */
const OFFER_POLL_MS = 4000;

/**
 * How often the job in hand is re-read over HTTP while one is held.
 *
 * The offer poll deliberately returns the moment `currentJob` is set, which
 * left the held job with exactly one source of truth: `dispatch_update` over
 * the socket. Realtime is an optimisation everywhere else in this codebase and
 * a dependency nowhere — but a rider standing at a pass whose socket dropped
 * on the way into the building had no path back to the truth at all. The
 * kitchen marks the order ready, the event never lands, and the Collect button
 * stays disabled on a screen that is telling them the food is still cooking.
 *
 * Thirty seconds rather than the offer poll's four: nothing here is a
 * fifteen-second decision, the socket still carries the change instantly in
 * the ordinary case, and this is the floor under it rather than the fast path.
 * At two requests a minute for the length of one delivery it costs less than
 * the position heartbeat already does.
 */
const ACTIVE_JOB_POLL_MS = 30000;

/**
 * How often the rider's position is re-sent, even when it has not changed.
 *
 * `driver.model.js` treats a fix older than five minutes as no fix at all and
 * the dispatcher skips that rider — so "we have not moved" and "we have gone
 * silent" have to look different to the server, and only a heartbeat can make
 * them. Without one, a rider parked at a junction waiting for work stops being
 * offered any after five minutes, sits online all shift receiving nothing, and
 * nothing anywhere says why. That is the exact failure `driver.routes.js` calls
 * the worst one in the module.
 *
 * Fifteen seconds is what the backend README and the routes file have always
 * documented; this constant is what finally makes that true. At 60 writes per
 * 15 minutes it sits well inside the 240 the per-rider limiter allows.
 *
 * Staleness is NOT counted in missed beats. It used to be — twenty misses was
 * called five minutes — but that arithmetic only held for a rider standing
 * perfectly still: a position change or a compass reading also fires a report,
 * so a rider going round a bend attempted several a second and twenty misses
 * could pass in seconds. `LOCATION_MAX_SILENCE_MS` below measures the thing the
 * sentence and the server both actually mean, which is a duration.
 */
export const LOCATION_HEARTBEAT_MS = 15000;

/**
 * How long the silence has to last before the app says so.
 *
 * This was a COUNT — `LOCATION_MISSES_BEFORE_STALE = 20` — and its own comment
 * called twenty misses "five minutes at fifteen seconds apart". That
 * arithmetic stopped being true, and nothing that depended on it noticed.
 *
 * The heartbeat above is no longer the cadence reports are attempted on. The
 * effect that reports (`(tabs)/index.tsx`, and the same shape in
 * `app/active.tsx`) sends a fix immediately whenever `location` or `heading`
 * changes and only then starts the fifteen-second interval — so every GPS
 * update, and every compass reading, fires a report and restarts the timer
 * before it can run. `useDriverLocation` watches position at five metres or
 * two seconds and heading on every degree of turn, which means a rider going
 * round a roundabout attempts reports several times a SECOND, and the
 * fifteen-second beat only ever survives on a rider standing perfectly still.
 *
 * So a count of consecutive failures no longer names any duration at all:
 * twenty of them is five minutes standing at a junction and about two seconds
 * riding down a road. The screen kept saying "for five minutes" and would in
 * practice have said it after a couple of seconds of one dropped tower — which
 * is the blip the old comment was written to avoid warning about, and a rider
 * shown a red notice for every blip stops reading the notices, including the
 * one that means their shift is earning nothing.
 *
 * A duration is what the sentence means and what the dispatcher means, so a
 * duration is what is measured: the run of failures is stamped when it starts
 * and its LENGTH is what is compared here. Five minutes is
 * `LOCATION_MAX_AGE_MS` in `driver.model.js` — the exact age at which
 * `hasFreshLocation` stops returning this rider to a search — so the moment
 * the notice appears is the moment it becomes true, whatever cadence the
 * handset happens to be reporting on.
 */
export const LOCATION_MAX_SILENCE_MS = 5 * 60 * 1000;

/**
 * Which write to `currentJob` is the newest, so a slow read cannot undo it.
 *
 * `GET /me/orders/active` used to be answered by cold starts and screen mounts
 * alone; it is now also on a thirty-second timer and on every return to the
 * foreground, so a request is in flight across an ordinary rider action far
 * more often than it used to be. The failure that opens up is quiet and
 * expensive: the read leaves, the rider taps Collect, the server moves the
 * order to `picked_up`, and then the earlier answer lands still describing a
 * `ready` order and puts the Collect button back on a screen belonging to a
 * rider who is already on the road. The same race un-cancels a cancelled job.
 *
 * Every path that settles the job in hand takes a number here, and a read
 * applies its answer only if no newer truth was written while it was away.
 * A counter rather than a flag because two reads can overlap each other as
 * easily as a read can overlap an action, and the loser of that race is the
 * one that started first regardless of which one it raced.
 */
let jobTruthVersion = 0;

/** Claims the newest write to `currentJob`, invalidating every read in flight. */
const supersedeJobReads = (): number => {
  jobTruthVersion += 1;
  return jobTruthVersion;
};

type Envelope<T> = { success?: boolean; data?: T; message?: string };

// ─── Store shape ──────────────────────────────────────────────────────────────

type DriverState = {
  // Session
  token: string | null;
  profile: DriverProfile | null;
  /**
   * The server's own sentence refusing a suspended rider, kept verbatim.
   *
   * A suspended account cannot read `GET /me` at all — `requireDriver` answers
   * 403 ACCOUNT_SUSPENDED before the handler runs — so `profile` for such a
   * rider is whatever was last read BEFORE the suspension, and it can say
   * nothing whatever about it. `statusReason` on that copy is empty or belongs
   * to some earlier, lifted hold, and `blockedReason` is the pre-suspension
   * verdict: "Your documents are being reviewed." under a heading asking why
   * the account is on hold is a wrong answer, which is worse than none.
   *
   * The one thing that IS about the suspension is the refusal itself.
   * `driverAuth.middleware.js` writes "Your account is on hold: <reason>" into
   * it, from the reason `driverAdmin.controller.js` refuses to let an operator
   * omit precisely because the rider is shown it. So it is caught where it
   * arrives and kept, rather than being thrown away with the error and leaving
   * `app/suspended.tsx` with nothing to say.
   *
   * NOT persisted. It is a fact about this session's last conversation with
   * the server, and a hold that has since been lifted must not come back off
   * the disk. Empty means only that this app has not been told — never that
   * there is no reason.
   */
  suspensionNotice: string;
  /** True once the persisted state has been read back from storage. */
  hydrated: boolean;

  // Sign-in
  otpPhone: string | null;
  otpSending: boolean;

  // Duty
  isOnline: boolean;
  togglingDuty: boolean;
  /** The server's caveat when duty is on but it cannot see the rider yet. */
  dutyNote: string;
  /**
   * When the current unbroken run of failed position reports began, or null
   * if the last report landed.
   *
   * The home screen's "we cannot see where you are" notice is drawn from this
   * rather than from `profile.locationFresh`, because the two answer different
   * questions. `locationFresh` is "has a fix arrived in the last five
   * minutes", and it is legitimately FALSE at the one moment a rider is doing
   * everything right: they have been off duty for an hour, they tap Go online
   * with a good fix on the handset, and the duty answer comes back saying the
   * server has not seen them — which is true, and is about to stop being true
   * on the next heartbeat a second later. Painting a fault there accuses a
   * rider of a problem they do not have, during the one handshake they most
   * need to trust.
   *
   * A run of failures that this app itself watched happen cannot make that
   * mistake: it is cleared whenever duty is toggled and cleared after every
   * accepted fix, and it only starts when reports are genuinely not landing.
   */
  locationSilentSince: number | null;
  /**
   * True once that run has lasted `LOCATION_MAX_SILENCE_MS`.
   *
   * Derived where it is written rather than where it is read, and that is
   * deliberate: the screen has no clock of its own, so a value it had to
   * re-evaluate against `Date.now()` would only become true on some unrelated
   * re-render. Every failed report recomputes this, and one is attempted at
   * least every fifteen seconds while a rider is on duty, so the flag turns
   * over within a heartbeat of the moment it becomes true — and turning over
   * is what puts the notice on screen.
   */
  locationStale: boolean;

  // Work
  offer: Offer | null;
  currentJob: Job | null;
  /**
   * Why the job in hand went away, when it was not the rider who finished it.
   *
   * The diner cancelling and the kitchen refusing both reach the app as
   * `delivery_cancelled` carrying a sentence somebody wrote for this exact
   * moment — "The customer cancelled this delivery.", "The restaurant could
   * not take this order." Without somewhere to put it the job simply vanished
   * and the rider was returned to the home screen mid-ride with no word, which
   * reads as the app losing their work rather than as the order ending.
   *
   * Consumed and cleared by whichever screen is showing when it is set, so it
   * is a message rather than a state.
   */
  jobEndedNote: string;
  history: Job[];
  loadingHistory: boolean;
  /** True once `GET /me/orders` has actually answered, for the same reason
      `earningsLoaded` exists — a spinner and a genuinely empty list must not
      look identical. */
  historyLoaded: boolean;
  historyError: string;
  /** The server's real count, so "Load more" can say when it has run out
      rather than offering a tap that comes back empty. */
  historyTotal: number;
  loadingMoreHistory: boolean;
  busy: boolean;

  // Earnings
  earnings: EarningsSummary;
  loadingEarnings: boolean;
  /**
   * True once `GET /me/earnings` has actually answered for this rider.
   *
   * Persisted with the figures themselves, because it is the only thing that
   * separates "you have earned nothing yet" from "we have not been told what
   * you earned". Both are a screen full of zeroes and only one of them is
   * something to show a rider as their week.
   */
  earningsLoaded: boolean;
  /** Why the last earnings read failed, in the server's words. Empty when it did not. */
  earningsError: string;

  // Chat
  activeChat: ChatMessage[];
  unreadCount: number;
  isChatActive: boolean;

  // ── Actions ────────────────────────────────────────────────────────────────
  startSignIn: (phone: string) => Promise<void>;
  resendCode: () => Promise<void>;
  verifyCode: (code: string, name?: string) => Promise<DriverProfile>;
  refreshProfile: () => Promise<boolean>;
  updateProfile: (patch: ProfilePatch) => Promise<DriverProfile>;
  /**
   * Send a photograph and get a URL back.
   *
   * Separate from `submitDocument` on purpose, and in that order: the upload
   * is the slow, failure-prone half, and a rider should see the thumbnail
   * appear the moment it lands rather than after they have also filled in a
   * licence number. The URL is held in the form until they submit.
   */
  uploadImage: (kind: DocumentKind | "profile", base64: string) => Promise<string>;
  /** Submit or resubmit one document. Puts it back in the approver's queue. */
  submitDocument: (input: {
    kind: DocumentKind;
    number?: string;
    frontUrl?: string;
    backUrl?: string;
    expiresAt?: string | null;
  }) => Promise<DriverProfile>;
  /**
   * Register this handset so an offer can reach a locked phone.
   *
   * Called after every successful sign-in and on every cold start, because a
   * push token is reissued on reinstall and can be revoked at any time — a
   * token registered once at sign-up is a token that quietly stops working
   * three months later, and a rider whose offers went silent has no way to
   * know why. Never throws: notifications are an optimisation, not a
   * dependency.
   */
  registerForOffers: () => Promise<void>;
  /**
   * `accountGone` after the rider deleted their own account: the server has
   * already dropped the handset, and asking again with a token it now refuses
   * would raise the "session expired" sheet over the sign-in screen.
   */
  logout: (options?: { accountGone?: boolean }) => Promise<void>;

  setOnline: (online: boolean) => Promise<void>;
  pushLocation: (lat: number, lng: number, heading?: number) => Promise<void>;

  receiveOffer: (offer: Job) => void;
  clearOffer: (orderNumber?: string) => void;
  pollOffer: () => Promise<void>;
  acceptOffer: () => Promise<Job>;
  declineOffer: (reason?: string) => Promise<void>;

  fetchActiveJob: () => Promise<void>;
  clearJobEndedNote: () => void;
  advanceJob: (status: "picked_up" | "delivered", code: string) => Promise<void>;
  releaseJob: (reason?: string) => Promise<void>;

  fetchEarnings: () => Promise<void>;
  /** `more: true` pages back through what is already loaded; the default
      replaces it — a pull-to-refresh must not just append the same 50 rows
      onto themselves. */
  fetchHistory: (options?: { more?: boolean }) => Promise<void>;

  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
  setUnreadCount: (count: number) => void;
  setIsChatActive: (active: boolean) => void;
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDriverStore = create<DriverState>()(
  persist(
    (set, get) => ({
      token: null,
      profile: null,
      hydrated: false,

      otpPhone: null,
      otpSending: false,

      suspensionNotice: "",

      isOnline: false,
      togglingDuty: false,
      dutyNote: "",
      locationSilentSince: null,
      locationStale: false,

      offer: null,
      currentJob: null,
      jobEndedNote: "",
      history: [],
      loadingHistory: false,
      historyLoaded: false,
      historyError: "",
      historyTotal: 0,
      loadingMoreHistory: false,
      busy: false,

      earnings: EMPTY_EARNINGS,
      loadingEarnings: false,
      earningsLoaded: false,
      earningsError: "",

      activeChat: [],
      unreadCount: 0,
      isChatActive: false,

      // ── Session ──────────────────────────────────────────────────────────

      startSignIn: async (phone) => {
        set({ otpSending: true });
        try {
          await api(`${BASE}/auth/start`, { method: "POST", body: { phone } });
          set({ otpPhone: phone });
        } finally {
          set({ otpSending: false });
        }
      },

      resendCode: async () => {
        const phone = get().otpPhone;
        if (!phone) throw new ApiError("Enter your number first.", 400);
        set({ otpSending: true });
        try {
          await api(`${BASE}/auth/resend`, { method: "POST", body: { phone } });
        } finally {
          set({ otpSending: false });
        }
      },

      verifyCode: async (code, name) => {
        const phone = get().otpPhone;
        if (!phone) throw new ApiError("Enter your number first.", 400);

        const res = await api<Envelope<{ token: string; driver: DriverProfile }>>(
          `${BASE}/auth/verify`,
          { method: "POST", body: { phone, code, ...(name ? { name } : null) } },
        );
        const data = res?.data;
        if (!data?.token) throw new ApiError(res?.message || "Sign-in failed.", 500);

        set({
          token: data.token,
          profile: data.driver,
          otpPhone: null,
          isOnline: !!data.driver.isOnline,
        });
        socketService.connect(data.driver.driverId, data.token);
        get().registerForOffers().catch(() => {});
        // A rider who was mid-delivery when the app was killed lands straight
        // back on the job rather than on an empty home screen.
        get().fetchActiveJob().catch(() => {});
        return data.driver;
      },

      refreshProfile: async () => {
        const token = get().token;
        if (!token) return false;

        try {
          const res = await api<Envelope<DriverProfile>>(`${BASE}/me`, { token });
          if (res?.data) {
            /* An answer at all means the account is not on hold — the guard
               would have refused this request — so any refusal being held from
               a previous read is stale and goes now. */
            set({ profile: res.data, isOnline: !!res.data.isOnline, suspensionNotice: "" });
          }
          socketService.connect(res?.data?.driverId ?? null, token);
          return true;
        } catch (err) {
          // Only a rejected token signs the rider out. A flaky network must not
          // end a shift — the app keeps its persisted session and retries.
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            // A suspended account is a real 403 and the app has a screen for it,
            // so it keeps the session and shows that instead of a login form.
            const payload = err.payload as { code?: string; message?: string } | null;
            if (payload?.code === "ACCOUNT_SUSPENDED") {
              set((s) => ({
                profile: s.profile ? { ...s.profile, status: "suspended" } : s.profile,
                isOnline: false,
                /* The refusal is the only sentence anywhere in this session
                   that is about the suspension — see `suspensionNotice`. It is
                   kept exactly as written, because it carries the operator's
                   own words and the app has no business rephrasing them. */
                suspensionNotice: payload?.message || err.message || "",
              }));
              return true;
            }

            /*
              A dead token (expired, malformed, the account gone, issued for a
              different session type) is ALSO reported to `utils/api.ts`'s
              central session-expired handler, above this catch, before `api()`
              ever threw — that is what raises the blocking "session expired"
              dialog registered in `_layout.tsx`. Logging out here too would
              clear the session before the rider has ever seen or acknowledged
              that dialog, which defeats the one rule the new UX is built on:
              nothing signs a rider out except them tapping its Logout button.
              So this branch stands down for exactly the codes the central
              handler recognises, and falls back to the old immediate, silent
              logout only for a 401 that ISN'T one of them — a fail-safe so a
              cold start can never get stuck sitting on a token that neither
              list will clear.
            */
            if (err.status === 401 && SESSION_DEAD_CODES.has(payload?.code ?? "")) {
              return false;
            }
            await get().logout();
            return false;
          }
          socketService.connect(get().profile?.driverId ?? null, token);
          return true;
        }
      },

      registerForOffers: async () => {
        const { token } = get();
        if (!token) return;
        try {
          const registration = await getPushToken();
          if (!registration) return;
          await api(`${BASE}/me/devices`, { method: "POST", body: registration, token });
        } catch {
          /* A refused permission, a simulator, a flaky network. The socket and
             the poll still deliver every offer while the app is open. */
        }
      },

      updateProfile: async (patch) => {
        const token = get().token;
        const res = await api<Envelope<DriverProfile>>(`${BASE}/me`, {
          method: "PATCH",
          body: patch,
          token,
        });
        if (!res?.data) throw new ApiError(res?.message || "That did not save.", 500);
        set({ profile: res.data });
        return res.data;
      },

      /**
       * A photograph, to Cloudinary, through the backend.
       *
       * Takes the base64 payload the image picker already produced — NOT a
       * `file://` URI. Turning a URI back into bytes in React Native means
       * `fetch(uri).blob()` and a `FileReader`, both of which behave
       * differently in Expo Go, a dev build and on web, and the picker was
       * holding the bytes the whole time. `base64: true` on the picker call is
       * the whole of the alternative.
       *
       * Sent as JSON rather than `multipart/form-data`: the server accepts
       * both — `driverUpload.controller.js` normalises them into one path —
       * and RN's `FormData` file blob is the other thing that differs per
       * platform. A compressed phone photograph is comfortably inside the 25mb
       * body limit, and the server refuses anything over 10mb per image with a
       * sentence saying so.
       */
      uploadImage: async (kind, base64) => {
        const token = get().token;
        if (!base64) throw new ApiError("That photo could not be read.", 0);

        const res = await api<{ data?: { url: string }[] }>(`${BASE}/me/uploads/images`, {
          method: "POST",
          body: { kind, image: base64 },
          token,
          /* A photograph over a rider's mobile connection is not a 15-second
             request. The default timeout would fail an upload that was going
             to succeed, and the rider would retake a photograph that was
             fine. */
          timeoutMs: 60000,
        });

        const url = res?.data?.[0]?.url;
        if (!url) throw new ApiError("The photo did not upload. Please try again.", 500);
        return url;
      },

      submitDocument: async (input) => {
        const token = get().token;
        const res = await api<Envelope<DriverProfile>>(`${BASE}/me/documents`, {
          method: "POST",
          body: input,
          token,
        });
        if (!res?.data) throw new ApiError(res?.message || "That did not save.", 500);
        set({ profile: res.data });
        return res.data;
      },

      logout: async (options) => {
        /* Same reasoning as the device unregister below: on a shared handset a
           service left running would keep reporting the PREVIOUS rider's
           position, under their token, with a notification the next person can
           read. */
        stopDeliveryTracking().catch(() => {});

        /* The handset is unregistered FIRST, and its failure is ignored.
           Without this, signing out on a shared phone leaves the previous
           rider's offers ringing on it — somebody else's work on a screen
           they can read. */
        const { token } = get();
        if (token && !options?.accountGone) {
          getPushToken()
            .then((registration) =>
              registration
                ? api(`${BASE}/me/devices`, { method: "DELETE", body: registration, token })
                : null,
            )
            .catch(() => {});
        }
        socketService.disconnect();
        supersedeJobReads();
        set({
          token: null,
          profile: null,
          suspensionNotice: "",
          otpPhone: null,
          isOnline: false,
          dutyNote: "",
          locationSilentSince: null,
          locationStale: false,
          offer: null,
          currentJob: null,
          jobEndedNote: "",
          history: [],
          earnings: EMPTY_EARNINGS,
          earningsLoaded: false,
          earningsError: "",
          activeChat: [],
          unreadCount: 0,
          isChatActive: false,
        });
      },

      // ── Duty ─────────────────────────────────────────────────────────────

      /**
       * The go-online switch.
       *
       * NOT optimistic. Going online is the one toggle whose truth lives on the
       * server — an unapproved rider, an unfinished profile, or an order still
       * in hand all refuse it, each with its own sentence. Flipping the switch
       * first and correcting it a moment later shows a rider they are working
       * when they are not, which is how a shift is spent waiting for an offer
       * that was never going to come.
       */
      setOnline: async (online) => {
        const { token } = get();
        set({ togglingDuty: true });
        try {
          const res = await api<Envelope<{ isOnline: boolean; note?: string; locationFresh?: boolean }>>(
            `${BASE}/me/duty`,
            { method: "POST", body: { online }, token },
          );
          /* The duty answer re-states `hasFreshLocation` — the same rule the
             dispatcher will apply — so the copy held on the profile is brought
             up to date with it here rather than left at whatever `GET /me` said
             at the last cold start.

             It is recorded, and it is deliberately not ACCUSED of anything.
             The commonest way for it to arrive false is the ordinary one: an
             hour offline expires the last fix, and the rider is at this very
             moment tapping Go online with a good position in hand that the
             next heartbeat will send. What the home screen warns on is a run
             of reports that were attempted and did not land — because that is
             the only version of this that is the rider's problem rather than
             an artefact of the handshake. */
          const fresh = res?.data?.locationFresh;
          set((s) => ({
            isOnline: !!res?.data?.isOnline,
            dutyNote: res?.data?.note ?? "",
            /* Cleared on both edges of the switch. Coming on duty, a silence
               that accrued while the app was reporting nothing is not a fault
               to carry into the new shift; going off, no report is being
               attempted at all and a running clock would sit there timing a
               silence nobody asked to be broken. */
            locationSilentSince: null,
            locationStale: false,
            ...(typeof fresh === "boolean" && s.profile
              ? { profile: { ...s.profile, locationFresh: fresh } }
              : null),
            ...(online ? null : { offer: null }),
          }));
          if (online) get().pollOffer().catch(() => {});
        } finally {
          set({ togglingDuty: false });
        }
      },

      /**
       * Where the rider is.
       *
       * Fire-and-forget on purpose: this runs on every fix the handset takes
       * and at least once every fifteen seconds besides, and a failed position
       * must never surface as an error a rider has to dismiss while riding. The
       * consequence of a silence that lasts is that the server treats the
       * position as stale and stops offering — which is the correct outcome,
       * and how long the silence has run is what the home screen reads.
       */
      pushLocation: async (lat, lng, heading) => {
        const { token, isOnline } = get();
        if (!token || !isOnline) return;
        try {
          await api(`${BASE}/me/location`, {
            method: "PATCH",
            body: { lat, lng, ...(typeof heading === "number" ? { heading } : null) },
            token,
            timeoutMs: 8000,
          });
          /*
            Clear the "we cannot see where you are yet" caveat.

            `dutyNote` is the server's answer at the moment duty was switched
            on, and going online before the first GPS fix is the ordinary case
            — so it is almost always set. Nothing used to clear it, so the
            banner stayed on screen for the whole shift while positions were
            in fact arriving every fifteen seconds, telling a rider their
            location was not reaching us when it was. That is a rider who turns
            location on and off looking for a fault that is not there, and an
            operator who is told the app is broken when the real answer was
            somewhere else entirely.

            A position the server accepted is exactly the event that makes the
            sentence untrue, so this is where it goes — and with it
            `locationFresh`, which is the same fact in the form the home screen
            reads. The server has just stored this fix, so by its own rule the
            rider's position is fresh; leaving the flag at what `GET /me`
            answered on a cold start would keep "we cannot see where you are"
            on screen for the rest of a shift that is working perfectly.
          */
          const { dutyNote, profile, locationSilentSince, locationStale } = get();
          if (dutyNote || locationSilentSince || locationStale || (profile && !profile.locationFresh)) {
            set({
              dutyNote: "",
              locationSilentSince: null,
              locationStale: false,
              ...(profile ? { profile: { ...profile, locationFresh: true } } : null),
            });
          }
        } catch {
          /* Timed rather than shown, and timed rather than counted. One miss is
             a lift, a tunnel, a tower hand-over; five unbroken minutes of them
             is the exact span after which the dispatcher stops seeing this
             rider — so what the home screen reads is how long the silence has
             lasted, and it says nothing until the silence has actually cost the
             rider something.

             Counting was what this used to do, and it stopped meaning a
             duration when reports stopped being attempted on a fixed cadence:
             see `LOCATION_MAX_SILENCE_MS`. The stamp is taken on the FIRST
             failure of a run and left alone afterwards, so the clock measures
             the silence rather than restarting with every attempt inside it. */
          set((s) => {
            const since = s.locationSilentSince ?? Date.now();
            return {
              locationSilentSince: since,
              locationStale: Date.now() - since >= LOCATION_MAX_SILENCE_MS,
            };
          });
        }
      },

      // ── Offers ───────────────────────────────────────────────────────────

      /**
       * One offer in, from either transport.
       *
       * Idempotent on the order number: the socket and the poll routinely both
       * deliver the same offer, and re-setting it would replay the alert sound
       * for a rider already looking at it.
       */
      receiveOffer: (incoming) => {
        const existing = get().offer;
        if (existing && existing.orderNumber === incoming.orderNumber) return;
        if (get().currentJob) return; // already carrying something

        set({ offer: incoming });

        /*
          Ring, here, because this is the ONE place both transports arrive.

          The socket and the four-second poll both funnel through this handler
          and it is idempotent on the order number — so the tone plays once per
          offer rather than once per delivery mechanism, and putting it in
          either transport instead would either double it or miss half the
          offers. Playing it after `set` means the screen and the sound land
          together.

          Not awaited: a decode that takes 40ms must not delay the offer
          appearing, and `playOfferAlert` swallows its own failures.
        */
        playOfferAlert().catch(() => {});
      },

      clearOffer: (orderNumber) => {
        const current = get().offer;
        if (!current) return;
        if (orderNumber && current.orderNumber !== orderNumber) return;
        set({ offer: null });
      },

      pollOffer: async () => {
        const { token, isOnline, currentJob, offer } = get();
        if (!token || !isOnline || currentJob || offer) return;
        try {
          const res = await api<Envelope<Job>>(
            `${BASE}/me/offer`,
            { token, timeoutMs: 8000 },
          );
          if (res?.data) get().receiveOffer(res.data);
        } catch {
          /* A failed poll is the ordinary case on bad signal. The next tick
             tries again; nothing is shown. */
        }
      },

      acceptOffer: async () => {
        const { token, offer } = get();
        if (!offer) throw new ApiError("That offer has gone.", 410);

        set({ busy: true });
        try {
          const res = await api<Envelope<Job>>(
            `${BASE}/orders/${offer.orderNumber}/accept`,
            { method: "POST", token },
          );
          const job = res?.data;
          if (!job) throw new ApiError(res?.message || "That offer has gone.", 410);

          supersedeJobReads();
          set({ offer: null, currentJob: job, jobEndedNote: "", activeChat: [], unreadCount: 0 });
          socketService.trackOrder(job.orderNumber);
          /* Fired, not awaited. Background permission can send the rider to a
             settings screen on Android 11+, and holding the accept behind that
             would leave them looking at a spinner with a countdown running. A
             refusal is not fatal — `useDriverLocation` still reports while the
             app is on screen. */
          startDeliveryTracking().catch(() => {});
          return job;
        } finally {
          set({ busy: false });
        }
      },

      /**
       * Pass.
       *
       * The offer is cleared locally FIRST and the request is not awaited for
       * the UI's sake: declining is a decision the rider has already made, and
       * a spinner over a job they no longer want is the app arguing with them.
       * The server records it either way.
       */
      declineOffer: async (reason) => {
        const { token, offer } = get();
        if (!offer) return;
        set({ offer: null });
        try {
          await api(`${BASE}/orders/${offer.orderNumber}/decline`, {
            method: "POST",
            body: { reason: reason ?? "" },
            token,
          });
        } catch {
          /* Declining cannot fail from the rider's point of view. */
        }
      },

      // ── The job in hand ──────────────────────────────────────────────────

      /**
       * The job in hand, from the server.
       *
       * `GET /me/orders/active` reads `food_orders` rather than trusting the
       * rider's `currentOrderNumber`, so it is the authority on both halves of
       * the question: what this rider is carrying, and whether they are still
       * carrying anything. That makes it the HTTP floor under `dispatch_update`
       * — called on a cold start, on the active screen opening, when the app
       * comes back to the foreground, and on a slow timer while a job is held.
       *
       * Authoritative only about the moment it was ASKED. Anything that
       * settled the job while this was in flight — a collection, a hand-over,
       * a cancellation, another read that started later — is newer than this
       * answer, and `jobTruthVersion` is how such an answer is recognised and
       * dropped instead of being written over the top of it.
       */
      fetchActiveJob: async () => {
        const { token } = get();
        if (!token) return;
        const read = supersedeJobReads();
        try {
          const res = await api<Envelope<Job | null>>(`${BASE}/me/orders/active`, { token });
          /* Late. The rider, the kitchen or a newer read has moved the job on
             since this question was asked, and this answer describes the world
             before that. Discarded whole: applying half of it — the job but
             not the note, the note but not the job — is how a rider ends up on
             a screen that is internally inconsistent. */
          if (read !== jobTruthVersion) return;

          const job = res?.data ?? null;
          /* Read at RESOLUTION time, not at call time: a request in flight
             while the rider hands the food over resolves after `advanceJob`
             has already cleared the job, and comparing against a stale copy
             would announce a cancellation to somebody standing on their own
             completion screen. */
          const held = get().currentJob;
          set({
            currentJob: job,
            /* The order is gone and this route cannot say why — it answers
               what is true now, not what happened. So the sentence says only
               that, and leaves the reason to `delivery_cancelled`, which
               carries one and usually arrives first. Silently emptying the
               screen is the one outcome that is not available. */
            ...(held && !job && !get().jobEndedNote
              ? { jobEndedNote: `Order ${held.orderNumber} is no longer assigned to you.` }
              : null),
          });
          if (job) socketService.trackOrder(job.orderNumber);
          else if (held) socketService.untrackOrder(held.orderNumber);

          /*
           * The server's answer is the authority on whether the service should
           * be running, so it is reconciled against here rather than assumed.
           *
           * This is also what replaces the boot receiver. A phone that
           * rebooted mid-delivery starts nothing on its own; the rider opens
           * the app, this call runs, and tracking resumes for a job that is
           * genuinely still theirs. A job that ended while the app was closed
           * stops a service that would otherwise have been left running.
           */
          if (job) startDeliveryTracking().catch(() => {});
          else stopDeliveryTracking().catch(() => {});
        } catch {
          /* Leaves whatever was persisted. A rider mid-delivery on no signal
             keeps their job on screen. */
        }
      },

      clearJobEndedNote: () => {
        if (get().jobEndedNote) set({ jobEndedNote: "" });
      },

      /**
       * A hand-over.
       *
       * The code is sent, never checked here. Four digits read out across a
       * counter are checked against THAT order on the server; a client-side
       * comparison would need the code in the app, which is exactly the thing
       * that must not be true for the delivery PIN.
       */
      advanceJob: async (status, code) => {
        const { token, currentJob } = get();
        if (!currentJob) return;

        set({ busy: true });
        try {
          const res = await api<Envelope<Job>>(
            `${BASE}/orders/${currentJob.orderNumber}/status`,
            { method: "PATCH", body: { status, code }, token },
          );
          const job = res?.data ?? { ...currentJob, status };
          supersedeJobReads();

          if (status === "delivered") {
            socketService.untrackOrder(currentJob.orderNumber);
            /* The delivery is over: the service, its notification and the GPS
               drain all stop here. */
            stopDeliveryTracking().catch(() => {});
            set((s) => ({
              currentJob: null,
              history: [job, ...s.history].slice(0, 100),
              activeChat: [],
              unreadCount: 0,
              isChatActive: false,
            }));
            // Earnings are the server's arithmetic, not ours — see the note on
            // `driver.model.js`: a counter and a ledger that disagree is the
            // worst bug this product could have.
            get().fetchEarnings().catch(() => {});
          } else {
            set({ currentJob: job });
          }
        } finally {
          set({ busy: false });
        }
      },

      releaseJob: async (reason) => {
        const { token, currentJob } = get();
        if (!currentJob) return;

        set({ busy: true });
        try {
          await api(`${BASE}/orders/${currentJob.orderNumber}/release`, {
            method: "POST",
            body: { reason: reason ?? "The rider could not complete it" },
            token,
          });
          socketService.untrackOrder(currentJob.orderNumber);
          supersedeJobReads();
          set({ currentJob: null, activeChat: [], unreadCount: 0, isChatActive: false });
        } finally {
          set({ busy: false });
        }
      },

      // ── Earnings & history ───────────────────────────────────────────────

      /**
       * What this rider has been paid, as the server computes it.
       *
       * The failure is KEPT rather than logged and swallowed. Every figure on
       * the earnings tab is this response, so a read that failed leaves the
       * screen holding either the last answer or a row of zeroes — and a rider
       * looking at ₹0 has no way to tell an unpaid day from an unanswered
       * request. One is worth going back to work about and the other is worth
       * ringing support about, and the app is the only thing that knows which
       * happened.
       */
      fetchEarnings: async () => {
        const { token } = get();
        if (!token) return;

        set({ loadingEarnings: true });
        try {
          const res = await api<Envelope<Partial<EarningsSummary>>>(`${BASE}/me/earnings`, { token });
          /* `EMPTY_EARNINGS` underneath rather than the previous answer: a
             field the server stopped sending has to fall back to nought, not
             to whatever it was an hour ago. */
          if (res?.data) {
            set({
              earnings: { ...EMPTY_EARNINGS, ...res.data },
              earningsLoaded: true,
              earningsError: "",
            });
          } else {
            /* A 200 carrying no `data` is not an answer, and it must not be
               silence either. The earnings tab now shows "these are coming"
               for as long as nothing has failed — which is right, and which
               makes a request that returns nothing at all a spinner with no
               end unless it is recorded as the failure it is. */
            set({ earningsError: "We could not read your earnings." });
          }
        } catch (err) {
          const payload = (err as { payload?: { message?: string } } | null)?.payload;
          set({
            earningsError:
              payload?.message || (err as Error)?.message || "We could not read your earnings.",
          });
        } finally {
          set({ loadingEarnings: false });
        }
      },

      fetchHistory: async (options) => {
        const { token, history } = get();
        if (!token) return;

        const more = options?.more === true;
        if (more) set({ loadingMoreHistory: true });
        else set({ loadingHistory: true, historyError: "" });

        try {
          const skip = more ? history.length : 0;
          const res = await api<{ data?: Job[]; total?: number }>(
            `${BASE}/me/orders?skip=${skip}`,
            { token },
          );
          const page = Array.isArray(res?.data) ? res.data : [];
          set({
            history: more ? [...history, ...page] : page,
            historyTotal: typeof res?.total === "number" ? res.total : page.length,
            historyLoaded: true,
            historyError: "",
          });
        } catch (err) {
          const message = (err as Error).message || "We could not load your orders.";
          console.warn("[history] fetch failed:", message);
          if (!more) {
            /* Only a failed FIRST load blanks the screen with this — a failed
               "load more" leaves the rows already on screen alone and is
               rethrown instead, for the caller to show as a passing toast. */
            set({ historyError: message, historyLoaded: true });
          } else {
            throw err;
          }
        } finally {
          set({ loadingHistory: false, loadingMoreHistory: false });
        }
      },

      // ── Chat ─────────────────────────────────────────────────────────────

      addChatMessage: (message) =>
        set((s) => {
          if (s.activeChat.some((m) => m.id === message.id)) return s;
          const fromCustomer = message.from === "customer";
          return {
            activeChat: [...s.activeChat, message],
            unreadCount: fromCustomer && !s.isChatActive ? s.unreadCount + 1 : s.unreadCount,
          };
        }),

      clearChat: () => set({ activeChat: [], unreadCount: 0 }),
      setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),
      setIsChatActive: (active) =>
        set(active ? { isChatActive: true, unreadCount: 0 } : { isChatActive: false }),
    }),
    {
      name: "driver-store",
      /* The token goes to the Keychain / Keystore; the cached job, profile
         and earnings stay in AsyncStorage, because that blob is far past
         SecureStore's 2048-byte Android ceiling and none of it is secret.
         `secureFields` does the split — see `services/secureStore.ts`. */
      storage: createJSONStorage(() => secureFields(["token"])),
      // Bumped: the v1 shape stored a password session and an `Order` with
      // `stops`, neither of which exists any more. Persisted v1 state is
      // dropped rather than migrated — the token it held would not verify.
      version: 2,
      migrate: () => ({}) as never,
      partialize: (s) => ({
        token: s.token,
        profile: s.profile,
        isOnline: s.isOnline,
        // The job in hand survives a kill, so a rider on a doorstep with no
        // signal still has the address and the PIN prompt.
        currentJob: s.currentJob,
        earnings: s.earnings,
        // Without this the zeroes come back on every cold start looking like a
        // rider's real week rather than like a screen that has not loaded yet.
        earningsLoaded: s.earningsLoaded,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn("[store] rehydrate failed:", error);
        // Flip the gate regardless — a failed read just means a cold start.
        useDriverStore.setState({ hydrated: true });
        if (state?.token) socketService.connect(state.profile?.driverId ?? null, state.token);
      },
    },
  ),
);

// ─── The offer pump ───────────────────────────────────────────────────────────

/**
 * Wire the socket to the store, and run the poll fallback.
 *
 * Called once from the root layout. Both transports are live at the same time
 * on purpose — see the note at the top of this file. The poll is cheap (one
 * request every four seconds, and only while online and holding nothing) and
 * it is the only thing that works when the socket cannot connect at all.
 *
 * ## Two polls, because a rider has two states and only one was covered
 *
 * `pollOffer` returns immediately once a job is in hand, which is right — a
 * rider carrying food is not being offered anything. But that left the held
 * job itself with no HTTP path back to the truth: the kitchen's `ready`, and
 * the order ending underneath the rider, both arrived over the socket alone.
 * A dropped connection in a lift or a basement kitchen then froze the active
 * screen mid-delivery with no way to recover but killing the app.
 *
 * So there is a second, slower timer for the job in hand, and a foreground
 * listener beside it, because the case that matters most is a rider who put
 * their phone away outside the restaurant and took it out again at the
 * counter. Neither makes the socket a dependency: it still carries every one
 * of these changes the instant they happen, and this is the floor under it.
 */
export function startOfferPump(): () => void {
  const store = useDriverStore;

  const onOffer = (payload: Job) => {
    if (payload?.orderNumber) store.getState().receiveOffer(payload);
  };
  const onOfferClosed = (payload: { orderNumber?: string }) => {
    store.getState().clearOffer(payload?.orderNumber);
  };
  /*
    The order ending under the rider — the diner cancelled, or the kitchen
    refused it.

    Both senders write a sentence for this moment and send it as `message`
    (`foodCustomerOrder.controller.js`, `foodOrder.controller.js`). It is kept
    rather than dropped: the job disappearing is the part the rider can see for
    themselves, and WHICH of the two happened is the part only this payload
    knows. Without it the app takes the work off their screen and says nothing,
    which is indistinguishable from the app losing it.
  */
  const onCancelled = (payload: { orderNumber?: string; message?: string }) => {
    store.getState().clearOffer(payload?.orderNumber);
    const job = store.getState().currentJob;
    if (job && payload?.orderNumber === job.orderNumber) {
      socketService.untrackOrder(job.orderNumber);
      supersedeJobReads();
      store.setState({
        currentJob: null,
        jobEndedNote:
          payload?.message?.trim() || `Order ${job.orderNumber} was cancelled.`,
      });
    }
  };
  /* The kitchen moving the order forward. The rider's screen enables "Collect"
     only when the server says `ready`, so this is what makes that button light
     up without the rider pulling to refresh at the pass. */
  const onDispatchUpdate = (payload: { orderNumber?: string; status?: OrderStatus }) => {
    const job = store.getState().currentJob;
    if (!job || !payload?.orderNumber || payload.orderNumber !== job.orderNumber) return;
    if (payload.status && payload.status !== job.status) {
      supersedeJobReads();
      store.setState({ currentJob: { ...job, status: payload.status } });
    }
  };

  socketService.on("delivery_offer", onOffer);
  socketService.on("delivery_offer_closed", onOfferClosed);
  socketService.on("delivery_cancelled", onCancelled);
  socketService.on("dispatch_update", onDispatchUpdate);

  const timer = setInterval(() => {
    store.getState().pollOffer().catch(() => {});
  }, OFFER_POLL_MS);

  /* Only while something is actually held. A rider waiting for work has no
     active order to read and this would be a request per half-minute asking
     the same question the offer poll is already asking. */
  const refetchHeldJob = () => {
    if (!store.getState().currentJob) return;
    store.getState().fetchActiveJob().catch(() => {});
  };

  const jobTimer = setInterval(refetchHeldJob, ACTIVE_JOB_POLL_MS);

  /* Coming back from the background is the one moment the app is most likely
     to be wrong: the socket was disconnected while the screen was off, and
     every event that arrived in the meantime went nowhere. Reading once here
     costs a single request and is what makes putting the phone in a pocket
     between the gate and the counter safe. */
  const onAppStateChange = (next: AppStateStatus) => {
    if (next !== "active") return;
    refetchHeldJob();
  };
  const appStateSub = AppState.addEventListener("change", onAppStateChange);

  return () => {
    clearInterval(timer);
    clearInterval(jobTimer);
    appStateSub.remove();
    socketService.off("delivery_offer", onOffer);
    socketService.off("delivery_offer_closed", onOfferClosed);
    socketService.off("delivery_cancelled", onCancelled);
    socketService.off("dispatch_update", onDispatchUpdate);
  };
}

// ─── Selectors ────────────────────────────────────────────────────────────────

/**
 * Which of the six stages the active job is at.
 *
 * Derived from the server's status rather than counted up locally: a rider who
 * reinstalls mid-delivery, or whose app was killed at the pass, has to land on
 * the right step, and a local counter would put them back at the start.
 *
 *   0 Accepted   1 Going to restaurant   2 At the restaurant
 *   3 Picked up  4 Going to the customer 5 Delivered
 */
/**
 * Which of the five stages this job is standing on.
 *
 * Indexes `STAGES`, `STAGE_HINTS` and `STAGE_CTAS`, which are all the same
 * length by construction. `picked_up` is stage 3 — "going to customer" — and
 * NOT a stage of its own: collecting the food and setting off are one moment,
 * and giving them separate stages is what used to make the rail jump from 3
 * to 5 and read as almost-finished the instant the bag was closed.
 */
export const selectStage = (job: Job | null): number => {
  if (!job) return 0;
  switch (job.status) {
    case "delivered":
      return 4;
    case "picked_up":
      return 3;
    case "ready":
      return 2;
    default:
      return 1;
  }
};

/** True once the kitchen says the food is cooked and waiting. */
export const canCollect = (job: Job | null): boolean => job?.status === "ready";

/**
 * What to call the restaurant on screen.
 *
 * The id is the last resort, not the default. `FP-9C4A21B8` was the pickup
 * heading on the active screen, the title of every past delivery, and the
 * subject of "How was FP-9C4A21B8?" — a string that tells a rider standing in
 * a market nothing about which shutter to walk to. It stays as the fallback
 * because a name that has not arrived is not a reason to render a blank
 * heading, and an older server sends no `restaurant` block at all.
 */
export const restaurantLabel = (job: Job | null): string =>
  job?.restaurant?.name?.trim() || job?.restaurantId || "Restaurant";

/** Kilometres to the pickup, or null when the server sent no distance. */
export const pickupKm = (job: Job | null): number | null => {
  const metres = job?.pickup?.distanceMeters;
  return typeof metres === "number" ? Math.round(metres / 100) / 10 : null;
};

/** Minutes to the pickup, or null when the server sent no estimate. */
export const pickupEtaMinutes = (job: Job | null): number | null => {
  const minutes = job?.pickup?.etaMinutes;
  return typeof minutes === "number" ? minutes : null;
};

/**
 * Metres between two `[lng, lat]` points, haversine.
 *
 * Duplicated from `components/ui/MapPanel.tsx`'s `metresBetween` rather than
 * imported from it: that file pulls in `react-native-maps` at module scope,
 * and a screen that only needs one number should not load a map component to
 * get it. The two must still agree — see that file's own note on why the
 * customer app and this one each keep a copy of the same geometry.
 */
function metresBetween(a: readonly [number, number], b: readonly [number, number]): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Kilometres from the kitchen to the door — the SECOND leg of the trip,
 * measured the same straight-line way `pickupKm` measures the first.
 *
 * Computed here rather than sent by the server: `riderView` hands over both
 * pins before an offer is even accepted (see its own note on why the full
 * drop address is no longer withheld), so the rider app already has
 * everything it needs to work the distance out itself, and a rider deciding
 * whether a delivery is worth taking wants to see how far the DOOR is, not
 * only how far the kitchen is. Null when either end has no pin — an order
 * placed before delivery pins were required can still be missing one.
 */
export const dropKm = (job: Job | null): number | null => {
  const pickup = job?.pickup?.location;
  const drop = job?.drop?.location;
  if (!pickup || !drop) return null;
  return Math.round(metresBetween(pickup, drop) / 100) / 10;
};
