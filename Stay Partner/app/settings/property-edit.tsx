/*
 * Route: /settings/property-edit.tsx
 *
 * The screen lives in components/settings-property-edit/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { PropertyEditScreen as default } from '@/components/settings-property-edit/PropertyEditScreen';
