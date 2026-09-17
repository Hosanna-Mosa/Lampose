const fs = require('fs');
const path = require('path');

// Firebase Android push notifications config file
const googleServicesPath = path.join(__dirname, 'google-services.json');
/*
 * On EAS the file is not there at all.
 *
 * `google-services.json` is git-ignored — it should be — and EAS uploads the
 * project by the same rules, so a cloud build never receives it. Without this
 * the key is silently omitted and the APK builds, installs and runs with no
 * FCM: Android push dead, nothing in the log to say why.
 *
 * So EAS supplies it as a FILE environment variable, which materialises on the
 * builder and hands back an absolute path. Create it once with:
 *
 *   eas env:create --name GOOGLE_SERVICES_JSON --type file \
 *     --value ./google-services.json --environment production
 */
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
  || (fs.existsSync(googleServicesPath) ? './google-services.json' : undefined);

const adaptiveIconPath = path.join(__dirname, 'assets/images/adaptive-icon.png');
const adaptiveIcon = fs.existsSync(adaptiveIconPath) ? './assets/images/adaptive-icon.png' : undefined;

/**
 * Brand colours for the NATIVE chrome — keep in sync with `constants/tokens.ts`.
 *
 * These are the only colours in the app that JavaScript never gets to set: the
 * launch screen, the adaptive icon's plate and the notification tint are all
 * baked at build time by the OS. Nothing here can read `useTheme()`, so it has
 * to be copied, and copies rot — these were still the ORIGINAL purple brand
 * (#4B2BE0 on navy) two repaints after the app stopped using it, which meant
 * every cold start opened on a navy launch screen and handed over to a green
 * one, and every push notification arrived tinted purple.
 *
 * GROUND rather than INK for the launch background, so the hand-off to the
 * first React screen is invisible: the splash and `colors.bg` are now the same
 * value. The old dark background was a visible flash against a light app.
 *
 * ACCENT is the notification tint — the one place the colour is seen outside
 * the app entirely, in the shade next to other apps' icons.
 */
const BRAND = {
  ink: '#1A1917',
  accent: '#0E6E5C',
  // Kept equal to `colors.bg` in `constants/tokens.ts` — see the note above.
  // Both moved from the Dock sheet's warm `#EFEDE9` to true white on
  // 10 Sep 2026, together, for the same reason this comment already
  // explains: a launch screen out of sync with the first React frame is a
  // visible flash on cold start.
  background: '#FFFFFF',
};

export default {
  expo: {
    name: 'Lampose',
    slug: 'lampose',
    version: '1.0.2',
    orientation: 'portrait',
    icon: './assets/images/icon.jpeg',
    scheme: 'lampose',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/images/icon.jpeg',
      resizeMode: 'contain',
      backgroundColor: BRAND.background,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.lampose.users.com',
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
      },
      /* `react-native-maps` on iOS ships Apple Maps by default; this is what
         switches `DeliveryMap`'s `PROVIDER_GOOGLE` map over to real Google
         tiles there too, so both platforms show the same map. Blank if the
         env var is unset — the native module still boots, the map just has
         no imagery to draw and falls back to the same "waiting" caption an
         unset key already produces on Android. */
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      package: 'com.lampose.users.com',
      /* Play Store identity. `versionCode` is the integer Google Play orders
         releases by: it must rise on every upload and is never reused. 2 was
         published as 1.0.1, so this release is 3.

         NOTE: eas.json sets `cli.appVersionSource: "remote"`, which makes EAS's
         own server the source of truth and ignores the number below. Set that
         to "local" (and drop `autoIncrement`) for this value to be the one
         that ships. */
      versionCode: 4,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      adaptiveIcon: {
        foregroundImage: adaptiveIcon || './assets/images/icon.jpeg',
        backgroundColor: BRAND.background,
      },
      permissions: [
        'POST_NOTIFICATIONS',
        'RECEIVE_BOOT_COMPLETED',
      ],
      /* Android has no built-in maps renderer the way iOS does, so
         `react-native-maps` cannot draw anything at all here without this —
         not "a plain map instead of Google's", nothing. The manifest bakes
         this in at build time; changing `.env` needs a fresh native build; a
         JS-only reload will not pick it up. */
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
    },
    notification: {
      icon: './assets/images/icon.jpeg',
      color: BRAND.accent,
    },
    web: {
      favicon: './assets/images/icon.jpeg',
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
            'Lampose uses your location once, when you tap it, to fill in a delivery address so a rider can find your door.',
        },
      ],
      'expo-web-browser',
      /* The OS date dialog behind `DateField`. A config plugin rather than an
         autolinked module: it needs a compileSdk bump on Android. */
      '@react-native-community/datetimepicker',
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
        projectId: 'f954b7a0-c4da-49d9-80e7-89262c052954',
      },
    },
    owner: 'hosanna4190',
  },
};
