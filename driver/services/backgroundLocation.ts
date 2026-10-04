/* ══════════════════════════════════════════════════════════════════════════
   Where the rider is while a delivery is running, including with the phone in
   their pocket.

   ## The problem this solves

   `hooks/useDriverLocation.ts` watches position with `watchPositionAsync`,
   which is a FOREGROUND watcher: Android stops delivering fixes to it shortly
   after the app leaves the screen. A rider locks their phone, puts it in a
   jacket and rides — and from the dispatcher's side they stop moving. The
   customer's map freezes on a street the food left five minutes ago.

   This file is the other half: a registered background task plus a LOCATION
   foreground service, which is the only combination Android will keep feeding
   position to once the app is not on screen.

   ## Why the task is defined at module scope

   `TaskManager.defineTask` must have run before the OS hands the task
   anything. Android can relaunch the app HEADLESS to deliver a batch of
   locations — no UI, no navigation, no React tree — and if the definition
   lived inside a component or an effect it would not exist yet, so the batch
   would be dropped and the handler silently never called. At module scope it
   is registered by the act of importing this file, which `store/driverStore.ts`
   does.

   ## Why the token is read from storage rather than the store

   That headless relaunch starts a fresh JS context. The Zustand store in it is
   a newly-created one whose `token` is null until rehydration finishes, and
   nothing awaits that on this path. So the handler reads the persisted blob
   directly — the same key `persist` writes, the same shape — and never assumes
   there is a live store to ask.

   ## What it deliberately does NOT do

   No BOOT_COMPLETED. Tracking starts when a rider takes a delivery and stops
   when it ends; a rebooted phone starts nothing until the app is opened again.
   From Android 15 starting a `location` foreground service from a boot
   receiver throws `ForegroundServiceStartNotAllowedException` and kills the
   app, so this is both what was asked for and the only thing that works.
   ══════════════════════════════════════════════════════════════════════════ */

import * as Location from "expo-location";
import { Alert, AppState, Platform } from "react-native";
import * as TaskManager from "expo-task-manager";

import { secureFields } from "@/services/secureStore";
import { api, API_URL } from "@/utils/api";

/** Registered with the OS under this name. Changing it orphans a task that a
 *  previously-installed build may still have running. */
export const DELIVERY_LOCATION_TASK = "lampose-delivery-location";

/** The key `persist` writes in `store/driverStore.ts`. */
const STORE_KEY = "driver-store";

type PersistedShape = {
  state?: { token?: string | null; currentJob?: unknown; isOnline?: boolean };
};

/**
 * The rider's session, read the way a headless context has to read it.
 *
 * Through `secureFields`, the same reader `persist` uses — not a raw
 * AsyncStorage read. The token was moved out of the AsyncStorage blob into
 * the keystore, so reading the blob alone found `token: null` on every real
 * device, and the first background batch then stopped tracking for good. The
 * keystore read works headless; this also keeps the inline legacy copy
 * working for an install that has not migrated yet.
 */
async function readSession(): Promise<{ token: string | null; hasJob: boolean; isOnline: boolean }> {
  try {
    const raw = await secureFields(["token"]).getItem(STORE_KEY);
    if (!raw) return { token: null, hasJob: false, isOnline: false };
    const parsed = JSON.parse(raw) as PersistedShape;
    return {
      token: parsed?.state?.token ?? null,
      hasJob: Boolean(parsed?.state?.currentJob),
      isOnline: Boolean(parsed?.state?.isOnline),
    };
  } catch {
    /* Unreadable or half-written storage. Treated as "no session", which stops
       tracking rather than looping on a token that cannot be produced. */
    return { token: null, hasJob: false, isOnline: false };
  }
}

