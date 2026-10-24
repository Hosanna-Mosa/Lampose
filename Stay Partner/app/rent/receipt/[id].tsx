/*
 * Route: /rent/receipt/[id].tsx
 *
 * The screen lives in components/rent-receipt/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { RentReceiptScreen as default } from '@/components/rent-receipt/RentReceiptScreen';
