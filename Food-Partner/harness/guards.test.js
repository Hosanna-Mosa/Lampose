/* Guards on the harness itself. These do not look at the app — they look at
   whether the harness is still capable of telling the truth. */
const fs = require('fs');
const path = require('path');
const ROUTES = require('./routes');

const root = path.join(__dirname, '..');

test('F9: mocks only leaves — never app source', () => {
  const setup = fs.readFileSync(path.join(__dirname, 'jest.setup.js'), 'utf8');
  const mocked = [...setup.matchAll(/jest\.mock\(\s*'([^']+)'/g)].map((m) => m[1]);
  const appMocks = mocked.filter((m) => m.startsWith('@/'));
  // The ONLY app-path mocks permitted are the service boundary. Mocking
  // @/components, @/lib, @/theme or the store's logic would make every
  // comparison theatre.
  for (const m of appMocks) expect(m.startsWith('@/services/')).toBe(true);
  expect(appMocks.length).toBeGreaterThan(0);
});

test('F10: safe-area insets are non-zero', () => {
  // Zeros would let a dropped `insets.top +` produce the same number as the
  // correct code at app/index.tsx:52.
  expect(global.__INSETS.top).toBeGreaterThan(0);
  expect(global.__INSETS.bottom).toBeGreaterThan(0);
});

test('F8: clock and locale are pinned', () => {
  expect(Date.now()).toBe(global.__FIXED_NOW);
  // If this string changes, it is the environment, not the refactor.
  expect(new Date(global.__FIXED_NOW).toISOString()).toBe('2026-03-15T09:30:00.000Z');
  expect(new Date(global.__FIXED_NOW).toLocaleDateString('en-US', { timeZone: 'UTC' })).toBe('3/15/2026');
});

test('F11: the route set on disk matches the manifest', () => {
  const walk = (dir, acc) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (e.name.endsWith('.tsx')) acc.push(path.relative(root, p));
    }
    return acc;
  };
  const onDisk = walk(path.join(root, 'app'), []).sort();
  const inManifest = [...new Set(ROUTES.map((r) => r.file))].sort();
  expect(onDisk).toEqual(inManifest);
});

test('react-test-renderer is pinned to react exactly', () => {
  const pkg = require(path.join(root, 'package.json'));
  expect(pkg.devDependencies['react-test-renderer']).toBe(pkg.dependencies.react);
});