TaskManager.defineTask(DELIVERY_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    /* The OS reporting its own failure — permission revoked mid-shift, or
       location switched off at the system level. Nothing here can fix it, and
       throwing would just be logged and dropped. */
    console.warn("[bg-location] task error:", error.message);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;

  const { token, hasJob, isOnline } = await readSession();

  /*
   * Signed out, or the delivery ended while a batch was in flight.
   *
   * Stopping HERE matters: `stopDeliveryTracking` is called on every path that
   * ends a job, but a process killed between the last fix and that call would
   * leave the service running with nothing to report — a notification in the
   * rider's shade and a GPS drain for a delivery that finished.
   */
  /* On duty counts too, not only carrying a job: an online rider waiting
     with the screen off used to stop reporting, and after
     `LOCATION_MAX_AGE_MS` the dispatcher left them out of every search while
     their app still said "online". */
  if (!token || !(hasJob || isOnline)) {
    await stopDeliveryTracking();
    return;
  }

  /* With the app in front, the foreground watch already reports (throttled in
     `pushLocation`). The two together ran past the server's rate limit on
     every delivery, and the 429s that followed starved BOTH of them. This
     service is for the screen-off time it exists for. */
  if (AppState.currentState === "active") return;

  /* The newest fix only. A batch arrives when the OS has been buffering — on a
     doze wake, say — and the intermediate points describe where the rider was,
     not where they are. The server keeps last-known position, so sending five
     in order would end on the right one anyway, at five times the cost. */
  const last = locations[locations.length - 1];
  const heading =
    typeof last.coords.heading === "number" && last.coords.heading >= 0
      ? last.coords.heading
      : undefined;

  try {
    await api(`/api/v2/drivers/me/location`, {
      method: "PATCH",
      body: {
        lat: last.coords.latitude,
        lng: last.coords.longitude,
        ...(heading !== undefined ? { heading } : null),
      },
      token,
      timeoutMs: 8000,
    });
  } catch {
    /* Swallowed on purpose. A rider in a lift or a basement car park produces
       these constantly, there is no screen to show an error on, and the next
       fix is seconds away. A silence that LASTS is already handled: the server
       ages the position out and stops offering, which is correct. */
  }
});

/**
 * Begin tracking for a delivery that is now in hand.
 *
 * Safe to call repeatedly — an already-running task is left alone rather than
 * restarted, because restarting drops the foreground notification and puts a
 * fresh one in the shade for a delivery that never paused.
 *
 * Returns whether background tracking is actually running, so a caller can
 * tell the difference between "tracking" and "tracking only while on screen".
 */
/**
 * How often the service reports. `delivery` is the live map a diner watches;
 * `duty` is a rider waiting for an offer, where a fix every 15 s / 50 m keeps
 * them inside the dispatcher's freshness window at a third of the battery and
 * well under the server's per-rider rate limit.
 */
export type TrackingMode = "delivery" | "duty";

const MODE_OPTIONS: Record<TrackingMode, { timeInterval: number; distanceInterval: number; title: string; body: string }> = {
  delivery: {
    timeInterval: 5000,
    distanceInterval: 15,
    title: "Delivery in progress",
    body: "Sharing your location with Lampose until you deliver.",
  },
  duty: {
    timeInterval: 15000,
    distanceInterval: 50,
    title: "You are online",
    body: "Sharing your location with Lampose so nearby orders can reach you.",
  },
};

/** The mode the running service was started in, in THIS process. Null after a
    restart, which simply means the next call restarts it once. */
let runningMode: TrackingMode | null = null;

/**
 * Start, switch or stop the service to match where the rider is: carrying a
 * job, on duty and waiting, or neither.
 */
export async function syncTracking({ online, hasJob }: { online: boolean; hasJob: boolean }): Promise<void> {
  if (hasJob) await startDeliveryTracking("delivery");
  else if (online) await startDeliveryTracking("duty");
  else await stopDeliveryTracking();
}

/**
 * The prominent disclosure Google Play requires before background location.
 *
 * Said in the app, in plain words, BEFORE the system prompt: what is
 * collected (location), when (while online or delivering, even with the app
 * closed or the screen off), and why (to send nearby orders and show the
 * customer where their food is). The request used to go straight from
 * Accept / Go online to the system dialog, which Play policy does not allow.
 * Resolves true only if the rider chooses to continue.
 */
