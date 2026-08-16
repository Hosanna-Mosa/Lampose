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
 *   no locality yet   → the one-time location screen
 *   no category yet   → the category choice, which is REQUIRED and filters
 *   otherwise         → home
 *
 * Auth moved to the front on 15 Aug 2026, and this reverses the earlier model.
 * Browsing used to require no account at all — a guest and a signed-in user
 * landed in the same place, and login was a gate in front of requesting a bed.
 * An account is now required for everything, so it is the first thing asked
 * after the splash and nothing renders behind it.
 *
 * The order within the gate is deliberate: auth, then locality, then category.
 * A student who has just proved who they are has spent their patience, and the
 * two questions after it are cheap and about them rather than about us.
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
  if (!locality) return <Redirect href="/(entry)/locality" />;
  // Required, not asked-once: home cannot render a feed without it, so a null
  // category always comes back here rather than falling through to an empty
  // screen.
  if (!category) return <Redirect href="/(entry)/categories" />;
  return <Redirect href="/home" />;
}
