/* ══════════════════════════════════════════════════════════════════════════
   The noise a stay request makes, played by the app itself.

   ## Why this exists when there is already a push notification

   `services/push/push.ts` sends the request to a phone that is ASLEEP. This is
   the other half: a phone that is AWAKE. The two do not overlap, and neither
   covers the other's case.

   A request arrives over the four-second poll in `useStayRequests` and lands
   in `IncomingRequestAlert`. If the app is open, no notification is involved
   at all — `setNotificationHandler` shows a banner, but an owner holding the
   handset and looking at their bookings gets a strip that slides past in
   silence. That is the single most common way an owner is holding the phone
   when a request lands, and it was the one case with no sound in it.

   And a push cannot be relied on to cover it. `pushAvailable()` returns false
   on a simulator, in Expo Go (Android push was removed in SDK 53), before the
   first successful registration and on a refused permission — and the food
   side of this product had ZERO registered handsets in production for exactly
   that reason. Anything that must be heard has to be played locally.

   ## One tone, distinct from the other two partner apps

   The Food-Partner app plays a warm two-note chime and the driver app three
   rising staccato pulses. This one is a doorbell — a bright descending major
   third, struck three times — because that is literally what is happening:
   somebody is at the property asking to stay. It also has to be a THIRD
   distinct sound, since an owner who also runs a kitchen may have all three
   apps on one counter, and two apps sharing a tone is two people reaching for
   one phone.

   ## Three minutes is why it is loud

   `playsInSilentMode` is on. An alert that respects the ringer switch is an
   alert that never plays, and this is a deadline arriving rather than a
   notification chime: the student is watching a bar drain, and in three
   minutes the request closes itself and tells them nobody answered.

   ## Nothing here is allowed to fail loudly

   A device with no audio route, a session another app has taken, a file that
   did not bundle — every one of those returns quietly. The sheet is on screen
   with a countdown either way; the sound is what makes the owner look at it,
   not what delivers it.
   ══════════════════════════════════════════════════════════════════════════ */
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logInfo } from '@/lib/log';

/** The Android channel `push.ts` creates, at MAX importance with its own vibration. */
const REQUEST_CHANNEL = 'stay-requests';

/*
 * `expo-audio` is required LAZILY, and that is load-bearing.
 *
 * Its `AudioModule` calls `requireNativeModule('ExpoAudio')` at MODULE scope,
 * which throws when the native module is not in the running build — Expo Go,
 * or a dev client built before the package was added. A top-level
 * `import { createAudioPlayer } from 'expo-audio'` therefore throws while this
 * file is being evaluated, and every screen that imports it fails to render.
 *
 * That is not hypothetical: the same mistake took the whole Orders screen down
 * in Food-Partner, so a kitchen that was merely missing a chime saw no orders
 * at all. A missing native module has to cost the sound and nothing else —
 * which matters more here than anywhere, because this app is started with
 * `expo start --offline` against Expo Go every day.
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
    audio = require('expo-audio') as LoadedAudio;
  } catch {
    /* Not in this build. Say so once — a silent alert is worth one line in the
       log, because "why is there no sound" is otherwise unanswerable.
       This is the NORMAL case in Expo Go, which is how this app is started
       day to day, so the fallback below is the path that actually runs. */
    audioMissing = true;
    logInfo(
      '[alert] expo-audio is not in this build — the request alert falls back to a local '
      + 'notification. For the real tone run `npx expo run:android` (a JS reload is not '
      + 'enough for a native module).',
    );
  }
  return audio;
}

/* Loaded once and reused. Creating a player per request means decoding the
   file on the main thread at the exact moment a three-minute countdown starts,
   and the first play is the one that must not be late. */
let player: AudioPlayerLike | null = null;
let configured = false;

const source = require('@/assets/sounds/new-request.wav');

/**
 * Prepare the audio session and decode the tone.
 *
 * Called at sign-in so the first request plays immediately. Safe to call more
 * than once — the second call is a no-op.
 */
export async function primeRequestSound(): Promise<void> {
  if (configured) return;
  configured = true;

  /*
   * The fallback is prepared even when the audio module IS present.
   *
   * `playRequestAlert` drops to a local notification whenever the player could
   * not be built — no audio route, a session another app holds, a decode that
   * failed. Asking for the channel and the permission only at that moment
   * means the very first alert is the one that finds them missing, which is
   * the alert that mattered. Idempotent and cheap, so it happens up front.
   */
  try {
    const { ensureLocalAlerts } = require('./push/push') as {
      ensureLocalAlerts: () => Promise<boolean>;
    };
    await ensureLocalAlerts();
  } catch {
    /* Notifications unavailable entirely. The tone below may still work. */
  }

  try {
    const mod = loadAudio();
    if (!mod) return;

    /*
     * The two settings that decide whether an owner hears this at all.
     *
     * `playsInSilentMode` — see the header. A phone lives on silent and this
     * is work arriving.
     *
     * `shouldPlayInBackground: false` — the push notification owns the
     * backgrounded case, and holding an audio session while backgrounded is
     * what makes Android kill the app.
     */
    await mod.setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
      interruptionModeAndroid: 'duckOthers',
    });
    player = mod.createAudioPlayer(source);
  } catch {
    /* No audio route, or a session we cannot take. The sheet still shows. */
    player = null;
  }
}

/**
 * Ring, and buzz.
 *
 * Both, because they fail in different places: a phone on silent with the
 * ringer switch respected has no sound, and a phone face-down on a desk
 * transmits the buzz better than the speaker carries the tone. Between them
 * one of the two lands.
 */
export async function playRequestAlert(): Promise<void> {
  try {
    /* Haptics first — it is synchronous enough to be felt at the same instant
       the tone starts, and it cannot be blocked by an audio session. */
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }

    if (!player) await primeRequestSound();
    if (!player) {
      /*
       * No audio module in this build — make the OS ring instead.
       *
       * `expo-notifications` is already native here, and `push.ts` creates
       * `stay-requests` at MAX importance with its own vibration pattern, so
       * a LOCAL notification through it is audible with no push token, no EAS
       * project id and no rebuild. An owner on Expo Go still hears a request
       * arrive.
       *
       * `kind` is deliberately not one `usePushRouting` routes on — this is a
       * noise, not a second delivery of a request the query cache already
       * holds, and routing on it would push the same screen twice.
       */
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'New booking request',
          body: 'A student is waiting for your answer.',
          data: { kind: 'request.localAlert' },
          sound: 'default',
          ...(Platform.OS === 'android' ? { channelId: REQUEST_CHANNEL } : null),
        },
        trigger: null,
      }).catch(() => {});
      return;
    }

    /* Rewound rather than replayed from wherever it stopped. A second request
       arriving while the first tone is still ringing must sound like a fresh
       alert, not like the tail of the last one. */
    player.seekTo(0);
    player.play();
  } catch {
    /* Never worth surfacing: the sheet and its countdown are the real signal. */
  }
}

/** Release the decoded tone. Called when the session ends. */
export function releaseRequestSound(): void {
  try {
    player?.remove();
  } catch {
    /* Already gone. */
  }
  player = null;
  configured = false;
}
