/* Runs in `setupFilesAfterEnv` — after the framework is up, which is where
   beforeEach/afterEach and matchers belong. */

const { cleanup } = require('@testing-library/react-native');
const { usePartnerStore } = require('@/store/partnerStore');
const seed = require('./fixtures/seed');

/* Frozen clock. Modern fake timers freeze Date/Date.now/setTimeout but leave the
   PROMISE microtask queue real, which is what lets `await act(async () => {})`
   still flush the mocked service promises.

   It matters at: app/status.tsx:128-129 (toLocaleDateString/TimeString),
   app/(dash)/orders.tsx:445 (toLocaleString), app/onboarding/documents.tsx:36
   (Math.ceil((then - Date.now())/86_400_000) — the FSSAI expiry countdown), and
   lib/when.ts:42-46 (today / "Yesterday" / older branches). */
const FIXED = new Date('2026-03-15T09:30:00.000Z').getTime();
global.__FIXED_NOW = FIXED;

beforeAll(() => { jest.useFakeTimers({ now: FIXED, doNotFake: ['queueMicrotask'] }); });
afterAll(() => { jest.useRealTimers(); });

beforeEach(async () => {
  /* Math.random is only reached through lib/uid.ts, which is never called from a
     render body — its four call sites are store actions, an async loader and an
     onPress. Seed it anyway so a future call cannot introduce drift. */
  let s = 0x2f6e2b1;
  jest.spyOn(Math, 'random').mockImplementation(() => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 1e9) / 1e9;
  });

  /* Let the real persist middleware settle against the mocked AsyncStorage
     (getItem -> null, so onRehydrateStorage just flips `hydrated`), THEN seed.
     Seeding first loses the race with rehydration and the session is wiped. */
  usePartnerStore.setState(usePartnerStore.getInitialState
    ? usePartnerStore.getInitialState()
    : {}, false);
  if (usePartnerStore.persist && usePartnerStore.persist.rehydrate) {
    await usePartnerStore.persist.rehydrate();
  }
  seed.applyTo(usePartnerStore);
});

afterEach(() => { cleanup(); jest.restoreAllMocks(); });

/* Silence EXACTLY the React 19 react-test-renderer deprecation and nothing else.
   A blanket console.error silence is itself a failure mode (F7): it would hide
   "not wrapped in act", "Each child needs a key", and RN prop errors — the early
   warnings that a refactor changed render timing. Everything else is counted. */
const realError = console.error;
const realWarn = console.warn;
global.__consoleNoise = { errors: 0, warns: 0, messages: [] };
console.error = (...a) => {
  if (typeof a[0] === 'string' && a[0].includes('react-test-renderer is deprecated')) return;
  global.__consoleNoise.errors++;
  global.__consoleNoise.messages.push(String(a[0]).slice(0, 200));
  realError(...a);
};
console.warn = (...a) => {
  global.__consoleNoise.warns++;
  global.__consoleNoise.messages.push(String(a[0]).slice(0, 200));
  realWarn(...a);
};
