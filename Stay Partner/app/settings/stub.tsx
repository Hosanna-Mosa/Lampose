/*
 * Route: /settings/stub.tsx
 *
 * The screen lives in components/settings-stub/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { SettingsStubScreen as default } from '@/components/settings-stub/SettingsStubScreen';
