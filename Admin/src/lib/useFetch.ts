import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiResponse } from '../api/types';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  /** The real reason a request failed — surfaced to the user, never swallowed. */
  error: string | null;
  /** True while a background refresh runs over already-rendered data. */
  refreshing: boolean;
}

/**
 * Runs a service call, tracks loading/error state, and re-runs when `deps`
 * change. Keeps the previous data on screen during a refresh so the layout
 * does not collapse on every keystroke.
 */
export function useFetch<T>(
  loader: () => Promise<ApiResponse<T>>,
  deps: unknown[] = []
): FetchState<T> & { reload: () => void } {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
    refreshing: false,
  });

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setState((prev) => ({
      ...prev,
      loading: prev.data === null,
      refreshing: prev.data !== null,
    }));

    const res = await loaderRef.current();

    // Ignore responses from superseded requests.
    if (!mounted.current || id !== requestId.current) return;

    setState({
      data: res.success ? res.data : null,
      loading: false,
      refreshing: false,
      error: res.success ? null : res.message || 'Request failed.',
    });
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run };
}

/** Debounce a value — used for search inputs so each keystroke isn't a request. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
