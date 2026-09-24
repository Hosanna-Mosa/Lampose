/**
 * Brand colours for the NATIVE chrome.
 *
 * The images in `assets/images/` are the master in `brand/` resized. A
 * splash with NO image is not "Expo's default" on an EAS build: expo-splash-
 * screen still references `drawable/splashscreen_logo`, nothing generates
 * it, and `:app:processReleaseResources` fails the whole build.
 * `logoGround` is the logo's own green, sampled from the artwork, so the
 * splash and the adaptive icon's inset show no seam around it.
 */
const BRAND = {
  background: '#FFFFFF',
  logoGround: '#0C4D35',
};

export default {
  expo: {
    name: 'Lampose Tracker',
    slug: 'lampose-tracker',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'lamposetracker',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    icon: './assets/images/icon.png',
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: BRAND.logoGround,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.lampose.tracker',
      infoPlist: {
        UIBackgroundModes: ['location'],
      },
    },
    android: {
      package: 'com.lampose.tracker',
      versionCode: 1,
      adaptiveIcon: {
        /* Inset inside Android's 66% safe circle, so a round mask does not
           slice the ends off the wordmark. */
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: BRAND.logoGround,
      },
      /* BACKGROUND_LOCATION + the LOCATION foreground service are what keep
         `services/backgroundLocation.ts` reporting with the app minimised or
         closed. RECEIVE_BOOT_COMPLETED is deliberately absent — see that
         file's header. */
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
        'android.permission.POST_NOTIFICATIONS',
      ],
    },
    web: {
      favicon: './assets/images/favicon.png',
      bundler: 'metro',
    },
    plugins: [
      'expo-router',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Lampose Tracker shares your location while you are online, including when the app is in the background, so the admin panel can see where you are visiting clients.',
          locationWhenInUsePermission:
            'Lampose Tracker uses your location while you are online so the admin panel can see where you are visiting clients.',
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
    ],
    experiments: {
      typedRoutes: false,
      reactCompiler: true,
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      eas: {
        projectId: '605c3358-a6d9-465c-aedc-eee17f349728',
      },
    },
  },
};
