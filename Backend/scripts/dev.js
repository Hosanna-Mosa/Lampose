/* ══════════════════════════════════════════════════════════════════════════
   `npm run dev` — the server, restarted when a file is EDITED.

     npm run dev          this: restarts when a file's modified time changes
     npm run dev:watch    the plain `node --watch server.js` it replaced

   ## Why this is not `node --watch`

   It cost a restaurant its "new order" WhatsApp, twice in three minutes.

   On Windows the watcher hears about every kind of change to a module file,
   and that includes the operating system noting that the file was READ. NTFS
   records a last-access time on any drive where that is switched on (it is
   here: `fsutil behavior query DisableLastAccess` answers "ENABLED"), at most
   once an hour per file. So the first time the server lazily loads a module
   that nothing has read for an hour — the Twilio SDK loads its message
   resource the first time a message goes out — `--watch` sees a "change",
   kills the process and starts another.

   Killing a process on Windows is immediate. No signal handler runs and no
   request in flight is allowed to finish. The diner's order had been saved and
   answered; the WhatsApp to the restaurant was being sent from the same
   process, a second later, and died with it. Twilio's log showed no attempt at
   all, which is what made it look as if nothing had been tried.

   Nothing about that is specific to the alert: it is any first use of any
   module after a quiet hour, on any request. The alert is where it was seen.

   ## What this does instead

   It runs `node server.js` and restarts it when a file's MODIFIED time moves.
   A read moves the access time and nothing else, so it is ignored. Everything
   a person actually does — saving a file, adding one, deleting one, editing
   `.env` — still restarts the server, which is the whole point of a dev script.

   ## What is watched

   `src/`, `routes/` and the files at the top of the folder (`server.js`,
   `app.js`, `package.json`, `.env`). Not `node_modules/`, and not `data/`,
   where the scraper writes: a server that restarts over its own output never
   stays up long enough to be used.

   Production does not use this. It runs `node server.js` under the platform's
   own supervisor, and stops through SIGTERM, which `server.js` answers.
   ══════════════════════════════════════════════════════════════════════════ */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = process.argv[2] || 'server.js';

/* Saving a file usually reports two or three events, and a formatter on save
   adds one more. One restart for the lot. */
const DEBOUNCE_MS = 200;

/* A server that ignores SIGTERM is killed, so that the next one can have the port. */
const KILL_AFTER_MS = 8000;

const TREES = ['src', 'routes'];
const CODE_FILE = /\.(?:js|cjs|mjs|json)$/;
const TOP_LEVEL_FILE = /^(?:.*\.(?:js|cjs|mjs|json)|\.env)$/;

const isWatched = (file) => (
  path.dirname(file) === ROOT
    ? TOP_LEVEL_FILE.test(path.basename(file))
    : CODE_FILE.test(file)
);

/** The modified time, or null when there is no such file (yet, or any more). */
const mtimeOf = (file) => {
  try {
    const stats = fs.statSync(file);
    return stats.isFile() ? stats.mtimeMs : null;
  } catch {
    return null;
  }
};

/** Every file under `dir`, folders included, or only the files directly in it. */
const files = (dir, { deep }) => {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) return [full];
    return deep ? files(full, { deep }) : [];
  });
};

/* What each file's modified time was the last time anybody looked. An event
   whose file still has this time was a read, and is ignored. */
const known = new Map();
[
  ...files(ROOT, { deep: false }),
  ...TREES.flatMap((tree) => files(path.join(ROOT, tree), { deep: true })),
].forEach((file) => {
  if (isWatched(file)) known.set(file, mtimeOf(file));
});

/* ── The server ─────────────────────────────────────────────────────────── */

let child = null;

const launch = () => {
  const me = spawn(process.execPath, [ENTRY], { cwd: ROOT, stdio: 'inherit' });
  child = me;
  me.on('exit', (code, signal) => {
    if (child !== me) return; // stopped on purpose, to be replaced
    child = null;
    console.log(`[dev] ${ENTRY} exited (${signal || `code ${code}`}). Waiting for a file to change.`);
  });
};

const stop = () => new Promise((resolve) => {
  const dying = child;
  if (!dying) {
    resolve();
    return;
  }
  child = null;
  const backstop = setTimeout(() => dying.kill('SIGKILL'), KILL_AFTER_MS);
  dying.once('exit', () => {
    clearTimeout(backstop);
    resolve();
  });
  dying.kill();
});

let restarting = false;
let pending = null;

const restart = async (why) => {
  if (restarting) {
    pending = why;
    return;
  }
  restarting = true;
  console.log(`\n[dev] ${why} changed. Restarting.\n`);
  await stop();
  launch();
  restarting = false;
  if (pending) {
    const next = pending;
    pending = null;
    restart(next);
  }
};

let timer = null;
const restartSoon = (why) => {
  clearTimeout(timer);
  timer = setTimeout(() => restart(why), DEBOUNCE_MS);
};

/* ── The watching ───────────────────────────────────────────────────────── */

const onEvent = (base) => (eventType, name) => {
  if (!name) return;
  const file = path.join(base, String(name));
  if (!isWatched(file)) return;

  const now = mtimeOf(file);
  const before = known.has(file) ? known.get(file) : null;
  if (now === before) return; // read, or never there: nothing was edited

  if (now === null) known.delete(file);
  else known.set(file, now);
  restartSoon(path.relative(ROOT, file));
};

const watch = (dir, options) => {
  try {
    fs.watch(dir, options, onEvent(dir));
  } catch (error) {
    console.warn(`[dev] cannot watch ${path.relative(ROOT, dir) || '.'}: ${error.message}`);
  }
};

watch(ROOT, {});
TREES.forEach((tree) => watch(path.join(ROOT, tree), { recursive: true }));

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, async () => {
    await stop();
    process.exit(0);
  });
});

console.log(`[dev] running ${ENTRY}; restarting when a file in ${TREES.join(', ')} or the top folder is edited.`);
launch();
