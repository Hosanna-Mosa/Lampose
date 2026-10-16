import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A pull-to-refresh spinner that shows for a PULL, and only for one.
 *
 * Screens bound `RefreshControl.refreshing` to their query's `isFetching`, and
 * that flag is also true for every refetch nobody asked for: the poll on a
 * support thread, the refetch when a screen comes back into focus, the list
 * reloading after a heart was tapped, the menus refreshing every five
 * minutes. Each of those dropped the spinner in over content somebody was
 * reading — on iOS pushing the whole list down and snapping it back. Home's
 * feed was fixed this way first (`feedPulled`); this is that fix, once.
 *
 * `refresh` may return a promise (React Query's `refetch` does) or nothing.
 */
export function usePullToRefresh(refresh: () => unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(refresh);
  latest.current = refresh;
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.resolve()
      .then(() => latest.current())
      .catch(() => {
        /* The screen shows its own error state; the spinner just stops. */
      })
      .finally(() => {
        if (mounted.current) setRefreshing(false);
      });
  }, []);

  return { refreshing, onRefresh };
}
