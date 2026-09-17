/*
 * Route: /complaints/index.tsx
 *
 * The screen lives in components/complaints-index/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { ComplaintsScreen as default } from '@/components/complaints-index/ComplaintsScreen';
