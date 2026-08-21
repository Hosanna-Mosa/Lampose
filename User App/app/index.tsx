import { Redirect } from 'expo-router';
import React, { useState } from 'react';

import { SplashSequence } from '@/components/auth';
import { useAppState } from '@/context/AppStateContext';
import { useAuth } from '@/context/AuthContext';

/**
 * The app's entry point, and the splash.
 *
 * It decides nothing on its own — it plays the 940 ms beat while the session
 * and first-run flags hydrate, then hands over:
 *
 *   not signed in    → auth
 *   no category yet   → the category choice, which is REQUIRED and filters
 *   no locality yet   → the one-time location screen
 *   otherwise         → home
 *
 * Auth moved to the front on 15 Aug 2026, and this reverses the earlier model.
 * Browsing used to require no account at all — a guest and a signed-in user
 * landed in the same place, and login was a gate in front of requesting a bed.
 * An account is now required for everything, so it is the first thing asked
 * after the splash and nothing renders behind it.
 *
 * ## Category comes before locality, and that order is load-bearing
 *
 * Swapped 20 Aug 2026. It ran locality-then-category until then, and the
 * problem with that is not the sequence, it is that the SECOND question
 * supplies an input the FIRST one needs.
 *
 * `useListingMeta(category)` filters its whole answer by category —
 * `toLocalities(data, category)` decides which areas appear at all, and each
 * row's "2 places · ₹7,500 median" is counted within that category. Run with a
 * null category, which is exactly what the old order guaranteed on first run,
 * and the location screen offers areas that may hold nothing for the kind of
 * place the student is about to choose, priced against inventory they will
 * never be shown. The medians were the giveaway: a hotel-heavy area quoting a
 * per-night figure to somebody who then picks PG & Hostels.
 *
 * Asked in this order, every number on the location screen is already about
 * the thing they said they wanted, and `guessLocality` gets to guess within it.
 */
/**
 * Once per app launch, not once per mount of `/`.
 *
 * This has to live outside the component. `splashDone` was component state, and
 * every gate that finishes sends the student back through `/` to re-evaluate
 * the chain — auth does exactly that on success. A remount reset the state and
 * the splash played a SECOND time, between auth and the location screen.
 *
 * A module-level flag survives remounts within the same JS runtime and is
 * cleared by a real cold start, which is precisely the lifetime the splash
 * should have.
 */
let splashPlayed = false;

export default function Index() {
  const { status } = useAuth();
  const { hydrating, locality, category } = useAppState();
  const [splashDone, setSplashDone] = useState(splashPlayed);

  const ready = status !== 'hydrating' && !hydrating;

  // The splash plays out even if the checks finish early: a 300 ms flash is
  // worse than a 900 ms beat.
  if (!splashDone) {
    return (
      <SplashSequence
        waiting={!ready}
        onFinish={() => {
          splashPlayed = true;
          setSplashDone(true);
        }}
      />
    );
  }

  // Nothing renders behind this. The three intent-gates that used to push auth
  // from home, results and the listing detail are gone with it.
  if (status !== 'signedIn') return <Redirect href="/(entry)/auth" />;
  // Required, not asked-once: home cannot render a feed without it, so a null
  // category always comes back here rather than falling through to an empty
  // screen. It is also the input the location screen below is filtered by —
  // see the note above.
  if (!category) return <Redirect href="/(entry)/categories" />;
  if (!locality) return <Redirect href="/(entry)/locality" />;
  return <Redirect href="/home" />;
}
