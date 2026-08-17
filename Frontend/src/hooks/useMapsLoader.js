import { useEffect, useState } from 'react';

/* ══════════════════════════════════════════════════════════════════════════
   Map loader for the onboarding location picker.

   Two libraries, loaded once for the life of the tab:
     Leaflet — draws the map and the draggable pin, on free OSM tiles
     Google  — used only for Places autocomplete on the search box

   Both are injected at runtime rather than bundled, because the whole site
   ships without them and only this one form needs a map. The module-level
   flags mean a partner who steps back to step 1 gets the already-loaded
   scripts instead of a second copy of each.
   ══════════════════════════════════════════════════════════════════════════ */

let leafletReady = false;
let googleReady = false;
let started = false;
const waiting = [];

const ready = () => leafletReady && googleReady;

const settle = () => {
  if (!ready()) return;
  waiting.splice(0).forEach(notify => notify());
};

const injectScript = (src, onLoad) => {
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.addEventListener('load', onLoad);
  document.head.appendChild(script);
};

/**
 * Returns true once both libraries are on the page.
 * Without a Google key only the autocomplete is lost — the map still draws,
 * so the caller is told it is ready either way.
 */
export function useMapsLoader(apiKey) {
  const [loaded, setLoaded] = useState(ready());

  useEffect(() => {
    if (loaded) return undefined;
    if (ready()) { setLoaded(true); return undefined; }

    let live = true;
    const notify = () => { if (live) setLoaded(true); };
    waiting.push(notify);

    if (!started) {
      started = true;

      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);

      injectScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => {
        leafletReady = true;
        settle();
      });

      if (apiKey) {
        injectScript(
          `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`,
          () => { googleReady = true; settle(); },
        );
      } else {
        /* No key configured: the address fields are typed by hand and the pin
           is dragged. Waiting on a script that will never arrive would leave
           the map permanently on "Loading…". */
        googleReady = true;
      }
    }

    settle();

    return () => {
      live = false;
      const i = waiting.indexOf(notify);
      if (i !== -1) waiting.splice(i, 1);
    };
  }, [apiKey, loaded]);

  return loaded;
}

export default useMapsLoader;
