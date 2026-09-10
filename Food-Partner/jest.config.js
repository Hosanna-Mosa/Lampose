/* Snapshot harness for the component refactor. Gate A of the Mobile Component
   Refactor Playbook: proves the render tree did not change. Nothing in app/ or
   components/ knows this file exists, and nothing in it may be imported by app
   code — see harness/guards.test.js (F9).

   REACT COMPILER: app.config.js sets experiments.reactCompiler: true, but that
   reaches Babel through Metro's *caller* (babel-preset-expo/build/index.js:74 ->
   caller.supportsReactCompiler, common.js:113). Jest transforms via babel-jest,
   whose caller does not set it, so the compiler does NOT run here. Verified both
   directions on 2026-09-10 — see evidence/harness-design.md. Do not "fix" this:
   the compiler is a memoisation transform and changes render counts, never the
   returned tree, so parity buys nothing and costs compiler analysis per file. */

process.env.TZ = 'UTC';
process.env.LC_ALL = 'en-US';
/* services/api.ts computes API_URL at module scope, and app/signin.tsx:106
   renders a "no server configured" banner when it is empty. Give it a value no
   mock will ever dial. */
process.env.EXPO_PUBLIC_API_URL = 'https://api.invalid.test';

module.exports = {
  /* Single platform, NOT the bare `jest-expo` preset — that one is a
     multi-project config (ios+android+web+node) and would run every case four
     times over. It also leaves Platform.OS ambiguous, which matters at
     app/support/new.tsx:112, app/support/[reference].tsx:218 and
     components/form/index.tsx:690,727,779. */
  preset: `jest-expo/${process.env.SNAP_PLATFORM || 'ios'}`,
  rootDir: __dirname,
  testMatch: ['<rootDir>/harness/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/'],

  moduleNameMapper: {
    // tsconfig paths: { "@/*": ["./*"] }. Metro reads that; Jest does not.
    '^@/(.*)$': '<rootDir>/$1',
    // 12 subpath font imports in app/_layout.tsx, all handed to a mocked
    // useFonts(). Resolving three font packages and their export maps is pure
    // startup cost for a value nothing reads.
    '^@expo-google-fonts/.*$': '<rootDir>/harness/mocks/googleFont.js',
  },

  setupFiles: [
    '<rootDir>/node_modules/react-native-gesture-handler/jestSetup.js',
    '<rootDir>/harness/jest.setup.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/harness/jest.setup.after.js'],

  /* transformIgnorePatterns is deliberately OMITTED. jest-expo's default covers
     expo*, react-native, @react-native*, @react-navigation*. Everything else this
     app pulls (zustand 5, socket.io-client 4) ships a CJS require condition and
     needs no transform. Transforming node_modules is the entire startup cost of
     this harness — only add a package here when a real error names it. Note the
     array is an OR of "do NOT transform" regexes, so appending makes Jest
     transform LESS, not more; widening means replacing it wholesale. */

  clearMocks: true,    // reset call history between cases
  resetMocks: false,   // but KEEP implementations set in setup
  restoreMocks: false,

  /* Determinism over parallelism: 25 cases x 2 profiles is one file's work, and
     one worker means one module registry and one transform pass. */
  maxWorkers: 1,
  cacheDirectory: '<rootDir>/.jest-cache',
  snapshotSerializers: [],
  testTimeout: 20000,
  verbose: false,
};
