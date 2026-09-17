/*
 * Route: /share-types/index.tsx
 *
 * The screen lives in components/share-types-index/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { ShareTypesScreen as default } from '@/components/share-types-index/ShareTypesScreen';
