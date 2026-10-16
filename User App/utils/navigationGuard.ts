import { router } from 'expo-router';

/**
 * One navigation per tap, app-wide.
 *
 * A tap that seems slow gets a second one, and every `router.push` in the app
 * — ninety-odd of them, on cards, rows, chips and buttons — used to honour
 * both: two copies of the same screen stacked, so Back led to the screen you
 * were already on and the slow tap got slower. The same double tap on a back
 * arrow popped TWO screens — from the confirmation straight past the listing.
 * Fixing that at each call site would miss the next one written.
 *
 * `useRouter()` hands every screen this same `router` object, so wrapping it
 * here covers them all:
 *
 *   - `push` and `replace` drop a REPEAT — the same href again inside
 *     `REPEAT_MS`. Going somewhere else passes straight through.
 *   - `back` drops a second back inside `BACK_REPEAT_MS`. Nothing in the app
 *     goes back twice on purpose (that is what `dismissTo` is for), and half
 *     a second is shorter than any real "back, back" a person makes.
 *
 * `navigate`, `dismiss*` and `setParams` are untouched.
 *
 * Imported once, for its side effect, by `app/_layout.tsx`.
 */

const REPEAT_MS = 800;
const BACK_REPEAT_MS = 500;

type Guarded = { guarded?: boolean };

function keyOf(href: unknown): string {
  if (typeof href === 'string') return href;
  try {
    return JSON.stringify(href);
  } catch {
    return String(href);
  }
}

/** Wraps a `(href, …)` method so the same href twice in quick succession is one call. */
function dedupeByHref<F extends (...args: never[]) => unknown>(original: F): F {
  if ((original as Guarded).guarded) return original;
  let last: { key: string; at: number } | null = null;
  const guarded = ((...args: Parameters<F>) => {
    const key = keyOf(args[0]);
    const now = Date.now();
    if (last && last.key === key && now - last.at < REPEAT_MS) return undefined;
    last = { key, at: now };
    return original(...args);
  }) as F;
  (guarded as Guarded).guarded = true;
  return guarded;
}

router.push = dedupeByHref(router.push);
router.replace = dedupeByHref(router.replace);

if (!(router.back as Guarded).guarded) {
  const originalBack = router.back;
  let lastBack = 0;
  const guardedBack: typeof router.back = () => {
    const now = Date.now();
    if (now - lastBack < BACK_REPEAT_MS) return;
    lastBack = now;
    originalBack();
  };
  (guardedBack as Guarded).guarded = true;
  router.back = guardedBack;
}
