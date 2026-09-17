/*
 * Route: /staff/index.tsx
 *
 * The screen lives in components/staff-index/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { StaffListScreen as default } from '@/components/staff-index/StaffListScreen';
