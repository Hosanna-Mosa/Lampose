/**
 * "A food order changed — read the orders again."
 *
 * A push that arrives while the app is open is the server saying an order
 * moved, but the push router has no hold on the food context, so the order
 * pinned to Home stayed as it was until something else refreshed it. The
 * router announces here; `FoodContext` listens and re-reads.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onFoodOrdersChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function announceFoodOrdersChanged(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* One broken listener must not stop the others. */
    }
  });
}
