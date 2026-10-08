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

/* The script "Lampose" logo (Oct 2026), white on transparent and inside the
   adaptive icon's 66% safe zone; its plate is `BRAND.launch`. */
const adaptiveIconPath = path.join(__dirname, 'assets/images/adaptive-icon-foreground.png');
const adaptiveIcon = fs.existsSync(adaptiveIconPath) ? './assets/images/adaptive-icon-foreground.png' : undefined;

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
 * LAUNCH is the logo's own green, the colour the animated splash
 * (`components/auth/SplashSequence.tsx`) opens on, so the hand-off from the
 * OS's launch screen to the first React frame is invisible. The splash then
 * fades the whole screen out into the app, which is where the light `colors.bg`
 * takes over — that fade is the transition, so there is no hard flash.
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
  // The new logo's green, sampled from the logo artwork. Kept equal to
  // `LOGO.green` in `components/auth/SplashSequence.tsx`, so the launch
  // screen hands over to the animated splash with no change of colour.
  launch: '#0A714E',
};

export default {
  expo: {
    name: 'Lampose',
    slug: 'lampose',
    version: '1.0.3',
    orientation: 'portrait',
    icon: './assets/images/app-icon.png',
    scheme: 'lampose',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    /* Only the green: the animated splash writes the logo in, so the OS must
       not show it first and have it vanish. */
    splash: {
      image: './assets/images/splash-blank.png',
      resizeMode: 'contain',
      backgroundColor: BRAND.launch,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.lampose.users.com',
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
        /* The app uses only the system's standard HTTPS — no encryption of
           its own — so it is exempt from export documentation. Declaring it
           here stops App Store Connect holding every build in TestFlight
           until somebody answers the encryption question by hand. */
        ITSAppUsesNonExemptEncryption: false,
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
         published as 1.0.1 and 4 was built as 1.0.2, so this release is 5.

         A local `gradlew bundleRelease` reads `android/app/build.gradle`, not
         this file — the two are bumped together.

         NOTE: eas.json sets `cli.appVersionSource: "remote"`, which makes EAS's
         own server the source of truth and ignores the number below. Set that
         to "local" (and drop `autoIncrement`) for this value to be the one
         that ships. */
      versionCode: 5,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      adaptiveIcon: {
        foregroundImage: adaptiveIcon || './assets/images/app-icon.png',
        backgroundColor: BRAND.launch,
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
      favicon: './assets/images/app-icon.png',
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
      /* Two foreground-only uses, both started by a tap: "Use my current
         location" on the area screen (places within a radius of you) and the
         crosshair on the address forms. Nothing tracks anybody. App Review
         checks that this sentence describes EVERY use, so it names both. */
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Lampose uses your location only when you tap "Use my current location", to show places near you and to fill in your address.',
        },
      ],
      'expo-web-browser',
      /* EAS builds this app at ".../User App" — see the plugin. */
      './plugins/withQuotedBundleScript',
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
        projectId: 'd1f19acf-5d14-4a6c-b512-df0274f9fd0c',
      },
    },
    owner: 'lampose.com',
  },
};
