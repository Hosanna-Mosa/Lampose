/*
 * Route: /booking/checkout.tsx
 *
 * The screen lives in components/booking-checkout/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { CheckoutSheetScreen as default } from '@/components/booking-checkout/CheckoutSheetScreen';
