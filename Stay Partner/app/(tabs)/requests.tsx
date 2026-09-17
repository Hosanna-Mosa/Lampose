/*
 * Route: /(tabs)/requests.tsx
 *
 * The screen lives in components/tabs-requests/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { RequestsInboxScreen as default } from '@/components/tabs-requests/RequestsInboxScreen';
