/* ══════════════════════════════════════════════════════════════════════════
   Where the rep is while they are online, including with the app minimised
   or swiped away.

   ## The problem this solves

   `hooks/useDutyLocationHeartbeat.ts` used `watchPositionAsync` alone, which
   is a FOREGROUND watcher: Android stops delivering fixes to it shortly after
   the app leaves the screen. A rep went online, closed the app, and the admin
   panel showed them "Online" for twenty hours on the one position they sent
   in the first second.

   This file is the other half, and the same shape as
   `driver/services/backgroundLocation.ts`: a registered background task plus
   a LOCATION foreground service, which is the only combination Android will
   keep feeding position to once the app is not on screen. Both apps carry
   their own copy (no workspace tooling here); change one, look at the other.

   ## Why the task is defined at module scope

   `TaskManager.defineTask` must have run before the OS hands the task
   anything. Android can relaunch the app HEADLESS to deliver a batch of
   locations — no UI, no React tree — and a definition inside a component
   would not exist yet. It is registered by importing this file, which
   `store/authStore.ts` does.

   ## Why the token is read from storage rather than the store

   The headless relaunch starts a fresh JS context whose store has not
   rehydrated. So the handler reads the persisted session itself, through
   the same `getSecret` key `secureFields(["session"])` writes.

   ## What it deliberately does NOT do

   No BOOT_COMPLETED. A rebooted phone starts nothing until the app is opened
   again — from Android 15 starting a `location` foreground service from a
   boot receiver crashes the app. A force-stop from system settings also
   ends it; nothing an app does survives that.
   ══════════════════════════════════════════════════════════════════════════ */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { ApiError, API_URL } from "./api";
import { getSecret } from "./secureStore";
import { sendLocation } from "./tracking";

/** Registered with the OS under this name. Changing it orphans a task that a
 *  previously-installed build may still have running. */
export const DUTY_LOCATION_TASK = "lampose-sales-duty-location";

/** `persist`'s name in `store/authStore.ts`, plus the one secret field. */
const SESSION_SECRET_KEY = "lampose-tracker.session";

/** The rep's session, read the way a headless context has to read it. */
async function readSession(): Promise<{ token: string | null; onDuty: boolean }> {
  try {
    const raw = await getSecret(SESSION_SECRET_KEY);
    if (!raw) return { token: null, onDuty: false };
    const session = JSON.parse(raw) as { token?: string; salesRep?: { onDuty?: boolean } } | null;
    return { token: session?.token ?? null, onDuty: Boolean(session?.salesRep?.onDuty) };
  } catch {
    /* Unreadable storage reads as "no session", which stops tracking rather
       than looping on a token that cannot be produced. */
    return { token: null, onDuty: false };
  }
}

TaskManager.defineTask(DUTY_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    /* Permission revoked mid-shift, or location switched off system-wide.
       Nothing here can fix it. */
    console.warn("[bg-location] task error:", error.message);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;

  const { token, onDuty } = await readSession();

  /* Signed out, or went offline while a batch was in flight. Stopping HERE
     covers a process killed between going offline and `stopDutyTracking`. */
  if (!token || !onDuty) {
    await stopDutyTracking();
    return;
  }

  /* The newest fix only — a batch is the OS catching up after a doze, and
     the server keeps the path by time anyway. */
  const last = locations[locations.length - 1];

  try {
    await sendLocation(token, last.coords.latitude, last.coords.longitude, last.coords.accuracy);
  } catch (err) {
    const status = (err as ApiError)?.status;
    /* 409 NOT_ON_DUTY: the server says this rep is offline (turned off from
       another device, say). 401: the session is dead. Either way nobody is
       listening for these fixes, so the notification and the GPS drain end. */
    if (status === 409 || status === 401) {
      await stopDutyTracking();
    }
    /* Anything else — a lift, a basement, a dropped connection — is
       swallowed; the next fix is seconds away. */
  }
});

/**
 * Begin background tracking for a rep who is now online. Safe to call
 * repeatedly — a running task is left alone rather than restarted.
 *
 * Returns whether background tracking is actually running, so the caller can
 * fall back to a foreground-only watcher when the rep refused "Allow all the
 * time".
 */
export async function startDutyTracking(): Promise<boolean> {
  if (!API_URL) return false;

  try {
    if (await Location.hasStartedLocationUpdatesAsync(DUTY_LOCATION_TASK)) {
      return true;
    }

    /* Foreground first, then background — Android refuses the background
       request outright otherwise, and on Android 11+ sends the rep to a
       settings screen to choose "Allow all the time". */
    const foreground = await Location.getForegroundPermissionsAsync();
    if (foreground.status !== "granted") {
      const asked = await Location.requestForegroundPermissionsAsync();
      if (asked.status !== "granted") return false;
    }

    const background = await Location.getBackgroundPermissionsAsync();
    if (background.status !== "granted") {
      const asked = await Location.requestBackgroundPermissionsAsync();
      if (asked.status !== "granted") return false;
    }

    await Location.startLocationUpdatesAsync(DUTY_LOCATION_TASK, {
      /* High, not Balanced: on Android Balanced is Wi-Fi/cell positioning,
         routinely 100–500 m off, which drew paths down streets the rep
         never walked. High turns the GPS on. */
      accuracy: Location.Accuracy.High,
      /* The same cadence the foreground watcher used, so the admin map looks
         the same whether the app is open or not. */
      timeInterval: 15000,
      distanceInterval: 30,
      deferredUpdatesInterval: 30000,
      deferredUpdatesDistance: 30,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Other,
      /* THE foreground service. Without it Android throttles the task to a
         handful of fixes an hour, and it is also what legally tells the rep
         their location is being shared. */
      foregroundService: {
        notificationTitle: "You're online",
        notificationBody: "Sharing your location with Lampose until you go offline.",
        notificationColor: "#059669",
        killServiceOnDestroy: false,
      },
      showsBackgroundLocationIndicator: true,
    });

    return true;
  } catch (err) {
    console.warn("[bg-location] could not start:", (err as Error).message);
    return false;
  }
}

/** Stop tracking. Never throws — it runs while going offline and signing out. */
export async function stopDutyTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(DUTY_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(DUTY_LOCATION_TASK);
    }
  } catch {
    /* Already stopped, or never registered in this process. */
  }
}
