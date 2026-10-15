/**
 * A one-value store that React reads through `useSyncExternalStore`.
 *
 * For a value that changes often, or from outside React (a scroll position
 * crossing a line, a bar sliding away), but that only a FEW components need:
 * holding it as state in the screen that owns it re-renders that whole screen
 * on every change, where a store re-renders only the components subscribed.
 */
export type ValueStore<T> = {
  get: () => T;
  set: (next: T) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
