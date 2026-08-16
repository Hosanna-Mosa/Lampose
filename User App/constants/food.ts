/**
 * The Food module's environment gate.
 *
 * The tab ships to everyone, but what it opens is decided at build time by
 * `EXPO_PUBLIC_FOOD_MODE` in `.env`:
 *
 *   production  → the "coming soon" screen. This is the DEFAULT, and the
 *                 fallback for a missing or misspelt value — a typo in an env
 *                 file must never leak an unfinished module to real users.
 *   dev         → the in-progress Food UI, so it can be built and reviewed
 *                 behind the same tab it will ship under.
 *
 * `EXPO_PUBLIC_` is required for the value to reach the client bundle at all,
 * and it is inlined at build time — changing `.env` needs the dev server
 * restarted (`npm start -c`), not just a reload.
 */
export type FoodMode = 'dev' | 'production';

export const FOOD_MODE: FoodMode =
  process.env.EXPO_PUBLIC_FOOD_MODE === 'dev' ? 'dev' : 'production';
