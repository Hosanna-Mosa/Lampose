import { useEffect, useRef, useState } from 'react';

/* A fan of cards that unfolds when it scrolls into view and folds when it
   leaves.

   The home page's Explore section and the Partners page each had their own
   copy, identical down to the 0.4 threshold. Returns the ref to attach to the
   container and the boolean the container's class depends on.

   The observer is set up once and disconnected on unmount, exactly as both
   copies did — the empty dependency array is deliberate: the ref object is
   stable, so re-subscribing on every render would only churn. */
export function useDeckSpread(threshold = 0.4) {
  const [spread, setSpread] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const io = new IntersectionObserver(([entry]) => {
      /* Unfold when scrolling into view, fold when scrolling away. */
      setSpread(entry.isIntersecting);
    }, { threshold });

    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { spread, containerRef };
}
