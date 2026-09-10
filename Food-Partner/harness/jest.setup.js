/* Runs in `setupFiles` — before the framework loads, which is where jest.mock()
   registrations belong.

   THE RULE THIS FILE OBEYS (F9): mock only LEAVES of the dependency graph —
   native modules, the network, the router. Never @/components, never @/lib,
   never @/theme, and never the store's own logic. A harness that mocks app
   source is theatre. harness/guards.test.js asserts this mechanically. */

const React = require('react');

/* ── Router ──────────────────────────────────────────────────────────────────
   The whole surface this app uses: router.push/replace/back/canGoBack,
   useFocusEffect, useLocalSearchParams, Stack(+Screen), Tabs(+Screen).
   Mocking it is what lets a route file be rendered as a plain component, with
   no NavigationContainer, no ExpoRoot, and no Suspense boundary to swallow
   content (F5). */
const mockRouterState = { params: {} };
global.__setRouteParams = (p) => { mockRouterState.params = p || {}; };

jest.mock('expo-router', () => {
  const R = require('react');
  const noop = jest.fn();
  const router = {
    push: noop, replace: noop, back: noop, dismiss: noop,
    dismissAll: noop, navigate: noop, setParams: noop, canGoBack: () => true,
  };
  /* Navigators render as string-typed host elements so their options stay
     visible in the tree: <Stack screenOptions={...}/> serialises as
     {"type":"Stack","props":{...}}, and a changed `animation` or
     `contentStyle` shows up in the diff instead of vanishing. */
  const nav = (name) => {
    const N = ({ children, ...props }) => R.createElement(name, props, children);
    N.Screen = ({ children, ...props }) => R.createElement(name + '.Screen', props, children);
    return N;
  };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: () => mockRouterState.params,
    useGlobalSearchParams: () => mockRouterState.params,
    useSegments: () => [],
    usePathname: () => '/',
    /* THE important one (F3). The real useFocusEffect runs its callback on
       mount. A no-op here silently freezes six screens — (dash)/index,
       (dash)/menu, (dash)/orders, (dash)/profile, support/index,
       support/[reference] — on their loading spinner, in BOTH the before and
       the after tree. That is playbook M6 with extra steps. */
    useFocusEffect: (cb) => R.useEffect(cb, [cb]),
    Stack: nav('Stack'),
    Tabs: require('./mocks/tabs').Tabs,
    Link: ({ children }) => children,
    Redirect: () => null,
  };
});

/* ── Store persistence leaf ──────────────────────────────────────────────────
   Real zustand, real 730 lines of selector/action logic. Only the AsyncStorage
   leaf it persists through is mocked; the seed goes in via setState. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

/* ── Safe area — insets MUST be non-zero (F10) ───────────────────────────────
   The shipped jest mock returns zeros, and zeros actively hide regressions:
   app/index.tsx:52 computes insets.top + space[5]; with top:0 that is 20 — the
   SAME number a refactor that dropped `insets.top +` would produce, so the bug
   would snapshot clean. With top:47 it is 67 vs 20 and diffs loudly. Same shape
   at (dash)/_layout.tsx:31, where Math.max(insets.bottom, space[3]) picks a
   different branch at 0 than at 34. Twelve files call useSafeAreaInsets. */
const mockInsets = { top: 47, right: 0, bottom: 34, left: 0 };
const mockFrame = { x: 0, y: 0, width: 390, height: 844 };
global.__INSETS = mockInsets;   // read by the F10 guard
jest.mock('react-native-safe-area-context', () => {
  const R = require('react');
  return {
    useSafeAreaInsets: () => mockInsets,
    useSafeAreaFrame: () => mockFrame,
    SafeAreaProvider: ({ children }) => R.createElement('SafeAreaProvider', null, children),
    SafeAreaView: ({ children, ...p }) => R.createElement('SafeAreaView', p, children),
    SafeAreaInsetsContext: R.createContext(mockInsets),
    initialWindowMetrics: { frame: mockFrame, insets: mockInsets },
  };
});

/* ── SVG → string host types ─────────────────────────────────────────────────
   components/ui/Icon.tsx renders every glyph as <Svg><Path d="…"/></Svg>, and
   ICON_PATHS entries run to five path strings. Unmocked, a screen with 20 icons
   adds several KB of near-identical geometry per snapshot. This keeps d, stroke
   and strokeWidth in the tree — a changed glyph still diffs — while dropping the
   native wrapper layers. Trade-off, stated plainly: react-native-svg's own prop
   plumbing is no longer verified. For a refactor where svg is a leaf nobody
   touches, that is the right trade. */
jest.mock('react-native-svg', () => {
  const R = require('react');
  const h = (n) => { const C = ({ children, ...p }) => R.createElement(n, p, children); C.displayName = n; return C; };
  const Svg = h('Svg');
  return { __esModule: true, default: Svg, Svg,
    Path: h('Path'), Circle: h('Circle'), Rect: h('Rect'), G: h('G'),
    Line: h('Line'), Defs: h('Defs'), ClipPath: h('ClipPath'),
    LinearGradient: h('LinearGradient'), Stop: h('Stop'), Polyline: h('Polyline') };
});

/* ── Native leaves ───────────────────────────────────────────────────────────
   Each of these is imported at MODULE scope somewhere, so an unmocked one
   throws on require rather than failing a render. */
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

jest.mock('expo-font', () => ({
  /* app/_layout.tsx:182 is `if (!typeReady) return null`. Return [false, null]
     here and the ROOT LAYOUT renders null in both trees and passes vacuously —
     F1, the literal M6 case. */
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: jest.fn(async () => {}),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: jest.fn(async () => {}),
  setOptions: jest.fn(),
}));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn(async () => {}) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })) }));
jest.mock('expo-linking', () => ({ createURL: (p) => 'lampose://' + p, openURL: jest.fn(async () => {}) }));
jest.mock('expo-device', () => ({ isDevice: true, osName: 'iOS', modelName: 'iPhone' }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: process.env.EXPO_PUBLIC_API_URL } }, sessionId: 'seed-session' },
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  dismissAllNotificationsAsync: jest.fn(async () => {}),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true })) }));

/* expo-location needs NO mock: app/onboarding/restaurant.tsx:393 requires it
   lazily inside a handler, never at render. expo-audio likewise — see the
   header comment in services/alertSound.ts. */

jest.mock('socket.io-client', () => ({ io: jest.fn(() => null) }));

/* ── Data layer ──────────────────────────────────────────────────────────────
   Mocked at the SERVICE boundary. services/foodPartner.ts has no simulation
   layer — its header says so — so every call either reaches the network or
   throws; there is no offline mode to lean on. Note @/services/api stays REAL:
   app/signin.tsx:106 reads its module-scope API_URL, which jest.config.js has
   already made truthy, and nothing calls api() because every caller is mocked. */
jest.mock('@/services/foodPartner', () => require('./fixtures/foodPartner'));
jest.mock('@/services/support', () => require('./fixtures/support'));
jest.mock('@/services/uploads', () => require('./fixtures/uploads'));
jest.mock('@/services/orderSocket', () => require('./fixtures/orderSocket'));
jest.mock('@/services/orderPump', () => require('./fixtures/orderPump'));
jest.mock('@/services/alertSound', () => require('./fixtures/alerts').alertSound);
jest.mock('@/services/orderAlerts', () => require('./fixtures/alerts').orderAlerts);
