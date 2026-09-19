const fs = require('fs');
const path = require('path');

const googleServicesPath = path.join(__dirname, 'google-services.json');
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
  || (fs.existsSync(googleServicesPath) ? './google-services.json' : undefined);

/**
 * Brand colours for the NATIVE chrome — keep in sync with `theme/index.ts`.
 *
 * These are the only colours the app never gets to set from JavaScript: the
 * launch screen and the adaptive icon's plate are baked at build time by the
 * OS. GROUND rather than INK behind the splash, so the hand-off to the first
 * React screen is invisible — the splash and `colors.bg` are the same value.
 */
const BRAND = {
  ink: '#101214',
  accent: '#22A355',
  background: '#F1F2F4',
};

export default {
  expo: {
    name: 'Lampose Partner',
    slug: 'lampose-food-partner',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'lamposepartner',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: BRAND.background,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.lampose.foodpartner.com',
    },
    android: {
      package: 'com.lampose.foodpartner.com',
      /* Kept in step with android/app/build.gradle by hand — android/ is
         tracked, so the Gradle file is what builds, but `expo prebuild`
         regenerates it from HERE and a stale value would be a version Play
         has already taken. */
      versionCode: 3,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: BRAND.background,
      },
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'CAMERA',
        'POST_NOTIFICATIONS',
        'VIBRATE',
        'READ_EXTERNAL_STORAGE',
      ],
    },
    web: {
      favicon: './assets/images/favicon.png',
      bundler: 'metro',
    },
    plugins: [
      'expo-router',
      'expo-font',
      /* Registers the native audio session for the new-order chime. The tone is
         played in the foreground by the app itself rather than left to the
         notification, because a push needs a registered device token — and
         there is none on a simulator, on a refused permission, or before the
         first successful registration. A kitchen that hears nothing is the one
         failure this app cannot have. */
      'expo-audio',
      'expo-web-browser',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Lampose Partner uses your location to drop the pin on your kitchen, so riders are sent to the door rather than to the address text.',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission:
            'Lampose Partner needs your photo library to attach dish photos and licence scans to your application.',
          cameraPermission:
            'Lampose Partner needs the camera to photograph your licence, PAN card and cancelled cheque.',
        },
      ],
      /* The OS time dialog behind the opening-hours picker. A config plugin
         rather than an autolinked module: it needs a compileSdk bump. */
      '@react-native-community/datetimepicker',
      [
        /* The order alert. `color` tints the small icon in the shade — the one
           place this app's green is seen outside it. The Android CHANNEL that
           actually decides whether it makes a sound is created at runtime in
           `services/orderAlerts.ts`, because a channel's importance cannot be
           set from here. */
        'expo-notifications',
        {
          icon: './assets/images/notification-icon.png',
          color: BRAND.accent,
          defaultChannel: 'food-orders',
        },
      ],
    ],
    experiments: {
      typedRoutes: false,
      reactCompiler: true,
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
    },
  },
};
