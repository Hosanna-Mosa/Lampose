/*
 * Route: /reviews/index.tsx
 *
 * The screen lives in components/reviews-index/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { ReviewsListScreen as default } from '@/components/reviews-index/ReviewsListScreen';
