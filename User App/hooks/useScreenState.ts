import { useEffect, useRef, useState } from 'react';

/**
 * The state machine every screen runs.
 *
 *   idle → loading → success | empty | error
 *
 * Two rules that are easy to get wrong and expensive to fix later:
 *
 *   - A refresh keeps the current content and shows a 2pt top line. It never
 *     falls back to the skeleton, because replacing text the user is reading
 *     with grey blocks is a regression.
 *   - Stale-while-revalidate keeps the content and turns the freshness stamp
 *     amber. No layout change at all — the number is still there, it is just
 *     marked as old.
 */
export type ScreenState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

/** Below this, a skeleton flashes on fast connections and reads as a glitch. */
const MIN_SKELETON_MS = 400;

export type UseScreenStateOptions = {
  /** True while the first load is in flight. */
  loading: boolean;
  /** True when the request failed. */
  error?: boolean;
  /** True when the request succeeded but returned nothing. */
  empty?: boolean;
  /** True while a background refresh runs over existing content. */
  refreshing?: boolean;
};

export function useScreenState({
  loading,
  error = false,
  empty = false,
  refreshing = false,
}: UseScreenStateOptions): { state: ScreenState; showRefreshLine: boolean } {
  const [heldLoading, setHeldLoading] = useState(loading);
  const startedAt = useRef<number | null>(loading ? Date.now() : null);

  useEffect(() => {
    if (loading) {
      startedAt.current = Date.now();
      setHeldLoading(true);
      return;
    }

    // Hold the skeleton for its minimum so a 90ms response does not flash.
    const elapsed = startedAt.current ? Date.now() - startedAt.current : MIN_SKELETON_MS;
    const remaining = Math.max(0, MIN_SKELETON_MS - elapsed);

    if (remaining === 0) {
      setHeldLoading(false);
      return;
    }

    const timer = setTimeout(() => setHeldLoading(false), remaining);
    return () => clearTimeout(timer);
  }, [loading]);

  const state: ScreenState = heldLoading
    ? 'loading'
    : error
      ? 'error'
      : empty
        ? 'empty'
        : 'success';

  return { state, showRefreshLine: refreshing && !heldLoading };
}
