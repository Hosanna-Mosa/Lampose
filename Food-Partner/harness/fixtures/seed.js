/* The seeded partner. Playbook §5: "give the seeded user the widest role so no
   navigation is hidden."

   Two things here are load-bearing:

   1. `session` (F2). Nine screens carry the same gate, verbatim —
      "You are signed out. Sign in again to continue." Without a session they
      ALL render that one card, identically, before and after. Nine screens
      passing while verifying nothing.

   2. `status: 'approved'`. Unlocks app/index.tsx's signedIn branch, status.tsx's
      full stepper, and every "is live" notice.

   `data` is filled by replaying the store's OWN fillSample(1..5) action rather
   than a hand-written object, so the seed drifts in lockstep with OnboardingData
   when a field is added instead of going quietly stale. SAMPLES itself is not
   exported; fillSample is. */

const SESSION = {
  restaurantId: 'r_seed_1',
  restaurantName: 'Paradise Biryani',
  ownerName: 'Ravi Kumar Reddy',
  ownerEmail: 'ravi@paradise.test',
  token: 'seed-token',
};

function applyTo(store) {
  // Replay the app's own sample fill for all five onboarding steps.
  for (let step = 1; step <= 5; step++) store.getState().fillSample(step);
  store.setState({
    hydrated: true,
    status: 'approved',
    submittedAt: '2026-03-01T10:00:00.000Z',
    restaurantId: SESSION.restaurantId,
    verificationNote: 'Everything checked out.',
    session: SESSION,
    phoneProof: { token: 'seed-proof', at: Date.now() },
    submitting: false,
    submitError: '',
  });
}

module.exports = { SESSION, applyTo };
