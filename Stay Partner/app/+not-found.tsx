/*
 * Route: /+not-found.tsx
 *
 * The screen lives in components/not-found/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { NotFoundScreen as default } from '@/components/not-found/NotFoundScreen';
