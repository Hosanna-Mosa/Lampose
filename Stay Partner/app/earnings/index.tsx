/*
 * Route: /earnings/index.tsx
 *
 * The screen lives in components/earnings-index/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { EarningsScreen as default } from '@/components/earnings-index/EarningsScreen';
