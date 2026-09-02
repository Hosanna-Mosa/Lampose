/* ══════════════════════════════════════════════════════════════════════════
   Making a delivery offer impossible to miss.

   A rider's phone is in a pocket, on a scooter, screen off. The socket
   delivers an offer to a screen that is open; this is what delivers it to a
   phone that is not — and for a rider, "not open" is the ordinary case. An
   offer nobody sees for fifteen seconds is a job that went to somebody else.

   ## Two channels, and they are deliberately not one

   An offer expires in fifteen seconds and has to be able to ring through Do
   Not Disturb. "Your payout landed" can wait. One channel for both means the
   rider either silences the payouts or misses the work — and on Android the
   CHANNEL, not the payload, is what decides whether a notification makes a
   sound. A channel created with default importance is silent no matter what
   the server sends.

   The ids must match the ones the backend sends. Both are named in
   `Backend/src/modules/drivers/dispatch.notifier.js`; renaming one without
   the other produces an alert that arrives perfectly and says nothing.

   ## Nothing here is required for the offer to work

   The socket and the four-second poll both deliver the same offer into the
   same idempotent handler. A rider who refuses notification permission still
   gets their work whenever the app is open — they simply have to be looking.
   So every failure below is swallowed and returns null: a refused permission,
   a simulator with no push service, a missing project id. None of them should
   stop somebody using the app.
   ══════════════════════════════════════════════════════════════════════════ */
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/** Must equal OFFER_CHANNEL in the backend's dispatch.notifier.js. */
export const OFFER_CHANNEL = "delivery-offers";
/** Must equal JOB_CHANNEL there. Quieter: nothing is being asked of the rider. */
export const JOB_CHANNEL = "delivery-updates";

/**
 * Show, and make a noise, even with the app open.
 *
 * Set once at module load rather than inside a component, because an offer can
 * arrive before any screen has mounted — a push can wake the app from cold.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Create the two channels the alerts are routed through.
 *
 * MAX importance on the offer channel is what earns a heads-up banner and a
 * sound on Android; the vibration pattern is long and double-pulsed because a
 * phone in a jacket pocket on a moving scooter loses a single default buzz.
 */
export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(OFFER_CHANNEL, {
      name: "Delivery offers",
      description: "Rings when a delivery is offered to you. Expires in 15 seconds.",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 500, 200, 500],
      lightColor: "#22A355",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });

    await Notifications.setNotificationChannelAsync(JOB_CHANNEL, {
      name: "Delivery updates",
      description: "Quieter updates about a delivery you are already carrying.",
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  } catch {
    /* A channel that cannot be created leaves the alert quieter, not broken.
       Not worth failing a sign-in over. */
  }
}

export type PushRegistration = { token: string; platform: string } | null;

/**
 * Ask for permission and return this handset's Expo token.
 *
 * Null on a simulator, on a refusal, or when the project id is missing — all
 * three are ordinary. The caller registers the token with the backend only
 * when there is one.
 */
export async function getPushToken(): Promise<PushRegistration> {
  /* A simulator has no push service. Asking produces an error that reads like
     a real fault and is not one. */
  if (!Device.isDevice) return null;

  try {
    await ensureChannels();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== "granted") {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== "granted") return null;

    const response = await Notifications.getExpoPushTokenAsync();
    if (!response?.data) return null;

    return { token: response.data, platform: Platform.OS };
  } catch {
    return null;
  }
}
