/* ══════════════════════════════════════════════════════════════════════════
   The noise a new order makes, played by the app itself.

   ## Why the push was never enough

   `orderAlerts.ts` sends the order to a handset that is asleep, and its own
   header already says the foreground is the case that actually matters — a
   kitchen has this app OPEN on a counter tablet, face-up, across the room.
   What it could not fix from there is that a push needs a registered device
   token, and `getPushToken` returns null on a simulator, on a refused
   permission, and before the first successful registration.

   That is not a hypothetical. The first restaurant in production had ZERO
   registered handsets for exactly those reasons, so `notifyRestaurantOfOrder`
   logged "no handset is registered to this restaurant" and returned, and the
   kitchen learned about each order on the twenty-second poll — silently, with
   a list that had quietly grown by one. Nobody knew an order had come in.

   A tone the app plays itself needs no token, no permission and no push
   service. It is the only part of this chain with nothing between the event
   and the sound.

   ## A different tone from the rider's

   The Driver app plays three rising staccato pulses — urgent, because a rider
   has fifteen seconds. This is a warm two-note doorbell chime with a long
   decay: a kitchen is a loud room, but nobody here is racing a countdown, and
   a rider collecting at the counter is standing next to this tablet. One tone
   across both apps is two people reaching for the same phone.
   ══════════════════════════════════════════════════════════════════════════ */
import * as Notifications from "expo-notifications";
import { Platform, Vibration } from "react-native";

import { logWarn } from "@/lib/log";

import { ORDER_CHANNEL } from "./orderAlerts";

/*
 * `expo-audio` is required LAZILY, and that is load-bearing.
 *
 * Its `AudioModule` calls `requireNativeModule('ExpoAudio')` at MODULE scope,
 * which throws when the native module is not in the running build — Expo Go,
 * or a dev client built before the package was added. A top-level
 * `import { createAudioPlayer } from "expo-audio"` therefore throws while this
 * file is being evaluated, and every screen that imports it fails to render.
 *
 * That is not hypothetical: it took the whole Orders screen down, so a kitchen
 * that was merely missing a chime saw no orders at all. A missing native module
 * has to cost the sound and nothing else.
 */
type LoadedAudio = {
  createAudioPlayer: (source: unknown) => AudioPlayerLike;
  setAudioModeAsync: (mode: Record<string, unknown>) => Promise<void>;
};

/** Only the three methods used here, so no type import from the module either. */
type AudioPlayerLike = { seekTo: (s: number) => void; play: () => void; remove: () => void };

let audio: LoadedAudio | null = null;
let audioMissing = false;

function loadAudio(): LoadedAudio | null {
  if (audio || audioMissing) return audio;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audio = require("expo-audio") as LoadedAudio;
  } catch {
    /* Not in this build. Say so once — a silent alert is worth one line in the
       log, because "why is there no sound" is otherwise unanswerable. */
    audioMissing = true;
    logWarn(
      "[alert] expo-audio is not in this build — alerts will be silent. "
      + "Rebuild with `npx expo run:android` (a JS reload is not enough for a native module).",
    );
  }
  return audio;
}

/**
 * Long and double-pulsed, not a tap.
 *
 * The same pattern the Orders screen has always used, moved here so "alert the
 * kitchen" is one call rather than a chime in one file and a buzz in another
 * that can drift apart. A kitchen is a loud room and a counter tablet is often
 * in a rigid stand: a single default buzz is lost in both.
 */
const KITCHEN_BUZZ = [0, 400, 200, 400];

/* Decoded once and reused. Building a player per order means reading the file
   off disk at the moment the ticket lands, and the sound arriving late is the
   sound arriving after somebody has walked away from the counter. */
let player: AudioPlayerLike | null = null;
let configured = false;

const source = require("@/assets/sounds/new-order.wav");

/**
 * Prepare the audio session and decode the chime.
 *
 * Called at startup so the first order rings immediately. Safe to call twice.
 */
export async function primeOrderSound(): Promise<void> {
  if (configured) return;
  configured = true;
  try {
    /*
     * `playsInSilentMode` is the setting this whole file turns on.
     *
     * A counter tablet is almost always on silent — it is a shared device
     * nobody wants pinging through service. An alert that respects the ringer
     * switch is an alert that never plays, and this is a customer waiting for
     * food rather than a social notification.
     *
     * `shouldPlayInBackground: false` because the push owns the backgrounded
     * case, and holding an audio session in the background is what gets an app
     * killed by Android.
     */
    const mod = loadAudio();
    if (!mod) return;

    await mod.setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: "mixWithOthers",
      interruptionModeAndroid: "duckOthers",
    });
    player = mod.createAudioPlayer(source);
  } catch {
    /* No audio route, or a session another app holds. The queue still shows
       the order — this only decides whether anybody looks up. */
    player = null;
  }
}

/**
 * Chime, and buzz.
 *
 * Both, because they fail in different rooms: a tablet in a loud kitchen may
 * not be heard, and a tablet in a rigid counter stand transmits almost no
 * vibration. Between the two, one of them lands.
 */
export async function playNewOrderAlert(): Promise<void> {
  try {
    Vibration.vibrate(KITCHEN_BUZZ);

    if (!player) await primeOrderSound();
    if (!player) {
      /*
       * No audio module in this build — make the OS do it instead.
       *
       * `expo-notifications` is already native in every build that has ever
       * shipped this app, and `ORDER_CHANNEL` was created at MAX importance
       * with `sound: 'default'`, so a LOCAL notification routed through it
       * rings without any push token, any push service, or a rebuild. It is
       * the system tone rather than our chime — the point is that the kitchen
       * hears something today, on the build already on the counter.
       *
       * `kind` is deliberately NOT 'food_order': the Orders screen listens for
       * that value and calls this function, so reusing it would ring, reload,
       * ring, reload, forever.
       */
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "New order",
          body: "A diner has placed an order.",
          data: { kind: "food_order_local" },
          sound: "default",
          ...(Platform.OS === "android" ? { channelId: ORDER_CHANNEL } : null),
        },
        trigger: null,
      }).catch(() => {});
      return;
    }

    /* Rewound rather than resumed. Two orders inside one chime's decay must
       sound like two orders, not like one long note. */
    player.seekTo(0);
    player.play();
  } catch {
    /* Never surfaced: the queue on screen is the real record. */
  }
}

/** Release the decoded chime. Called when the partner signs out. */
export function releaseOrderSound(): void {
  try {
    player?.remove();
  } catch {
    /* Already gone. */
  }
  player = null;
  configured = false;
}
