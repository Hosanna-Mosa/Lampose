import { useCallback, useEffect, useRef, useState } from 'react';
import visitRequestsApi from '../api/visitRequestsApi';

/* ══════════════════════════════════════════════════════════════════════════
   The state of "have I asked about this property, and what came back".

   Kept in localStorage per listing, not in React state alone. The whole point
   of the flow is that the visitor waits — through a reload, a tab switch, or
   coming back an hour later — so a request that survives only until the next
   render would strand them back at a button they have already pressed.

   Terminal answers are kept too, so the page can say "the owner replied" on a
   return visit rather than silently offering the button again.
   ══════════════════════════════════════════════════════════════════════════ */

const KEY = id => `lampose:visit:${id}`;

/*
 * Whether a request still has something to wait for.
 *
 * One predicate, used by the render ("is the loop running?") AND by the loop
 * itself ("schedule another tick?") — two copies of this rule is how the loop
 * once stopped dead on `confirmed` while the payment it was supposed to be
 * watching was still unpaid.
 *
 * `confirmed` is only the end for a free category. On a paid one the owner's
 * yes is the middle: the ₹199 is still owed, and then the slot is picked in
 * WhatsApp — both off this page, so the poll is how the page learns of them.
 */
const stillWatching = r => {
  if (!r) return false;
  if (r.status === 'pending_owner') return true;
  if (r.status !== 'confirmed') return false;   // declined / expired: over.
  if (r.payment?.required !== true) return false;
  if (r.payment?.status !== 'paid') return true;                      // owes the ₹199
  return ['slot_pending', 'manual'].includes(r.lamposeVisit?.status); // owes a slot
};

/* Polling backs off: an owner who answers does it in the first minute or two,
   and after that this is a page left open in a tab. Stops entirely after
   fifteen minutes — a window focus starts it again. */
const FIRST_DELAY = 4000;
const MAX_DELAY = 20000;
const GIVE_UP_MS = 15 * 60 * 1000;

const read = listingId => {
  try {
    const raw = localStorage.getItem(KEY(listingId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;   // private mode, or someone else's JSON. Neither is fatal.
  }
};

const write = (listingId, value) => {
  try {
    if (value) localStorage.setItem(KEY(listingId), JSON.stringify(value));
    else localStorage.removeItem(KEY(listingId));
  } catch { /* storage is a convenience here, never a requirement */ }
};

export default function useVisitRequest(listingId) {
  const [request, setRequestState] = useState(() => (listingId ? read(listingId) : null));
  const timer = useRef(null);
  const startedAt = useRef(0);

  // A different listing is a different question — drop the last one's answer.
  useEffect(() => {
    setRequestState(listingId ? read(listingId) : null);
  }, [listingId]);

  const setRequest = useCallback(next => {
    setRequestState(next);
    if (listingId) write(listingId, next);
  }, [listingId]);

  const clear = useCallback(() => setRequest(null), [setRequest]);

  const isWaiting = stillWatching(request);

  /* One poll, then schedule the next from inside itself — a fixed interval
     would stack requests if the API ever answered slower than the gap. */
  const poll = useCallback(async (delay = FIRST_DELAY) => {
    if (!request?.id) return;

    try {
      const fresh = await visitRequestsApi.status(request.id);
      setRequest(fresh);
      if (!stillWatching(fresh)) return;
    } catch (err) {
      /* The request is gone from the server — an old id in a browser that
         has been sitting on this page for a very long time. Forget it rather
         than poll a 404 forever. */
      if (err.status === 404) { clear(); return; }
      // Anything else is likely transient; keep waiting.
    }

    if (Date.now() - startedAt.current > GIVE_UP_MS) return;
    timer.current = setTimeout(
      () => poll(Math.min(delay * 1.5, MAX_DELAY)),
      delay
    );
  }, [request?.id, setRequest, clear]);

  useEffect(() => {
    if (!isWaiting) return undefined;

    startedAt.current = Date.now();
    timer.current = setTimeout(() => poll(FIRST_DELAY), FIRST_DELAY);

    /* Coming back to the tab is the strongest signal that time has passed,
       and it is exactly when a stale "waiting" looks worst. */
    const onFocus = () => {
      clearTimeout(timer.current);
      startedAt.current = Date.now();
      poll(FIRST_DELAY);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWaiting, request?.id]);

  /*
   * Re-read once, now. Called by the payment panel the moment a checkout
   * verifies, so the page flips to the paid state without waiting a poll.
   *
   * `status()` returns the request itself and THROWS on failure — it has no
   * `ok` envelope. (A guard on `res.ok` here used to make this a no-op: the
   * panel called it after every payment and the page never updated until
   * the background poll happened to land.)
   */
  const refresh = useCallback(async () => {
    if (!request?.id) return;
    try {
      const fresh = await visitRequestsApi.status(request.id);
      if (fresh) setRequest(fresh);
    } catch {
      /* A dropped refresh is not a failed payment — the poll retries. */
    }
  }, [request?.id, setRequest]);

  return { request, setRequest, clear, isWaiting, refresh };
}
