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
/* Must match the API's status values exactly — a status missing from this
   list is polled forever, because the loop only stops on a terminal one. */
const TERMINAL = ['confirmed', 'declined', 'expired'];

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

  /*
   * Still watching?
   *
   * "Waiting for the owner" is the obvious case, and it used to be the only
   * one — `confirmed` is in TERMINAL, so the loop stopped the moment the
   * owner said yes.
   *
   * That is wrong for a bachelor or co-live request, where the owner's yes is
   * the MIDDLE of the flow: a token is paid, and only then is the address
   * released. The payment happens on the Razorpay link sent over WhatsApp —
   * on the customer's phone, or in another tab — so the in-page callback that
   * normally refreshes never fires. Nothing was watching, and the page sat on
   * "pay to get the address" while the address was already in their WhatsApp.
   *
   * So: keep polling while a confirmed request still owes a token. It stops
   * the moment the money lands, which is when there is nothing left to wait
   * for.
   */
  const owesToken = request?.status === 'confirmed'
    && request?.payment?.required === true
    && request?.payment?.status !== 'paid';

  const isWaiting = request?.status === 'pending_owner' || owesToken;

  /* One poll, then schedule the next from inside itself — a fixed interval
     would stack requests if the API ever answered slower than the gap. */
  const poll = useCallback(async (delay = FIRST_DELAY) => {
    if (!request?.id) return;

    try {
      const fresh = await visitRequestsApi.status(request.id);
      setRequest(fresh);
      if (TERMINAL.includes(fresh.status)) return;
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
   * Re-read once, now.
   *
   * The polling loop above only runs while a request is WAITING, which is the
   * right rule for an unanswered one — but the token steps all happen after
   * the owner answered, so nothing was watching when paying or dating changed
   * the request server-side. This is what those steps call.
   */
  const refresh = useCallback(async () => {
    if (!request?.id) return;
    const res = await visitRequestsApi.status(request.id);
    if (res?.ok && res.data) setRequest(res.data);
  }, [request?.id, setRequest]);

  return { request, setRequest, clear, isWaiting, refresh };
}
