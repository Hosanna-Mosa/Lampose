/*
 * The sales rep's session, and the duty switch that rides on it.
 *
 * `session` is the one secret field, kept in the platform keystore rather
 * than plain AsyncStorage; see `services/secureStore.ts` for why and how.
 *
 * `onDuty` is no longer local-only — it lives on `session.salesRep`, the
 * server's own answer, so this store never has an opinion that disagrees
 * with `/api/v2/sales/me/duty`'s. `setDuty` below is what asks the device
 * for a location and sends it there; `pushLocation` is the heartbeat that
 * follows while a screen keeps calling it.
 */
import * as Location from "expo-location";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { secureFields } from "@/services/secureStore";
import { setSessionExpiredHandler, type ApiError } from "@/services/api";
import { getMe, login as loginRequest, type SalesRep } from "@/services/auth";
import { sendLocation, setDuty as setDutyRequest } from "@/services/tracking";

export type Session = { token: string; salesRep: SalesRep };

/**
 * `Location.getCurrentPositionAsync` has no timeout of its own, and on a
 * device (or emulator) with a weak or absent GPS fix it can hang
 * indefinitely — which is exactly what made the switch look frozen: it sat
 * in its disabled/busy state forever, waiting on a promise that was never
 * going to settle. This bounds it, and falls back to the device's LAST
 * known fix (near-instant, no hardware wait) rather than failing outright —
 * a rep going online from roughly where they already were beats not being
 * able to go online at all.
 */
const FRESH_FIX_TIMEOUT_MS = 8000;

const getLocationFix = async (): Promise<{ lat: number; lng: number }> => {
  try {
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("TIMEOUT")), FRESH_FIX_TIMEOUT_MS);
      }),
    ]);
    return { lat: fresh.coords.latitude, lng: fresh.coords.longitude };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    if (!last) {
      throw new Error(
        "Could not get your location. Make sure location is turned on for this app and try again.",
      );
    }
    return { lat: last.coords.latitude, lng: last.coords.longitude };
  }
};

type AuthState = {
  hydrated: boolean;
  session: Session | null;
  /** True while a duty toggle is in flight — asking for permission, getting
      a fix, or waiting on the server. */
  dutyBusy: boolean;
  /** Set the instant a 401 proves the stored token is dead; cleared only once
      the rep acknowledges it — see `SessionExpiredWatcher`. */
  sessionExpired: boolean;

  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  acknowledgeSessionExpired: () => void;
  /**
   * Turning ON asks for location permission, takes one fix, and only THEN
   * calls the server — a rep who refuses permission never goes online with
   * no position behind it. Turning OFF needs neither. Throws on any failure
   * (permission refused, no GPS, the server refusing); the caller is what
   * shows that to the rep.
   */
  setDuty: (value: boolean) => Promise<void>;
  /**
   * The heartbeat, called by whatever screen is watching position while on
   * duty. Fire-and-forget, matching `driver/store/driverStore.ts`'s own
   * `pushLocation` — a screen mid-visit must not see an error banner because
   * one heartbeat among hundreds dropped.
   */
  pushLocation: (lat: number, lng: number) => void;
  /** Re-checks the stored token against the server, once, at launch — the
      same reason every other Lampose app's cold-start effect calls `/me`:
      a token cached as valid may have been revoked since the app was last
      open. Also the only way `onDuty` re-syncs after a relaunch. */
  refreshMe: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      session: null,
      dutyBusy: false,
      sessionExpired: false,

      signIn: async (email, password) => {
        const session = await loginRequest(email, password);
        set({ session });
      },

      signOut: () => {
        set({ session: null, sessionExpired: false });
      },

      acknowledgeSessionExpired: () => {
        set({ session: null, sessionExpired: false });
      },

      setDuty: async (value) => {
        const token = get().session?.token;
        if (!token) return;

        set({ dutyBusy: true });
        try {
          if (value) {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
              throw new Error("Location access is needed to go online.");
            }
            const coords = await getLocationFix();
            const salesRep = await setDutyRequest(token, true, coords);
            set((state) => (state.session ? { session: { ...state.session, salesRep } } : {}));
          } else {
            const salesRep = await setDutyRequest(token, false);
            set((state) => (state.session ? { session: { ...state.session, salesRep } } : {}));
          }
        } finally {
          set({ dutyBusy: false });
        }
      },

      pushLocation: (lat, lng) => {
        const token = get().session?.token;
        const onDuty = get().session?.salesRep?.onDuty;
        if (!token || !onDuty) return;
        void sendLocation(token, lat, lng).catch(() => {
          /* A dropped connection or a momentary 409 (raced with going
             offline) is not something a rep mid-visit needs to see — the
             next fix tries again. A dead token is handled by the
             session-expired flow, fired from `api()` itself. */
        });
      },

      refreshMe: async () => {
        const token = get().session?.token;
        if (!token) return;
        try {
          const salesRep = await getMe(token);
          set((state) => (state.session ? { session: { ...state.session, salesRep } } : {}));
        } catch (err) {
          /* A dead token is handled by the session-expired flow below, fired
             from `api()` itself. A dropped connection is not a dead session —
             the cached session survives it, the same rule every Lampose app
             in this monorepo follows. */
          if ((err as ApiError)?.status === 0) return;
        }
      },
    }),
    {
      name: "lampose-tracker",
      storage: createJSONStorage(() => secureFields(["session"])),
      partialize: (s) => ({ session: s.session }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[authStore] rehydrate failed, starting fresh", error);
        useAuthStore.setState({ hydrated: true });
      },
    },
  ),
);

/* The client reports a token the server has stopped accepting, from wherever
   in the app it was noticed. Registered once, outside any component, because
   the store itself — not a screen — is what owns the session. Does not clear
   the session directly: `sessionExpired` is a flag a screen shows a message
   for, and `acknowledgeSessionExpired` above is what actually signs out,
   matching every other app in this monorepo's move away from a silent
   sign-out. */
setSessionExpiredHandler(() => useAuthStore.setState({ sessionExpired: true }));
