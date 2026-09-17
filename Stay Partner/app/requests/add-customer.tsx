/*
 * Route: /requests/add-customer.tsx
 *
 * The screen lives in components/requests-add-customer/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { AddCustomerScreen as default } from '@/components/requests-add-customer/AddCustomerScreen';
