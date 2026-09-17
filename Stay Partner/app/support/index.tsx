/*
 * Route: /support/index.tsx
 *
 * The screen lives in components/support-index/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { SupportTicketsScreen as default } from '@/components/support-index/SupportTicketsScreen';
