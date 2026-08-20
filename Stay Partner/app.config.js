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
 * Brand colours — keep in sync with partner theme tokens.
 */
const BRAND = {
  ink: '#0F291E',
  accent: '#14492F',
  background: '#14492F',
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
      bundleIdentifier: 'com.lampose.staypartner',
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
      },
    },
    android: {
      package: 'com.lampose.staypartner',
      ...(googleServicesFile ? { googleServicesFile } : {}),
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
