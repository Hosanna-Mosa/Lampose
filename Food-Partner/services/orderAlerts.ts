/* ══════════════════════════════════════════════════════════════════════════
   Making a new order impossible to miss.

   This is the one notification in the product somebody is standing and
   waiting for. A stay request can be read in an hour; an order nobody
   notices for ten minutes is a cold meal and a refund. So it arrives loud,
   on every handset the restaurant registered, and it wakes the Orders tab.

   ## Why the channel matters more than the payload

   On Android 8 and later the CHANNEL decides whether a notification makes a
   sound — not the message. A channel created with default importance is
   silent no matter what the server sends, and the server's `sound: 'default'`
   is then simply ignored. So the channel is created here at startup with
   MAX importance and its own vibration pattern, and its id must match the one
   the backend sends. Both are named in `Backend/src/modules/foodpartners/
   foodOrder.notifier.js`; renaming one without the other produces an alert
   that arrives perfectly and says nothing.

   ## The foreground is the case that actually matters

   A kitchen has the app OPEN on a counter tablet. In the foreground the OS
   plays nothing by default — a notification is considered redundant when you
   are already looking at the app — which is exactly wrong here, because
   "looking at the app" means the tablet is face-up across the room. So the
   handler below opts foreground notifications back into sound, and the
   Orders screen additionally plays a tone of its own.
   ══════════════════════════════════════════════════════════════════════════ */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { ringForPushedOrder } from "./orderPump";
import { ringForPushedTableBooking } from "./tablePump";

/** Must equal ORDER_CHANNEL in the backend's foodOrder.notifier.js. */
export const ORDER_CHANNEL = "food-orders";

/**
 * Show, and make a noise, even with the app open.
 *
 * Set once at module load rather than in a component, because a notification
 * can arrive before any screen has mounted.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = (notification.request.content.data ?? {}) as {
      kind?: string;
      orderNumber?: string;
      reference?: string;
    };
    /* A new order while the app is open: the order pump rings its own alert,
       once per order, so the push shows its banner without a second sound.
       A table request rides the same channel and gets the same treatment
       from the table pump. */
    const pumpRang =
      (data.kind === "food_order" && ringForPushedOrder(data.orderNumber))
      || (data.kind === "table_booking" && ringForPushedTableBooking(data.reference));
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: !pumpRang,
      shouldSetBadge: true,
    };
  },
});

/**
 * Create the channel the alert is routed through.
 *
 * MAX importance is what earns a heads-up banner and a sound on Android. The
 * vibration pattern is deliberately long and double-pulsed: a kitchen is a
 * loud room, and the default single buzz is lost in it.
 */
export async function ensureOrderChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(ORDER_CHANNEL, {
      name: "New orders",
      description: "Rings when a diner places an order with your restaurant.",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 400, 200, 400],
      lightColor: "#22A355",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });

    /* Support replies and status changes — the backend sends them on
       `support` (support.notifier.js), and no app used to create it. */
    await Notifications.setNotificationChannelAsync("support", {
      name: "Support",
      description: "Replies from Lampose support.",
      importance: Notifications.AndroidImportance.HIGH,
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
 * three are ordinary, and none of them should stop a partner using the app.
 * The caller registers the token with the backend only when there is one.
 */
export async function getPushToken(): Promise<PushRegistration> {
  /* A simulator has no push service. Asking produces an error that reads like
     a real fault and is not one. */
  if (!Device.isDevice) return null;

  try {
    await ensureOrderChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== "granted") {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== "granted") return null;

    /* The EAS project id, as the User App passes it. Without one,
       `getExpoPushTokenAsync` fails on a standalone build — caught below and
       returned as null — so a kitchen silently got no background alerts at
       all. Read from `extra.eas.projectId` (set from EAS_PROJECT_ID in
       app.config.js) or the id EAS injects into a linked build. */
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
      || (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId) {
      console.warn("[push] No EAS project id — set EAS_PROJECT_ID (run `eas init`). Order alerts will not arrive in the background.");
      return null;
    }

    const response = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!response?.data) return null;

    return { token: response.data, platform: Platform.OS };
  } catch {
    return null;
  }
}
