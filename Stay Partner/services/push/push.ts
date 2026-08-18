import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Getting this device on the list of handsets the backend can reach.
 *
 * ## Why this exists at all
 *
 * A stay request gives the owner three minutes to answer. Neither person is
 * going to be staring at the app when it matters — the owner is doing
 * something else, and the student has usually locked their phone — so a
 * notification is not a nicety here. Without it the flow degrades to "whoever
 * happened to have the app open", and a three-minute deadline expires almost
 * every time.
 *
 * ## The parts that are easy to get wrong
 *
 * **Expo Go cannot do this.** Android push was removed from Expo Go in SDK 53,
 * so a token requested there either fails or comes back unusable. Testing
 * needs a development build (`npx expo run:android`, or an EAS dev build).
 * `pushAvailable()` below says which case you are in rather than failing
 * silently, because "no notifications arrived" has too many possible causes to
 * debug blind.
 *
 * **A simulator cannot do this either.** Push is a real-device feature;
 * `Device.isDevice` is the check, and skipping it produces a confusing
 * failure deep inside `getExpoPushTokenAsync`.
 *
 * **Android needs a channel** before it will display anything, and the
 * backend addresses ours by id (`stay-requests`). Creating it is idempotent
 * and cheap, so it happens on every register rather than once somewhere
 * fragile.
 *
 * **Permission is asked for, never assumed.** A student who says no still
 * gets every screen in the app; they just have to keep it open to watch a
 * countdown. That is a worse experience, not a broken one, and the app must
 * not nag or block on it.
 *
 * ## Tokens identify an installation, not a person
 *
 * A token is reissued on reinstall and revoked when the app is removed, which
 * is why `register()` runs on every sign-in rather than once, and why
 * `unregister()` runs on sign-out: leaving it behind means the next person to
 * use a shared handset sees the previous account's alerts on the lock screen.
 */

/* How a notification behaves when it lands while the app is open.
   Banners stay on, because the one that matters most — "the owner accepted" —
   can arrive while somebody is looking at a different screen. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** What the backend puts in `data`, so a tap can go straight to the screen. */
export type PushPayload = {
  kind:
    | 'request.created'
    | 'request.accepted'
    | 'request.declined'
    | 'request.inventoryTaken'
    | 'request.expired'
    | 'request.cancelled';
  requestId: string;
  listingId?: string;
  status?: string;
  expiresAt?: string | null;
};

export type PushAvailability =
  | { ok: true }
  | { ok: false; reason: 'SIMULATOR' | 'EXPO_GO' | 'NO_PROJECT_ID' | 'DENIED'; message: string };

/** Issued by `eas init`; empty until somebody runs it against the Expo account. */
const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
  ?.eas?.projectId
  || (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId
  || '';

/* `expo` in Expo Go, `standalone`/`storeClient` otherwise. Checked because
   the failure it predicts is silent and the cause is not guessable. */
const inExpoGo = Constants.appOwnership === 'expo';

/**
 * Can this build receive a push, and if not, why.
 *
 * Returned rather than thrown so a screen can say the true thing — "open a
 * development build to test notifications" is actionable; "something went
 * wrong" is not.
 */
export function pushAvailable(): PushAvailability {
  if (!Device.isDevice) {
    return { ok: false, reason: 'SIMULATOR', message: 'Notifications need a real device.' };
  }
  if (inExpoGo) {
    return {
      ok: false,
      reason: 'EXPO_GO',
      message: 'Expo Go cannot receive push notifications. Use a development build.',
    };
  }
  if (!projectId) {
    return {
      ok: false,
      reason: 'NO_PROJECT_ID',
      message: 'No EAS project id — run `eas init` and put it in app.json under extra.eas.projectId.',
    };
  }
  return { ok: true };
}

/** Android shows nothing without one, and the backend sends to this id. */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('stay-requests', {
    name: 'Stay requests',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#14492F',
    /* The deadline is the whole point — it has to be visible on a locked
       screen, not hidden behind "tap to reveal". */
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}

/**
 * Ask for permission and get this device's token.
 *
 * Null on every unhappy path, with the reason logged. There is no throwing
 * variant: no caller has anything useful to do with an exception here, and one
 * that escaped would take down whatever screen triggered sign-in.
 */
export async function getPushToken(): Promise<string | null> {
  const available = pushAvailable();
  if (!available.ok) {
    console.log(`[push] not available — ${available.message}`);
    return null;
  }

  try {
    await ensureChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    /* Asked once, at sign-in, and never again from here. Re-prompting after a
       refusal does nothing on iOS anyway — the OS only shows the dialog once
       — and re-asking on every launch is how an app teaches somebody to
       reflexively decline. */
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }

    if (status !== 'granted') {
      console.log('[push] permission not granted — the app works, the phone just will not buzz');
      return null;
    }

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data || null;
  } catch (error) {
    console.log('[push] could not get a token:', (error as Error).message);
    return null;
  }
}

/**
 * Listen for notifications, and for taps.
 *
 * Two separate things, and the difference matters: `received` fires while the
 * app is open — the moment to refresh a screen quietly — and `tapped` fires
 * when somebody deliberately opened it, which is the moment to navigate. A
 * handler that navigated on `received` would yank somebody out of whatever
 * they were doing.
 *
 * Returns a teardown. Call it on unmount, or a hot reload leaves listeners
 * stacked and each notification fires four times.
 */
export function addPushListeners(handlers: {
  onReceived?: (payload: PushPayload) => void;
  onTapped?: (payload: PushPayload) => void;
}): () => void {
  const received = Notifications.addNotificationReceivedListener((notification) => {
    const payload = notification.request.content.data as PushPayload | undefined;
    if (payload?.requestId) handlers.onReceived?.(payload);
  });

  const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
    const payload = response.notification.request.content.data as PushPayload | undefined;
    if (payload?.requestId) handlers.onTapped?.(payload);
  });

  return () => {
    received.remove();
    tapped.remove();
  };
}

/**
 * The notification that opened the app from cold.
 *
 * Not covered by the listeners above: when the process was dead, the tap that
 * started it has already happened by the time anything mounts. Without this,
 * tapping "your request was accepted" on a killed app lands on the home screen
 * instead of the request — which reads as the notification being broken.
 */
export async function getInitialPush(): Promise<PushPayload | null> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    const payload = response?.notification.request.content.data as PushPayload | undefined;
    return payload?.requestId ? payload : null;
  } catch {
    return null;
  }
}

/** Clear the badge and any lingering banners — on sign-out, say. */
export async function clearPushState(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
  } catch {
    /* Cosmetic. Never worth surfacing. */
  }
}
