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

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { logWarn } from "@/services/log";
import { getSecret } from "@/services/secureStore";
import { api, API_URL } from "@/utils/api";

/** Registered with the OS under this name. Changing it orphans a task that a
 *  previously-installed build may still have running. */
export const DELIVERY_LOCATION_TASK = "lampose-delivery-location";

/** The key `persist` writes in `store/driverStore.ts`. */
const STORE_KEY = "driver-store";

type PersistedShape = {
  state?: { token?: string | null; currentJob?: unknown };
};

/**
 * The rider's session, read the way a headless context has to read it.
 *
 * `store/driverStore.ts` persists through `secureFields(["token"])`, which
 * lifts `token` out of the AsyncStorage blob into the Keychain/Keystore and
 * leaves the rest (`currentJob`, etc.) behind under `${STORE_KEY}.token` — see
 * `services/secureStore.ts`. Reading `parsed.state.token` straight off the
 * AsyncStorage blob is therefore stale the moment a real device has
 * persisted once: it is only ever populated in that blob before the first
 * `setItem` migrates it out. The secure store is checked first, exactly as
 * `secureFields.getItem` does, with the AsyncStorage copy kept only as the
 * pre-migration fallback for an install that has never written since. */
async function readSession(): Promise<{ token: string | null; hasJob: boolean }> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return { token: null, hasJob: false };
    const parsed = JSON.parse(raw) as PersistedShape;

    let secureToken: string | null = null;
    try {
      const stored = await getSecret(`${STORE_KEY}.token`);
      secureToken = stored !== null ? (JSON.parse(stored) as string | null) : null;
    } catch {
      /* Keystore unreadable — fall back to whatever the blob still has. */
    }

    return {
      token: secureToken ?? parsed?.state?.token ?? null,
      hasJob: Boolean(parsed?.state?.currentJob),
    };
  } catch {
    /* Unreadable or half-written storage. Treated as "no session", which stops
       tracking rather than looping on a token that cannot be produced. */
    return { token: null, hasJob: false };
  }
}

TaskManager.defineTask(DELIVERY_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    /* The OS reporting its own failure — permission revoked mid-shift, or
       location switched off at the system level. Nothing here can fix it, and
       throwing would just be logged and dropped. */
    logWarn("[bg-location] task error:", error.message);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;

  const { token, hasJob } = await readSession();

  /*
   * Signed out, or the delivery ended while a batch was in flight.
   *
   * Stopping HERE matters: `stopDeliveryTracking` is called on every path that
   * ends a job, but a process killed between the last fix and that call would
   * leave the service running with nothing to report — a notification in the
   * rider's shade and a GPS drain for a delivery that finished.
   */
  if (!token || !hasJob) {
    await stopDeliveryTracking();
    return;
  }

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
export async function startDeliveryTracking(): Promise<boolean> {
  if (!API_URL) return false;

  try {
    if (await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK)) {
      return true;
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
      timeInterval: 5000,
      distanceInterval: 15,
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
        notificationTitle: "Delivery in progress",
        notificationBody: "Sharing your location with Lampose until you deliver.",
        notificationColor: "#0F5F52",
        killServiceOnDestroy: false,
      },
      showsBackgroundLocationIndicator: true,
    });

    return true;
  } catch (err) {
    logWarn("[bg-location] could not start:", (err as Error).message);
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