function discloseBackgroundLocation(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Location while you work",
      "Lampose collects your location while you are online or delivering an order, "
        + "even when the app is closed or the screen is off. It is used to send you "
        + "nearby orders and to show customers and restaurants where their delivery is. "
        + "It stops when you go offline.\n\n"
        + (Platform.OS === "android"
          ? 'On the next screen, choose "Allow all the time".'
          : 'On the next screen, choose "Always".'),
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function startDeliveryTracking(mode: TrackingMode = "delivery"): Promise<boolean> {
  if (!API_URL) return false;

  try {
    if (await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK)) {
      if (runningMode === mode) return true;
      /* Running in the other mode (or a mode this process never saw). The
         options are fixed at start, so switching is a stop and a start. */
      await Location.stopLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
    }

    /*
     * Foreground first, then background — that order is required on Android.
     * `requestBackgroundPermissionsAsync` is refused outright if foreground has
     * not already been granted, and on Android 11+ it sends the rider to a
     * settings screen to choose "Allow all the time" rather than showing a
     * dialog.
     */
    const foreground = await Location.getForegroundPermissionsAsync();
    if (foreground.status !== "granted") {
      const asked = await Location.requestForegroundPermissionsAsync();
      if (asked.status !== "granted") return false;
    }

    const background = await Location.getBackgroundPermissionsAsync();
    if (background.status !== "granted") {
      /* Refused for good: the system will not ask again, and a disclosure
         shown before a request that cannot happen is just a nag. */
      if (background.canAskAgain === false) return false;
      if (!(await discloseBackgroundLocation())) return false;
      const asked = await Location.requestBackgroundPermissionsAsync();
      if (asked.status !== "granted") {
        /*
         * Refused, and the delivery goes ahead anyway.
         *
         * This is the one decision in this file worth being careful about. A
         * rider who declines "all the time" still has a job to deliver, and
         * `useDriverLocation` keeps reporting while the app is on screen. The
         * cost is a frozen marker once they pocket the phone — worse than
         * tracking, far better than refusing to let them work.
         */
        return false;
      }
    }

    await Location.startLocationUpdatesAsync(DELIVERY_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      /* Matches the foreground watcher in `useDriverLocation` so the two
         cannot disagree about how often a rider appears to move. */
      timeInterval: MODE_OPTIONS[mode].timeInterval,
      distanceInterval: MODE_OPTIONS[mode].distanceInterval,
      /* Batching is what lets Android sleep the radio between fixes. Small
         enough that a doze wake still reports a current position. */
      deferredUpdatesInterval: 10000,
      deferredUpdatesDistance: 25,
      pausesUpdatesAutomatically: false,
      /*
       * THE foreground service. Without this block Android treats the task as
       * an ordinary background job and throttles it to a handful of fixes an
       * hour — which looks exactly like the bug this file exists to fix.
       *
       * The notification is not decoration: it is the thing that makes the
       * service legal and visible, and Android requires the app to tell the
       * rider their location is being used.
       */
      foregroundService: {
        notificationTitle: MODE_OPTIONS[mode].title,
        notificationBody: MODE_OPTIONS[mode].body,
        notificationColor: "#0F5F52",
        killServiceOnDestroy: false,
      },
      showsBackgroundLocationIndicator: true,
    });
    runningMode = mode;

    return true;
  } catch (err) {
    console.warn("[bg-location] could not start:", (err as Error).message);
    return false;
  }
}

/**
 * Stop tracking. Called on every path that ends a delivery, and by the task
 * itself if it wakes to find no job.
 *
 * Never throws: it runs during sign-out and job completion, and a rider must
 * not be held on a screen — or worse, shown an error — because a service they
 * cannot see refused to stop.
 */
export async function stopDeliveryTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
    }
    runningMode = null;
  } catch {
    /* Already stopped, or the task was never registered in this process. */
  }
}

/** Whether the background service is running right now. */
export async function isDeliveryTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
  } catch {
    return false;
  }
}
