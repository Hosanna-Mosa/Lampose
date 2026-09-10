/* GATE A — the render-tree snapshot.

   Run after every refactor step. Seconds, exact, and it names precisely what
   changed. It is NOT a substitute for gate B: it compares the tree the app
   DESCRIBES; only a simulator shows what the phone actually DRAWS from that
   description.

     npm run snap          verify against the committed baseline
     npm run snap:capture  (re)write the baseline

   Verify mode FAILS on a missing baseline rather than writing one. That is the
   difference between a harness and a rubber stamp — Jest's own toMatchSnapshot
   writes-on-missing, which is exactly the behaviour you do not want mid-refactor. */

const fs = require('fs');
const path = require('path');
const React = require('react');
const { render, act } = require('@testing-library/react-native');

const ROUTES = require('./routes');
const { serialize, digest } = require('./serialize');

const root = path.join(__dirname, '..');
const UPDATE = process.env.SNAP_UPDATE === '1';
const PLATFORM = process.env.SNAP_PLATFORM || 'ios';
const PROFILES = (process.env.SNAP_PROFILES || 'resolved,error').split(',');

const dirFor = (profile) => path.join(root, 'snapshots', PLATFORM, profile);
const manifest = {};

/* The six screens that load ONLY inside useFocusEffect. If the router mock ever
   regresses to a no-op useFocusEffect, all six freeze on their spinner in both
   the before and the after tree — six screens passing while verifying nothing. */
const FOCUS_LOADERS = new Set([
  'dash-index', 'dash-menu', 'dash-orders', 'dash-profile',
  'support-index', 'support-reference',
]);

async function settle(view) {
  /* Two drains, not one: several screens await sequentially (getMe then a second
     call; fetchCategories -> setState -> effect). Under-flushing snapshots a
     spinner on one run and a body on the next — an intermittent false diff.
     Then assert the tree has actually stopped moving. */
  let prev = null, next = JSON.stringify(serialize(view.toJSON()));
  for (let i = 0; i < 8 && prev !== next; i++) {
    prev = next;
    await act(async () => { await Promise.resolve(); jest.advanceTimersByTime(0); });
    next = JSON.stringify(serialize(view.toJSON()));
  }
  expect(prev).toBe(next);              // F4: converged, not still churning
  return view.toJSON();
}

for (const profile of PROFILES) {
  describe(`${PLATFORM} / ${profile}`, () => {
    for (const route of ROUTES) {
      test(route.name, async () => {
        global.__SNAP_PROFILE__ = profile;
        global.__setRouteParams(route.params);

        const Screen = require(path.join(root, route.file)).default;
        expect(typeof Screen).toBe('function');

        const view = render(React.createElement(Screen));
        const tree = await settle(view);
        const json = JSON.stringify(serialize(tree), null, 2);
        const d = digest(tree);

        // ── F1: a null tree is not a pass ──────────────────────────────────
        expect(tree).not.toBeNull();
        expect(d.nodes).toBeGreaterThan(0);

        if (route.must) {
          // ── F5: a tree with no text is a placeholder, not a screen ───────
          expect(d.texts).toBeGreaterThan(0);
          /* ── F6: prove the thing under test was actually on screen.
             Scoped to `resolved` on purpose: in the `error` profile a data
             screen is SUPPOSED to render its error card instead of its body,
             so asserting the body there would be asserting the bug. What the
             error profile proves is that the error path still renders at all,
             and — through the snapshot compare below — that it did not move. */
          if (profile === 'resolved') {
            for (const s of route.must) expect(d.text).toContain(s);
          }
        }

        if (profile === 'resolved') {
          // ── F2: nine screens share this gate; without a session they all
          //        render it identically, before and after ──────────────────
          expect(d.text).not.toContain('You are signed out');
          // ── F3: a settled resolved tree that still says "Loading" is a
          //        broken mock, full stop ────────────────────────────────────
          if (FOCUS_LOADERS.has(route.name)) expect(d.text).not.toMatch(/Loading/i);
        }

        // ── F4b: double-capture self-check. Render again in the same process
        //         and require an identical serialisation, which catches
        //         order-dependent nondeterminism a single pass cannot see. ──
        const again = render(React.createElement(Screen));
        const json2 = JSON.stringify(serialize(await settle(again)), null, 2);
        expect(json2).toBe(json);

        manifest[`${profile}/${route.name}`] = {
          nodes: d.nodes, texts: d.texts, types: d.types,
        };

        const dir = dirFor(profile);
        const file = path.join(dir, `${route.name}.json`);
        if (UPDATE) {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(file, json);
        } else {
          if (!fs.existsSync(file)) {
            throw new Error(
              `No baseline at ${path.relative(root, file)}. ` +
              `Refusing to write one during a verify run — capture with SNAP_UPDATE=1.`);
          }
          expect(json).toBe(fs.readFileSync(file, 'utf8'));
        }
      });
    }
  });
}

afterAll(() => {
  if (!UPDATE) return;
  const dir = path.join(root, 'snapshots', PLATFORM);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify(manifest, null, 2));
});
