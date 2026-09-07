import { AppState, type AppStateStatus } from 'react-native';
import { focusManager, onlineManager } from '@tanstack/react-query';

/**
 * Teaching react-query what "focused" means on a phone.
 *
 * ## The bug this fixes
 *
 * react-query decides whether the window is focused by looking at
 * `document.visibilityState`. There is no `document` in React Native, so
 * `refetchOnWindowFocus` — which every query in this app sets to `true` —
 * silently did nothing. It was not failing; it was never wired up.
 *
 * The symptom was specific and confusing: a new booking request would not
 * appear until the owner navigated somewhere. That is because the ONLY thing
 * still triggering a refetch was `refetchOnMount: 'always'`, which fires when
 * a screen mounts — so switching tabs "worked" and sitting still did not.
 * Bringing the app back from a pocket did nothing at all, which is the single
 * most common way an owner comes back to a request.
 *
 * `AppState` is the React Native answer to the same question, and this is the
 * recipe TanStack documents for it.
 *
 * ## Why pausing while backgrounded is the point, not a cost
 *
 * With focus known, `refetchInterval` correctly stops while the app is in the
 * background (`refetchIntervalInBackground` defaults to false) and fires a
 * fresh fetch the instant it comes forward. Before this it polled forever at a
 * fixed rate whatever the phone was doing — burning battery in a pocket and
 * still being stale on the way back, which is the worst of both.
 *
 * ## `onlineManager` is deliberately left alone
 *
 * Wiring it needs `@react-native-community/netinfo`, which is not a dependency
 * here. Without it react-query assumes the app is online and lets requests
 * fail on their own, which is the correct default: a wrong "you are offline"
 * PAUSES every query, and a stay request that goes unanswered because the
 * library guessed about connectivity is worse than one request that fails and
 * retries. This is set explicitly rather than left implicit so nobody has to
 * work out which way it defaults.
 */
export function setupQueryFocus(): () => void {
  onlineManager.setOnline(true);

  const onChange = (state: AppStateStatus) => {
    /*
     * `active` only. On iOS `inactive` is the half-second during an incoming
     * call, the app switcher, or a system prompt — treating it as focused
     * would keep polling through them, and treating it as a real background
     * is what it is.
     */
    focusManager.setFocused(state === 'active');
  };

  const subscription = AppState.addEventListener('change', onChange);

  /* Seed from wherever the app actually is right now. Without this the first
     value is whatever react-query guessed at import time, and a cold start
     that begins backgrounded (a push tap, a deep link) would start unfocused
     and never poll until the next AppState change. */
  focusManager.setFocused(AppState.currentState === 'active');

  return () => subscription.remove();
}
