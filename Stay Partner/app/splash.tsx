/*
 * Route: /splash.tsx
 *
 * The screen lives in components/splash/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { SplashRouteScreen as default } from '@/components/splash/SplashRouteScreen';
