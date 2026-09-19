const fs = require('fs');
const path = require('path');

/*
 * There is NO Firebase project for Stay Partner, and that is deliberate.
 *
 * Without `google-services.json` the Google Services Gradle plugin is never
 * applied and FCM is absent, so REMOTE push cannot work: the backend has no
 * token to address this handset with. `services/push/push.ts` already treats
 * that as an ordinary outcome — `getPushToken()` catches, logs
 * `[push] could not get a token: ...` and returns null, and no caller breaks.
 *
 * What still works, and is what the owner actually hears, is the LOCAL path:
 * `ensureLocalAlerts()` creates the `stay-requests` channel and asks for the
 * runtime permission, and `services/alertSound.ts` rings the doorbell itself
 * through `expo-audio`, falling back to a local notification. None of that
 * touches Firebase. So `expo-notifications` stays in the build — removing it
 * to be rid of Firebase would take the owner's alert with it, and a stay
 * request has a three-minute deadline.
 *
 * If a Firebase project is ever created for this app, add the file back here
 * and set `android.googleServicesFile`; nothing else needs to change.
 */

const adaptiveIconPath = path.join(__dirname, 'assets/images/adaptive-icon.png');
const adaptiveIcon = fs.existsSync(adaptiveIconPath) ? './assets/images/adaptive-icon.png' : undefined;

/**
 * Brand colours — keep in sync with partner theme tokens.
 */
const BRAND = {
  ink: '#1A1917',
  accent: '#0E6E5C',
  /*
   * GROUND, not the accent.
   *
   * The launch screen used to be a full-bleed dark green, which meant every
   * cold start opened on a saturated field and then cut to a light app one
   * frame later. Matching `bg` in `constants/colors.ts` makes that hand-off
   * invisible. Nothing here can read the palette at runtime — the OS bakes
   * these at build time — so it is a copy, and it has to be kept in step.
   */
  background: '#EFEDE9',
};

export default {
  expo: {
    name: 'Lampose Stay Partner',
    slug: 'lampose-stay-partner',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.jpeg',
    scheme: 'lamposepartner',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/images/lampose-logo.png',
      resizeMode: 'contain',
      backgroundColor: BRAND.background,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.lampose.staypartner.com',
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
      },
    },
    android: {
      package: 'com.lampose.staypartner.com',
      /* Kept in step with android/app/build.gradle by hand: android/ is
         tracked, so the Gradle file is what actually builds — but a future
         `expo prebuild` regenerates it from HERE, and a stale 1 would come
         back as a version Play has already taken. */
      versionCode: 2,
      adaptiveIcon: {
        foregroundImage: adaptiveIcon || './assets/images/icon.png',
        backgroundColor: BRAND.background,
      },
      permissions: [
        'POST_NOTIFICATIONS',
        'RECEIVE_BOOT_COMPLETED',
      ],
    },
    notification: {
      icon: './assets/images/icon.png',
      color: BRAND.accent,
    },
    web: {
      favicon: './assets/images/icon.png',
      bundler: 'metro',
    },
    plugins: [
      /*
       * `origin` used to point at https://replit.com/ — a leftover from where
       * this project was first scaffolded. expo-router resolves relative
       * links and any server routes against it, so a shipped build carried
       * someone else's domain as its base. Dropped rather than replaced: with
       * no origin the router uses the app's own scheme, which is what a
       * native build wants.
       */
      'expo-router',
      'expo-font',
      /* The crosshair on the address forms. Foreground only — nothing here
         tracks anybody; the permission is asked at the moment somebody taps
         "use my location" and the fix is used once to fill a form. */
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Lampose Partner uses your location once, when you tap it, to fill in your address.',
        },
      ],
      /* Registers the native audio session. The stay-request doorbell is
         played in the foreground by the app itself rather than by a
         notification, because a push needs a registered device token and
         there is none in Expo Go, on a simulator, on a refused permission,
         or before the first successful registration. See
         `services/alertSound.ts`. */
      'expo-audio',
      'expo-web-browser',
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: BRAND.accent,
          defaultChannel: 'stay-requests',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      appEnv: process.env.EXPO_PUBLIC_APP_ENV,
      eas: {
        projectId: 'fad3ed39-5253-4f81-9a9f-d5502b2a03de',
      },
    },
    owner: 'hosanna4190',
  },
};
