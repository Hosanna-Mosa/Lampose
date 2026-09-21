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
 *   still hydrating           → wait
 *   no category yet           → the category choice, which is REQUIRED and
 *                               filters everything after it
 *   no locality yet           → the one-time location screen
 *   otherwise                 → home
 *
 * Auth moved to the front on 15 Aug 2026 ("an account is required for
 * everything"), and that has been reversed again: browsing needs no account,
 * same as the model before that date. `status === 'guest'` and
 * `status === 'signedIn'` are treated identically here — both proceed past
 * this gate. Only a real intent — booking a bed, ordering food, saving
 * something, filing a support ticket — asks for an account, at the screen
 * where that intent is expressed, via `requireSignIn` in `AuthContext`. A
 * status of anything else (`'hydrating'`, or the mid-code-entry
 * `'awaitingCode'`, which only exists while the auth screen itself is on
 * screen) sends a fresh launch to `/(entry)/auth`, which now offers a
 * "Skip" past itself for exactly this reason.
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

  // Guest or signed in, both browse — see the header. Anything else
  // ('hydrating' cannot reach here past `ready` above; 'awaitingCode' means
  // the auth screen itself is mid-flow) goes to sign-in, which offers "Skip".
  if (status !== 'guest' && status !== 'signedIn') return <Redirect href="/(entry)/auth" />;
  // Required, not asked-once: home cannot render a feed without it, so a null
  // category always comes back here rather than falling through to an empty
  // screen. It is also the input the location screen below is filtered by —
  // see the note above.
  if (!category) return <Redirect href="/(entry)/categories" />;
  if (!locality) return <Redirect href="/(entry)/locality" />;
  return <Redirect href="/home" />;
}
