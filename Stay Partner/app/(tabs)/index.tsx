/*
 * Route: /(tabs)/index.tsx
 *
 * The screen lives in components/tabs-index/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { TodayTabScreen as default } from '@/components/tabs-index/TodayTabScreen';
