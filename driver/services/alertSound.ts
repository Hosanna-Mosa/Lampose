/* ══════════════════════════════════════════════════════════════════════════
   The noise a delivery offer makes, played by the app itself.

   ## Why this exists when there is already a push notification

   `offerAlerts.ts` sends the offer to a phone that is asleep. This is the
   other half: a phone that is AWAKE. The two do not overlap, and neither
   covers the other's case.

   An offer arrives over the socket or the four-second poll and lands in
   `receiveOffer`. If the app is open, no notification is involved at all —
   there is nothing for the OS to show — so before this file the rider got a
   screen that changed silently. A phone in a cradle on a handlebar, screen on,
   is the single most common way a rider waits for work, and it was the one
   case with no sound in it.

   And a push cannot be relied on to cover it. `getPushToken` returns null on
   a simulator, on a refused permission, and before the first successful
   registration; the restaurant side of this product had ZERO registered
   handsets in production for exactly that reason. Anything that must be heard
   has to be played locally.

   ## One tone, distinct from the kitchen's

   The Food-Partner app plays a warm two-note chime. This one is three rising
   staccato pulses — deliberately urgent, deliberately not the same sound,
   because a rider collecting from a counter is standing next to a tablet that
   also rings. Two apps with one tone is two people reaching for one phone.

   ## Nothing here is allowed to fail loudly

   A device with no audio route, a session another app has taken, a file that
   did not bundle — every one of those returns quietly. The offer is on screen
   with a countdown either way; the sound is what makes the rider look at it,
   not what delivers it.
   ══════════════════════════════════════════════════════════════════════════ */
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { OFFER_CHANNEL } from "./offerAlerts";

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
    console.warn(
      "[alert] expo-audio is not in this build — alerts will be silent. "
      + "Rebuild with `npx expo run:android` (a JS reload is not enough for a native module).",
    );
  }
  return audio;
}

/* Loaded once and reused. Creating a player per offer means decoding the file
   on the main thread at the exact moment a fifteen-second countdown starts,
   and the first play is the one that must not be late. */
let player: AudioPlayerLike | null = null;
let configured = false;

const source = require("@/assets/sounds/offer.wav");

/**
 * Prepare the audio session and decode the tone.
 *
 * Called at startup so the first offer plays immediately. Safe to call more
 * than once — the second call is a no-op.
 */
export async function primeOfferSound(): Promise<void> {
  if (configured) return;
  configured = true;
  try {
    /*
     * The two settings that decide whether a rider hears this at all.
     *
     * `playsInSilentMode` — a rider's phone lives on silent. An alert that
     * respects the ringer switch is an alert that never plays, and this is
     * work arriving rather than a notification chime.
     *
     * `shouldPlayInBackground: false` — the push notification owns the
     * backgrounded case, and holding an audio session while backgrounded is
     * what makes Android kill the app.
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
    /* No audio route, or a session we cannot take. The offer still shows. */
    player = null;
  }
}

/**
 * Ring, and buzz.
 *
 * Both, because they fail in different places: a phone on silent with the
 * ringer switch respected has no sound, and a phone in a rigid handlebar
 * cradle transmits almost no vibration. Between them one of the two lands.
 */
export async function playOfferAlert(): Promise<void> {
  try {
    /* Haptics first — it is synchronous enough to be felt at the same instant
       the tone starts, and it cannot be blocked by an audio session. */
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }

    if (!player) await primeOfferSound();
    if (!player) {
      /*
       * No audio module in this build — make the OS ring instead.
       *
       * `expo-notifications` is already native here, and `OFFER_CHANNEL` was
       * created at MAX importance with its own double-pulse vibration, so a
       * LOCAL notification through it is audible with no push token and no
       * rebuild. A rider on yesterday's build still hears their work arrive.
       *
       * `kind` is deliberately not one the app routes on — this is a noise,
       * not a second delivery of an offer the store already holds.
       */
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "New delivery offer",
          body: "Open Lampose Driver to accept it.",
          data: { kind: "delivery_offer_local" },
          sound: "default",
          ...(Platform.OS === "android" ? { channelId: OFFER_CHANNEL } : null),
        },
        trigger: null,
      }).catch(() => {});
      return;
    }

    /* Rewound rather than replayed from wherever it stopped. A second offer
       arriving while the first tone is still ringing must sound like a fresh
       alert, not like the tail of the last one. */
    player.seekTo(0);
    player.play();
  } catch {
    /* Never worth surfacing: the countdown on screen is the real signal. */
  }
}

/** Release the decoded tone. Called when the session ends. */
export function releaseOfferSound(): void {
  try {
    player?.remove();
  } catch {
    /* Already gone. */
  }
  player = null;
  configured = false;
}
