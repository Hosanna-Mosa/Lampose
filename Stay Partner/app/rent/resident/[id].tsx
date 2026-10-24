/*
 * Route: /rent/resident/[id].tsx
 *
 * The screen lives in components/rent-resident/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { ResidentRentScreen as default } from '@/components/rent-resident/ResidentRentScreen';
