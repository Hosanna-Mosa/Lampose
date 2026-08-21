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
  background: '#EFEDE9',
};

export default {
  expo: {
    name: 'Lampose',
    slug: 'lampose',
    version: '1.0.0',
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
      bundleIdentifier: 'com.lampose.user',
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
      },
    },
    android: {
      package: 'com.lampose.user',
      ...(googleServicesFile ? { googleServicesFile } : {}),
      adaptiveIcon: {
        foregroundImage: adaptiveIcon || './assets/images/icon.jpeg',
        backgroundColor: BRAND.background,
      },
      permissions: [
        'POST_NOTIFICATIONS',
        'RECEIVE_BOOT_COMPLETED',
      ],
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
